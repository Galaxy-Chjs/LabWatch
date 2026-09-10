"""Tests for the NVML GPU collector.

The collector is exercised through a fake NVML implementation so the suite runs
on machines without an NVIDIA GPU, and so failure modes (missing driver,
unsupported sensor, vanished process) can be reproduced deterministically.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import psutil
import pytest

from app.collectors import gpu as gpu_module
from app.collectors.gpu import NvmlGpuCollector, mb_to_bytes

NVML_TEMPERATURE_GPU = 0
NVML_CLOCK_SM = 1
NVML_CLOCK_MEM = 2


class NvmlError(Exception):
    """Stand-in for ``pynvml.NVMLError``."""


@dataclass
class _Rates:
    gpu: int
    memory: int


@dataclass
class _Memory:
    total: int
    used: int
    free: int


@dataclass
class _Proc:
    pid: int
    usedGpuMemory: int | None


class FakeNvml:
    """Configurable fake of the subset of ``pynvml`` LabWatch uses."""

    NVML_TEMPERATURE_GPU = NVML_TEMPERATURE_GPU
    NVML_CLOCK_SM = NVML_CLOCK_SM
    NVML_CLOCK_MEM = NVML_CLOCK_MEM

    def __init__(
        self,
        gpu_count: int = 2,
        *,
        fail_init: bool = False,
        missing: set[str] | None = None,
        failing: set[str] | None = None,
        compute_procs: list[_Proc] | None = None,
        graphics_procs: list[_Proc] | None = None,
    ) -> None:
        self.gpu_count = gpu_count
        self.fail_init = fail_init
        self.missing = missing or set()
        self.failing = failing or set()
        self.compute_procs = compute_procs if compute_procs is not None else []
        self.graphics_procs = graphics_procs if graphics_procs is not None else []

    # -- helpers -----------------------------------------------------------
    def __getattr__(self, name: str):
        # Any attribute listed in ``missing`` behaves like an old NVML build.
        if name in self.missing:
            raise AttributeError(name)
        raise AttributeError(name)

    def _maybe_fail(self, name: str) -> None:
        if name in self.failing:
            raise NvmlError(f"{name} not supported")

    # -- system ------------------------------------------------------------
    def nvmlInit(self) -> None:
        if self.fail_init:
            raise NvmlError("NVML Shared Library Not Found")

    def nvmlShutdown(self) -> None:
        return None

    def nvmlSystemGetNVMLVersion(self) -> str:
        return "12.550.107.02"

    def nvmlSystemGetDriverVersion(self) -> str:
        return "550.107.02"

    def nvmlSystemGetCudaDriverVersion_v2(self) -> int:
        return 12040

    def nvmlDeviceGetCount(self) -> int:
        return self.gpu_count

    # -- device ------------------------------------------------------------
    def _index(self, handle) -> int:
        return int(handle)

    def nvmlDeviceGetHandleByIndex(self, index: int) -> int:
        if index >= self.gpu_count:
            raise NvmlError("Invalid index")
        return index

    def nvmlDeviceGetUUID(self, handle) -> str:
        if self._index(handle) == 0 and "uuid" in self.failing:
            raise NvmlError("unsupported")
        return f"GPU-fake{self._index(handle):04d}"

    def nvmlDeviceGetName(self, handle) -> str:
        return f"Fake GPU {self._index(handle)}"

    def nvmlDeviceGetUtilizationRates(self, handle) -> _Rates:
        self._maybe_fail("nvmlDeviceGetUtilizationRates")
        return _Rates(gpu=10 * (self._index(handle) + 1), memory=5)

    def nvmlDeviceGetMemoryInfo(self, handle) -> _Memory:
        self._maybe_fail("nvmlDeviceGetMemoryInfo")
        total = 8 * 1024**3
        used = 2 * 1024**3
        return _Memory(total=total, used=used, free=total - used)

    def nvmlDeviceGetTemperature(self, handle, sensor) -> int:
        self._maybe_fail("nvmlDeviceGetTemperature")
        return 65 + self._index(handle)

    def nvmlDeviceGetPowerUsage(self, handle) -> int:
        self._maybe_fail("nvmlDeviceGetPowerUsage")
        return 150_000

    def nvmlDeviceGetEnforcedPowerLimit(self, handle) -> int:
        self._maybe_fail("nvmlDeviceGetEnforcedPowerLimit")
        return 300_000

    def nvmlDeviceGetFanSpeed(self, handle) -> int:
        self._maybe_fail("nvmlDeviceGetFanSpeed")
        return 40

    def nvmlDeviceGetClockInfo(self, handle, clock_type) -> int:
        self._maybe_fail("nvmlDeviceGetClockInfo")
        return 1800 if clock_type == NVML_CLOCK_SM else 9000

    def nvmlDeviceGetPersistenceMode(self, handle) -> int:
        self._maybe_fail("nvmlDeviceGetPersistenceMode")
        return 0

    def nvmlDeviceGetComputeRunningProcesses(self, handle):
        self._maybe_fail("nvmlDeviceGetComputeRunningProcesses")
        return list(self.compute_procs)

    def nvmlDeviceGetGraphicsRunningProcesses(self, handle):
        self._maybe_fail("nvmlDeviceGetGraphicsRunningProcesses")
        return list(self.graphics_procs)


def make_collector(fake: FakeNvml, **kwargs) -> NvmlGpuCollector:
    """Build a collector already initialised against ``fake``."""
    collector = NvmlGpuCollector(**kwargs)
    collector._initialised = True
    collector._driver_version = fake.nvmlSystemGetDriverVersion()
    collector._cuda_version = "12.4"
    collector._nvml_version = fake.nvmlSystemGetNVMLVersion()
    collector._handles = [
        gpu_module._GpuHandle(
            index=index,
            handle=fake.nvmlDeviceGetHandleByIndex(index),
            uuid=fake.nvmlDeviceGetUUID(index),
            name=fake.nvmlDeviceGetName(index),
        )
        for index in range(fake.gpu_count)
    ]
    return collector


@pytest.fixture
def patch_pynvml(monkeypatch):
    """Install a fake ``pynvml`` module globally for one test."""

    def _install(fake: FakeNvml) -> FakeNvml:
        monkeypatch.setattr(gpu_module, "pynvml", fake)
        return fake

    return _install


# --------------------------------------------------------------------------- #
# Discovery / lifecycle
# --------------------------------------------------------------------------- #
def test_initialises_and_reports_versions(patch_pynvml):
    patch_pynvml(FakeNvml(gpu_count=2))
    collector = NvmlGpuCollector()

    assert collector.available is True
    assert collector.init_error is None

    collection = collector.collect_gpus()
    assert collection.available is True
    assert collection.driver_version == "550.107.02"
    assert collection.cuda_version == "12.4"
    assert [g.index for g in collection.gpus] == [0, 1]


def test_missing_driver_is_graceful(patch_pynvml):
    patch_pynvml(FakeNvml(fail_init=True))
    collector = NvmlGpuCollector()

    assert collector.available is False
    assert "NvmlError" in (collector.init_error or "")

    collection = collector.collect_gpus()
    assert collection.available is False
    assert collection.gpus == []
    assert collection.error

    processes = collector.collect_processes()
    assert processes.available is False
    assert processes.processes == []
    assert processes.error


def test_no_gpu_present(patch_pynvml):
    patch_pynvml(FakeNvml(gpu_count=0))
    collector = NvmlGpuCollector()

    assert collector.available is False
    assert collector.init_error == "No NVIDIA GPU detected"
    assert collector.collect_gpus().gpus == []


def test_pynvml_not_installed(monkeypatch):
    monkeypatch.setattr(gpu_module, "pynvml", None)
    collector = NvmlGpuCollector()

    assert collector.available is False
    assert collector.init_error == "nvidia-ml-py is not installed"
    assert collector.collect_gpus().available is False


def test_initialisation_is_attempted_only_once(patch_pynvml):
    fake = patch_pynvml(FakeNvml(gpu_count=1))
    calls = {"n": 0}
    original = fake.nvmlInit

    def counting_init():
        calls["n"] += 1
        return original()

    fake.nvmlInit = counting_init  # type: ignore[method-assign]
    collector = NvmlGpuCollector()
    assert collector.available is True
    collector.collect_gpus()
    collector.collect_gpus()
    assert calls["n"] == 1


def test_shutdown_clears_handles(patch_pynvml):
    patch_pynvml(FakeNvml(gpu_count=1))
    collector = NvmlGpuCollector()
    assert collector.available is True
    collector.shutdown()
    assert collector._handles == []


# --------------------------------------------------------------------------- #
# GPU metrics
# --------------------------------------------------------------------------- #
def test_gpu_metrics_are_mapped_correctly(patch_pynvml):
    fake = patch_pynvml(FakeNvml(gpu_count=2))
    gpu = make_collector(fake).collect_gpus().gpus[0]

    assert gpu.index == 0
    assert gpu.name == "Fake GPU 0"
    assert gpu.uuid == "GPU-fake0000"
    assert gpu.utilization_percent == 10.0
    assert gpu.memory_total == 8 * 1024**3
    assert gpu.memory_used == 2 * 1024**3
    assert gpu.memory_percent == 25.0
    assert gpu.temperature_c == 65.0
    assert gpu.power_watts == 150.0
    assert gpu.power_limit_watts == 300.0
    assert gpu.power_percent == 50.0
    assert gpu.fan_percent == 40.0
    assert gpu.clocks_sm_mhz == 1800.0
    assert gpu.clocks_mem_mhz == 9000.0
    assert gpu.persistence_mode is False


def test_unsupported_power_reports_none(patch_pynvml):
    fake = patch_pynvml(FakeNvml(gpu_count=1, failing={"nvmlDeviceGetPowerUsage", "nvmlDeviceGetEnforcedPowerLimit"}))
    gpu = make_collector(fake).collect_gpus().gpus[0]

    assert gpu.power_watts is None
    assert gpu.power_limit_watts is None
    assert gpu.power_percent is None
    # Unaffected metrics still work.
    assert gpu.utilization_percent == 10.0


def test_unsupported_fan_and_clocks_report_none(patch_pynvml):
    fake = patch_pynvml(
        FakeNvml(
            gpu_count=1,
            failing={"nvmlDeviceGetFanSpeed", "nvmlDeviceGetClockInfo", "nvmlDeviceGetPersistenceMode"},
        )
    )
    gpu = make_collector(fake).collect_gpus().gpus[0]

    assert gpu.fan_percent is None
    assert gpu.clocks_sm_mhz is None
    assert gpu.clocks_mem_mhz is None
    assert gpu.persistence_mode is None


def test_unsupported_memory_reports_none(patch_pynvml):
    fake = patch_pynvml(FakeNvml(gpu_count=1, failing={"nvmlDeviceGetMemoryInfo"}))
    gpu = make_collector(fake).collect_gpus().gpus[0]

    assert gpu.memory_used is None
    assert gpu.memory_total is None
    assert gpu.memory_percent is None


def test_bytes_sentinel_from_nvml_is_dropped(patch_pynvml):
    fake = patch_pynvml(FakeNvml(gpu_count=1))
    collector = make_collector(fake)
    # A huge sentinel means "unknown" and must not be reported as a real value.
    fake.compute_procs = [_Proc(pid=psutil.Process().pid, usedGpuMemory=(1 << 64) - 1)]
    processes = collector.collect_processes()
    assert processes.processes[0].gpu_memory is None


def test_mb_to_bytes():
    assert mb_to_bytes(1024) == 1024 * 1024 * 1024
    assert mb_to_bytes(0) == 0
    assert mb_to_bytes(None) is None


# --------------------------------------------------------------------------- #
# GPU processes
# --------------------------------------------------------------------------- #
def test_compute_processes_are_enriched(patch_pynvml):
    me = psutil.Process()
    fake = patch_pynvml(FakeNvml(gpu_count=1, compute_procs=[_Proc(pid=me.pid, usedGpuMemory=1024 * 1024 * 512)]))
    collector = make_collector(fake, collect_commands=True)

    processes = collector.collect_processes()
    assert processes.available is True
    assert len(processes.processes) == 1
    proc = processes.processes[0]
    assert proc.pid == me.pid
    assert proc.gpu_index == 0
    assert proc.gpu_memory == 512 * 1024 * 1024
    assert proc.name
    assert proc.runtime_seconds is not None and proc.runtime_seconds >= 0
    assert proc.runtime_human is not None
    assert proc.type == "C"


def test_first_poll_may_report_no_cpu_then_reports_delta(patch_pynvml):
    """The first sighting establishes a baseline; later polls report a number.

    CPU usage is a delta between two counter reads, so it cannot be asserted to
    be non-zero (a loaded CI box may report anything). What matters is that the
    collector returns ``None`` only when it has no baseline, and a float
    afterwards.
    """
    me = psutil.Process()
    fake = patch_pynvml(FakeNvml(gpu_count=1, compute_procs=[_Proc(pid=me.pid, usedGpuMemory=1024)]))
    collector = make_collector(fake)

    # First sighting: primed before enrichment, so the delta is zero or unknown.
    first = collector.collect_processes().processes[0]
    assert first.cpu_percent is None or first.cpu_percent >= 0.0

    # Burn CPU so the counters have demonstrably moved on.
    deadline = time.time() + 0.05
    while time.time() < deadline:
        pass

    second = collector.collect_processes().processes[0]
    assert isinstance(second.cpu_percent, float)
    assert second.cpu_percent >= 0.0


def test_cpu_percent_is_none_without_a_baseline(patch_pynvml):
    """A pid the collector has never primed reports ``None``, not a fake zero."""
    me = psutil.Process()
    fake = patch_pynvml(FakeNvml(gpu_count=1, compute_procs=[_Proc(pid=me.pid, usedGpuMemory=1024)]))
    collector = make_collector(fake)

    assert collector._cpu_percent(me.pid) is None


def test_cpu_baseline_cache_is_replaced_on_each_poll(patch_pynvml):
    """Only processes seen in the current poll keep a cached baseline."""
    me = psutil.Process()
    fake = patch_pynvml(FakeNvml(gpu_count=1, compute_procs=[_Proc(pid=me.pid, usedGpuMemory=1024)]))
    collector = make_collector(fake)

    collector.collect_processes()
    assert me.pid in collector._cpu_prime

    # The process is gone from the next poll, so its baseline must be dropped.
    fake.compute_procs = []
    collector.collect_processes()
    assert collector._cpu_prime == {}


def test_exited_process_is_ignored(patch_pynvml):
    # PID 999999 is essentially guaranteed not to exist.
    fake = patch_pynvml(
        FakeNvml(
            gpu_count=1,
            compute_procs=[
                _Proc(pid=999_999, usedGpuMemory=1024),
                _Proc(pid=psutil.Process().pid, usedGpuMemory=2048),
            ],
        )
    )
    processes = make_collector(fake).collect_processes()

    assert [p.pid for p in processes.processes] == [psutil.Process().pid]


def test_graphics_processes_excluded_by_default(patch_pynvml):
    fake = patch_pynvml(
        FakeNvml(
            gpu_count=1,
            compute_procs=[_Proc(pid=psutil.Process().pid, usedGpuMemory=1024)],
            graphics_procs=[_Proc(pid=4, usedGpuMemory=None)],
        )
    )
    processes = make_collector(fake).collect_processes()
    assert [p.pid for p in processes.processes] == [psutil.Process().pid]


def test_graphics_processes_included_when_requested(patch_pynvml):
    me = psutil.Process()
    fake = patch_pynvml(
        FakeNvml(
            gpu_count=1,
            compute_procs=[_Proc(pid=me.pid, usedGpuMemory=1024)],
            graphics_procs=[_Proc(pid=4, usedGpuMemory=None)],
        )
    )
    collector = make_collector(fake, include_graphics_processes=True)
    processes = collector.collect_processes()
    assert {p.pid for p in processes.processes} == {me.pid, 4}
    kinds = {p.pid: p.type for p in processes.processes}
    assert kinds[me.pid] == "C"
    assert kinds[4] == "G"


def test_processes_are_sorted_by_gpu_memory(patch_pynvml):
    me = psutil.Process()
    fake = patch_pynvml(
        FakeNvml(
            gpu_count=1,
            compute_procs=[
                _Proc(pid=me.pid, usedGpuMemory=1024),
                _Proc(pid=4, usedGpuMemory=10 * 1024),
            ],
        )
    )
    processes = make_collector(fake).collect_processes()
    memories = [p.gpu_memory for p in processes.processes]
    assert memories == sorted(memories, reverse=True)


def test_process_limit_is_respected(patch_pynvml):
    me = psutil.Process()
    fake = patch_pynvml(
        FakeNvml(gpu_count=1, compute_procs=[_Proc(pid=me.pid, usedGpuMemory=1024), _Proc(pid=4, usedGpuMemory=2048)])
    )
    processes = make_collector(fake, process_limit=1).collect_processes()
    assert len(processes.processes) == 1


def test_duplicate_pid_on_same_gpu_is_deduplicated(patch_pynvml):
    me = psutil.Process()
    duplicate = [_Proc(pid=me.pid, usedGpuMemory=1024), _Proc(pid=me.pid, usedGpuMemory=1024)]
    fake = patch_pynvml(FakeNvml(gpu_count=1, compute_procs=duplicate))
    assert len(make_collector(fake).collect_processes().processes) == 1


def test_command_collection_can_be_disabled(patch_pynvml):
    fake = patch_pynvml(FakeNvml(gpu_count=1, compute_procs=[_Proc(pid=psutil.Process().pid, usedGpuMemory=1024)]))
    processes = make_collector(fake, collect_commands=False).collect_processes()
    assert processes.processes[0].command is None


def test_process_collection_survives_raw_query_failure(patch_pynvml):
    fake = patch_pynvml(FakeNvml(gpu_count=1, failing={"nvmlDeviceGetComputeRunningProcesses"}))
    processes = make_collector(fake).collect_processes()
    assert processes.available is True
    assert processes.processes == []


def test_collect_gpus_survives_single_device_failure(patch_pynvml):
    fake = patch_pynvml(FakeNvml(gpu_count=2, failing={"nvmlDeviceGetUtilizationRates"}))
    collection = make_collector(fake).collect_gpus()
    # The metric fails for every device but the call still succeeds.
    assert collection.available is True
    assert len(collection.gpus) == 2
    assert all(g.utilization_percent is None for g in collection.gpus)
