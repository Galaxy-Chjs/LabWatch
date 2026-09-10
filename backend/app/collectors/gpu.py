"""NVIDIA GPU collection through NVML (``nvidia-ml-py``).

The collector is defensive by design:

* NVML is initialised lazily and never more than once;
* NVML is not thread safe, so all calls are serialised behind a lock;
* a missing driver, a missing GPU or an unsupported sensor degrades to
  ``available=False`` / ``None`` instead of raising;
* processes that exit between the NVML query and the psutil lookup are
  silently skipped.

Per-process CPU usage is a delta between two samples, so the collector keeps
a small cache of :class:`psutil.Process` objects between polls. The first poll
after startup reports ``None`` for CPU; every later poll reports the average
utilisation over the elapsed interval.
"""

from __future__ import annotations

import contextlib
import logging
import threading
import time
from dataclasses import dataclass

import psutil

try:  # pragma: no cover - import guard exercised via monkeypatching
    import pynvml
except Exception:  # pragma: no cover  # noqa: BLE001
    pynvml = None  # type: ignore[assignment]

from ..schemas import GpuCollection, GpuProcess, GpuStatus, ProcessCollection

logger = logging.getLogger(__name__)

_MB = 1024 * 1024


def mb_to_bytes(value: float | None) -> int | None:
    """Convert a NVML megabyte value to bytes."""
    if value is None:
        return None
    return int(value * _MB)


def _as_float(value) -> float | None:
    """Best effort float conversion; ``None`` when unsupported."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@dataclass
class _GpuHandle:
    """A NVML device handle plus the metadata read at discovery time."""

    index: int
    handle: object
    uuid: str | None
    name: str | None


class NvmlGpuCollector:
    """Reads live GPU state and GPU compute processes from NVML."""

    def __init__(
        self,
        collect_commands: bool = True,
        process_limit: int = 64,
        include_graphics_processes: bool = False,
    ) -> None:
        self.collect_commands = collect_commands
        self.process_limit = process_limit
        self.include_graphics_processes = include_graphics_processes
        self._lock = threading.RLock()
        self._initialised = False
        self._init_error: str | None = None
        self._handles: list[_GpuHandle] = []
        self._driver_version: str | None = None
        self._cuda_version: str | None = None
        self._nvml_version: str | None = None
        self._logged_unavailable = False
        self._cpu_prime: dict[int, psutil.Process] = {}
        self._cpu_prime_lock = threading.Lock()

    # -- lifecycle ---------------------------------------------------------
    def _ensure_initialised(self) -> bool:
        """Initialise NVML once; returns ``True`` when usable."""
        with self._lock:
            if self._initialised:
                return True
            if self._init_error is not None:
                return False
            if pynvml is None:
                self._init_error = "nvidia-ml-py is not installed"
                logger.warning("NVML unavailable: %s", self._init_error)
                return False
            try:
                pynvml.nvmlInit()
                self._nvml_version = self._read_version("nvmlSystemGetNVMLVersion")
                self._driver_version = self._read_version("nvmlSystemGetDriverVersion")
                self._cuda_version = self._read_version(
                    "nvmlSystemGetCudaDriverVersion_v2"
                ) or self._read_version("nvmlSystemGetCudaDriverVersion")
                self._handles = self._discover_devices()
                self._initialised = True
                logger.info(
                    "NVML initialised: driver=%s cuda_driver=%s gpus=%d",
                    self._driver_version,
                    self._cuda_version,
                    len(self._handles),
                )
                return True
            except Exception as exc:  # noqa: BLE001 - NVML raises its own types
                self._init_error = f"{type(exc).__name__}: {exc}"
                if not self._logged_unavailable:
                    logger.warning("NVML unavailable: %s", self._init_error)
                    self._logged_unavailable = True
                return False

    def _read_version(self, func_name: str) -> str | None:
        """Read a ``nvmlSystemGet*Version`` value, formatting CUDA versions."""
        func = getattr(pynvml, func_name, None)
        if func is None:
            return None
        try:
            raw = func()
        except Exception:  # noqa: BLE001
            return None
        if raw is None:
            return None
        if "Cuda" in func_name:
            # NVML returns an integer like 12040 -> CUDA 12.4
            try:
                major = int(raw) // 1000
                minor = (int(raw) % 1000) // 10
                return f"{major}.{minor}"
            except (TypeError, ValueError):
                return str(raw)
        return str(raw)

    def _discover_devices(self) -> list[_GpuHandle]:
        """Enumerate NVML devices."""
        handles: list[_GpuHandle] = []
        try:
            count = pynvml.nvmlDeviceGetCount()
        except Exception as exc:  # noqa: BLE001
            logger.warning("NVML device enumeration failed: %s", exc)
            return handles
        for index in range(count):
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(index)
                uuid = self._decode(pynvml.nvmlDeviceGetUUID(handle))
                name = self._decode(pynvml.nvmlDeviceGetName(handle))
            except Exception as exc:  # noqa: BLE001
                logger.debug("Skipping GPU %s: %s", index, exc)
                continue
            handles.append(_GpuHandle(index=index, handle=handle, uuid=uuid, name=name))
        return handles

    @staticmethod
    def _decode(value) -> str | None:
        """NVML returns either ``str`` or ``bytes`` depending on version."""
        if value is None:
            return None
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        return str(value)

    @property
    def available(self) -> bool:
        """Whether NVML produced usable device handles."""
        return self._ensure_initialised() and bool(self._handles)

    @property
    def init_error(self) -> str | None:
        """Human readable reason GPUs are unavailable, if any."""
        if self._ensure_initialised():
            return None if self._handles else "No NVIDIA GPU detected"
        return self._init_error

    # -- per-GPU reads -----------------------------------------------------
    def _gpu_status(self, device: _GpuHandle) -> GpuStatus:
        """Read every metric for a single device, tolerating unsupported sensors."""
        handle = device.handle
        utilization = None
        memory_used = memory_total = memory_percent = None
        try:
            rates = pynvml.nvmlDeviceGetUtilizationRates(handle)
            utilization = _as_float(rates.gpu)
        except Exception:  # noqa: BLE001
            utilization = None
        try:
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            memory_total = int(mem.total)
            memory_used = int(mem.used)
            if memory_total:
                memory_percent = round(memory_used / memory_total * 100.0, 1)
        except Exception:  # noqa: BLE001
            pass
        try:
            temperature = _as_float(pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))
        except Exception:  # noqa: BLE001
            temperature = None
        power_watts = None
        raw_power = None
        try:
            raw_power = _as_float(pynvml.nvmlDeviceGetPowerUsage(handle))
        except Exception:  # noqa: BLE001
            raw_power = None
        if raw_power is not None:
            power_watts = round(raw_power / 1000.0, 1)
        power_limit = None
        raw_limit = None
        try:
            raw_limit = _as_float(pynvml.nvmlDeviceGetEnforcedPowerLimit(handle))
        except Exception:  # noqa: BLE001
            raw_limit = None
        if raw_limit is not None:
            power_limit = round(raw_limit / 1000.0, 1)
        try:
            fan = _as_float(pynvml.nvmlDeviceGetFanSpeed(handle))
        except Exception:  # noqa: BLE001
            fan = None
        try:
            sm_clock = _as_float(pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_SM))
        except Exception:  # noqa: BLE001
            sm_clock = None
        try:
            mem_clock = _as_float(pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_MEM))
        except Exception:  # noqa: BLE001
            mem_clock = None
        try:
            persistence = bool(pynvml.nvmlDeviceGetPersistenceMode(handle))
        except Exception:  # noqa: BLE001
            persistence = None
        try:
            process_count = len(pynvml.nvmlDeviceGetComputeRunningProcesses(handle))
        except Exception:  # noqa: BLE001
            process_count = None

        return GpuStatus(
            index=device.index,
            uuid=device.uuid,
            name=device.name,
            utilization_percent=utilization,
            memory_used=memory_used,
            memory_total=memory_total,
            memory_percent=memory_percent,
            temperature_c=temperature,
            power_watts=power_watts,
            power_limit_watts=power_limit,
            fan_percent=fan,
            clocks_sm_mhz=sm_clock,
            clocks_mem_mhz=mem_clock,
            persistence_mode=persistence,
            process_count=process_count,
        )

    # -- process reads -----------------------------------------------------
    def _raw_processes(self, device: _GpuHandle) -> list[tuple[int, int | None, str | None]]:
        """Return ``(pid, gpu_memory_bytes, type)`` tuples for one device."""
        results: list[tuple[int, int | None, str | None]] = []
        getters = [("nvmlDeviceGetComputeRunningProcesses", "C")]
        if self.include_graphics_processes:
            getters.append(("nvmlDeviceGetGraphicsRunningProcesses", "G"))
        for getter_name, kind in getters:
            getter = getattr(pynvml, getter_name, None)
            if getter is None:
                continue
            try:
                procs = getter(device.handle)
            except Exception as exc:  # noqa: BLE001
                logger.debug("%s failed on GPU %s: %s", getter_name, device.index, exc)
                continue
            for proc in procs or []:
                pid = getattr(proc, "pid", None)
                if pid is None:
                    continue
                used = getattr(proc, "usedGpuMemory", None)
                # NVML reports a huge sentinel when memory is unknown.
                memory = int(used) if isinstance(used, int) and 0 <= used < (1 << 62) else None
                results.append((int(pid), memory, kind))
        return results

    def _prime_cpu(self, pids: list[int]) -> None:
        """Record CPU counter baselines for the given pids."""
        with self._cpu_prime_lock:
            fresh: dict[int, psutil.Process] = {}
            for pid in pids:
                cached = self._cpu_prime.get(pid)
                if cached is not None:
                    fresh[pid] = cached
                    continue
                try:
                    proc = psutil.Process(pid)
                    proc.cpu_percent(interval=None)
                except Exception:  # noqa: BLE001
                    continue
                fresh[pid] = proc
            self._cpu_prime = fresh

    def _cpu_percent(self, pid: int) -> float | None:
        """CPU usage since the previous poll, or ``None`` for a first sighting."""
        with self._cpu_prime_lock:
            proc = self._cpu_prime.get(pid)
            if proc is None:
                return None
        try:
            value = proc.cpu_percent(interval=None)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, OSError):
            return None
        except Exception:  # noqa: BLE001
            return None
        return round(float(value), 1)

    def _enrich(
        self,
        pid: int,
        gpu_index: int,
        gpu_uuid: str | None,
        gpu_memory: int | None,
        kind: str | None,
    ) -> GpuProcess | None:
        """Attach OS level details to a GPU process; ``None`` if it exited."""
        try:
            proc = psutil.Process(pid)
            with proc.oneshot():
                name = proc.name()
                status = proc.status()
                memory_rss = proc.memory_info().rss
                start_time = proc.create_time()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, OSError):
            # The process vanished or is not inspectable: skip it quietly.
            return None
        except Exception as exc:  # noqa: BLE001 - never let enrichment break the sample
            logger.debug("Process enrichment failed for pid %s: %s", pid, exc)
            return None

        username = None
        try:
            username = proc.username()
        except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
            username = None
        except Exception:  # noqa: BLE001
            username = None

        command = None
        if self.collect_commands:
            try:
                parts = proc.cmdline()
                if parts:
                    command = " ".join(parts)
            except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
                command = None
            except Exception:  # noqa: BLE001
                command = None

        cpu_percent = self._cpu_percent(pid)
        now = time.time()
        return GpuProcess(
            pid=pid,
            gpu_index=gpu_index,
            gpu_uuid=gpu_uuid,
            gpu_memory=gpu_memory,
            name=name,
            command=command,
            username=username,
            cpu_percent=cpu_percent,
            memory_rss=int(memory_rss) if memory_rss is not None else None,
            status=status,
            start_time=float(start_time) if start_time else None,
            runtime_seconds=max(0.0, now - float(start_time)) if start_time else None,
            type=kind,
        )

    # -- public API --------------------------------------------------------
    def collect_gpus(self) -> GpuCollection:
        """Collect the live state of every GPU."""
        now = time.time()
        if not self._ensure_initialised() or not self._handles:
            return GpuCollection(
                available=False,
                error=self.init_error or "NVIDIA GPU unavailable",
                driver_version=self._driver_version,
                cuda_version=self._cuda_version,
                nvml_version=self._nvml_version,
                collected_at=now,
            )
        gpus: list[GpuStatus] = []
        with self._lock:
            for device in self._handles:
                try:
                    gpus.append(self._gpu_status(device))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Failed to read GPU %s: %s", device.index, exc)
        for gpu in gpus:
            gpu.collected_at = now
        return GpuCollection(
            available=True,
            driver_version=self._driver_version,
            cuda_version=self._cuda_version,
            nvml_version=self._nvml_version,
            gpus=gpus,
            collected_at=now,
        )

    def collect_processes(self) -> ProcessCollection:
        """Collect GPU compute processes enriched with psutil details."""
        now = time.time()
        if not self._ensure_initialised() or not self._handles:
            return ProcessCollection(
                available=False,
                error=self.init_error or "NVIDIA GPU unavailable",
                collected_at=now,
            )

        raw: list[tuple[int, int | None, str | None, int, str | None]] = []
        with self._lock:
            for device in self._handles:
                for pid, memory, kind in self._raw_processes(device):
                    raw.append((pid, memory, kind, device.index, device.uuid))

        # Snapshot CPU counters before enrichment so the next poll has a delta.
        self._prime_cpu([pid for pid, _, _, _, _ in raw])

        processes: list[GpuProcess] = []
        seen: set[tuple[int, int]] = set()
        for pid, memory, kind, gpu_index, gpu_uuid in raw[: self.process_limit]:
            key = (pid, gpu_index)
            if key in seen:
                continue
            seen.add(key)
            enriched = self._enrich(pid, gpu_index, gpu_uuid, memory, kind)
            if enriched is not None:
                processes.append(enriched)

        processes.sort(key=lambda p: (-(p.gpu_memory or 0), p.pid))
        return ProcessCollection(available=True, processes=processes, collected_at=now)

    def shutdown(self) -> None:
        """Release NVML resources."""
        with self._lock:
            if self._initialised and pynvml is not None:
                with contextlib.suppress(Exception):
                    pynvml.nvmlShutdown()
            self._initialised = False
            self._handles = []
        with self._cpu_prime_lock:
            self._cpu_prime.clear()
