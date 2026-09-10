"""Deterministic demo data source (``LABWATCH_DEMO_MODE=true``).

The demo source lets CI, screenshots and README material be produced on
machines without an NVIDIA GPU. Everything it produces is flagged with
``demo=True`` so the dashboard can label it as *Demo Data*.

Values move smoothly with wall-clock time rather than randomly, so the
dashboard looks alive without flickering.
"""

from __future__ import annotations

import math
import time

from ..schemas import (
    CpuInfo,
    DiskInfo,
    GpuCollection,
    GpuHistoryPoint,
    GpuProcess,
    GpuStatus,
    HostInfo,
    MemoryInfo,
    ProcessCollection,
    SystemHistoryPoint,
    SystemStatus,
)

_MB = 1024 * 1024
_GB = 1024 * 1024 * 1024
_TB = 1024 * 1024 * 1024 * 1024

#: Window the live polling sample is tuned for. The dashboard polls every couple
#: of seconds, so the fast component should look like the one hour chart rather
#: than a 24 hour average.
LIVE_RANGE_SPAN = 600.0

DEMO_GPUS: tuple[dict, ...] = (
    {
        "index": 0,
        "name": "NVIDIA GeForce RTX 4090",
        "uuid": "GPU-demo0000-1111-2222-3333-444444444444",
        "memory_total": 48 * _GB,
        "base_util": 78.0,
        "base_power": 340.0,
        "power_limit": 450.0,
        "base_temp": 68.0,
        "mem_fraction": 0.79,
    },
    {
        "index": 1,
        "name": "NVIDIA GeForce RTX 4090",
        "uuid": "GPU-demo0001-1111-2222-3333-444444444444",
        "memory_total": 48 * _GB,
        "base_util": 21.0,
        "base_power": 96.0,
        "power_limit": 450.0,
        "base_temp": 47.0,
        "mem_fraction": 0.16,
    },
    {
        "index": 2,
        "name": "NVIDIA A100-SXM4-80GB",
        "uuid": "GPU-demo0002-1111-2222-3333-444444444444",
        "memory_total": 80 * _GB,
        "base_util": 0.0,
        "base_power": 62.0,
        "power_limit": 400.0,
        "base_temp": 34.0,
        "mem_fraction": 0.0,
    },
)

DEMO_PROCESSES: tuple[dict, ...] = (
    {
        "pid": 15234,
        "gpu_index": 0,
        "gpu_memory": 26 * _GB,
        "name": "python",
        "command": "python train_router.py --config config/v4.yaml --seed 42",
        "username": "researcher",
        "cpu_percent": 612.4,
        "memory_rss": 18 * _GB,
        "runtime_seconds": 13_338.0,
    },
    {
        "pid": 19218,
        "gpu_index": 0,
        "gpu_memory": 8 * _GB,
        "name": "python",
        "command": "python eval.py --ckpt runs/v4/last.pt --split test",
        "username": "researcher",
        "cpu_percent": 128.7,
        "memory_rss": 6 * _GB,
        "runtime_seconds": 3_612.0,
    },
    {
        "pid": 20421,
        "gpu_index": 1,
        "gpu_memory": 6 * _GB,
        "name": "python",
        "command": "python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-7B",
        "username": "researcher",
        "cpu_percent": 64.2,
        "memory_rss": 9 * _GB,
        "runtime_seconds": 1_845.0,
    },
)


def _wave(period: float, phase: float = 0.0, now: float | None = None) -> float:
    """Smoothly varying value in ``[-1, 1]``."""
    t = time.time() if now is None else now
    return math.sin(2 * math.pi * t / period + phase)


def _noise(now: float, seed: float = 0.0, scale: float = 1.0, interval: float = 1.0) -> float:
    """Deterministic pseudo-random value in ``[-scale, scale]``.

    A pure sine wave looks obviously synthetic on a chart, so demo series add
    jitter on top of the slow envelopes. Two properties matter:

    * it is deterministic - the same timestamp always yields the same value, so
      the demo is reproducible;
    * the bucket width follows the rendering resolution (``interval``). Sampling
      a 1-second signal at 10-second steps aliases into a solid block, which is
      what made the 24-hour charts unreadable.
    """
    bucket = max(1.0, float(interval))
    step = math.floor(now / bucket)
    hashed = math.sin(step * 12.9898 + seed * 78.233) * 43758.5453
    fraction = hashed - math.floor(hashed)
    return (fraction - 0.5) * 2.0 * scale


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _load(now: float, range_span: float = 600.0) -> float:
    """A slow "how busy is this experiment right now" envelope in ``[0.45, 1.15]``.

    Without this every series oscillates around a constant mean, which reads as
    fake. Real GPU servers idle for a while and then run a burst. The floor is
    deliberately not near zero: a busy training host rarely drops to 4% GPU
    utilisation, and a wide floor-to-peak swing turns long charts into a solid
    block of pixels.

    The envelope is stretched to the requested window: a burst that takes five
    minutes is invisible on a 24 hour chart, and a 40 minute swell is invisible
    on a one hour chart.
    """
    span = max(600.0, float(range_span))
    return _clamp(
        1.02
        + 0.22 * _wave(212.0, 0.0, now)
        + 0.12 * _wave(1847.0, 1.7, now)
        + 0.14 * _wave(span * 0.6, 0.9, now)
        + 0.08 * _wave(span * 0.27, 2.4, now),
        0.45,
        1.15,
    )


def _detail_level(range_span: float) -> tuple[float, float]:
    """Return ``(amplitude, period)`` for the fast component of a window.

    A number that swings by ten points every ten seconds looks like a real load
    on a one hour chart but turns a 24 hour chart into a solid block, so both the
    fast amplitude and its period grow with the window being drawn.
    """
    span = max(600.0, float(range_span))
    amplitude = _clamp(8.0 * (span / 3600.0) ** 0.5, 4.0, 16.0)
    period = _clamp(span / 45.0, 40.0, 2400.0)
    return amplitude, period


def _memory_fraction(now: float) -> float:
    """Host memory pressure in ``[0.05, 0.95]``.

    Deliberately much slower than CPU load: a training run holds its resident
    memory for the whole job, it does not oscillate second to second.
    """
    return _clamp(
        0.46 + 0.13 * _wave(2600.0, 1.1, now) + 0.04 * _wave(430.0, 0.3, now),
        0.05,
        0.95,
    )


def _disk_reference_time() -> float:
    """Start of the current year, plus ~9 months.

    Anchoring the slowly growing disk figures to a fixed date would drift out of
    the realistic band as the calendar advances, so the baseline is rebuilt from
    the current date instead.
    """
    year = time.localtime().tm_year
    return time.mktime((year, 1, 1, 0, 0, 0, 0, 0, -1)) + 270 * 86_400.0


#: Reference point for the slowly growing demo disk figures.
_DISK_EPOCH = _disk_reference_time()
_DISK_PRIMARY_BASE = 0.62
_DISK_PRIMARY_PER_HOUR = 0.0004  # ~1% per day
_DISK_DATA_BASE = 0.74
_DISK_DATA_PER_HOUR = 0.0002


def _disk_fraction(now: float) -> float:
    """Primary filesystem usage fraction; creeping upward at ~1%/day.

    Time is snapped to the hour so the value is identical for every sample
    inside an hour (no per-sample aliasing) while the slow growth is still
    visible on a 24 hour chart.
    """
    hours = max(0.0, (math.floor(now / 3600.0) * 3600.0 - _DISK_EPOCH) / 3600.0)
    return _clamp(_DISK_PRIMARY_BASE + _DISK_PRIMARY_PER_HOUR * hours, 0.0, 0.97)


def _disk_data_fraction(now: float) -> float:
    """Secondary filesystem usage fraction; strictly non-decreasing."""
    hours = max(0.0, (math.floor(now / 3600.0) * 3600.0 - _DISK_EPOCH) / 3600.0)
    return _clamp(_DISK_DATA_BASE + _DISK_DATA_PER_HOUR * hours, 0.0, 0.97)


def _gpu_signals(spec: dict, now: float, range_span: float, interval: float = 1.0) -> tuple[float, int, float]:
    """Return ``(utilization %, memory bytes, power W)`` for one demo GPU.

    Shared by the live sample and the history series so a chart and the cards
    above it always tell the same story.
    """
    index = int(spec["index"])
    load = _load(now, range_span)
    amplitude, period = _detail_level(range_span)
    noise_scale = _clamp(amplitude * 0.45, 3.0, 10.0)

    utilization = round(
        _clamp(
            spec["base_util"] * load
            + amplitude * _wave(period, index * 1.3, now)
            + _noise(now, index, noise_scale, interval),
            0.0,
            100.0,
        ),
        1,
    )
    memory_used = int(
        spec["memory_total"]
        * _clamp(
            spec["mem_fraction"]
            + 0.02 * _wave(150, index, now)
            + 0.008 * _noise(now, index + 10, 1.0, interval),
            0.0,
            1.0,
        )
    )
    power = round(
        _clamp(
            spec["base_power"] * load
            + amplitude * 3.0 * _wave(period * 1.4, index * 0.9, now)
            + _noise(now, index + 20, noise_scale * 2.2, interval),
            20.0,
            spec["power_limit"],
        ),
        1,
    )
    return utilization, memory_used, power


class DemoCollector:
    """Generates plausible host/GPU/process samples without any hardware."""

    hostname = "gpu-demo-node"
    disk_total = 2 * _TB
    memory_total = 128 * _GB

    def __init__(self) -> None:
        self._boot_time = time.time() - (5 * 86_400 + 14 * 3_600)

    @staticmethod
    def gpu_names() -> dict[int, str]:
        """Map GPU index to marketing name for the demo devices."""
        return {int(spec["index"]): str(spec["name"]) for spec in DEMO_GPUS}

    # -- host --------------------------------------------------------------
    def collect_system(self) -> SystemStatus:
        """Synthetic host sample."""
        now = time.time()
        load = _load(now)
        cpu = round(_clamp(24.0 * load + 9.0 * _wave(90, 0.4, now) + _noise(now, 1, 4.0), 1.0, 99.0), 1)
        mem_used = int(self.memory_total * _memory_fraction(now))
        disk_used = int(self.disk_total * _disk_fraction(now))
        data_used = int(4 * _TB * _disk_data_fraction(now))
        return SystemStatus(
            host=HostInfo(
                hostname=self.hostname,
                os="Linux 6.8.0-45-generic",
                kernel="#45-Ubuntu SMP PREEMPT_DYNAMIC",
                platform="Linux-6.8.0-45-generic-x86_64-with-glibc2.39",
                boot_time=self._boot_time,
            ),
            uptime_seconds=max(0.0, now - self._boot_time),
            cpu=CpuInfo(
                usage_percent=cpu,
                physical_cores=32,
                logical_cores=64,
                frequency_mhz=round(3200 + 250 * _wave(60, 0.2, now), 1),
                load_average=(
                    round(6.4 + 2.0 * _wave(120, 0.0, now), 2),
                    round(5.8 + 1.5 * _wave(240, 0.3, now), 2),
                    round(5.1 + 1.0 * _wave(480, 0.6, now), 2),
                ),
                per_core_percent=[
                    round(_clamp(cpu + 18.0 * _wave(45, i * 0.7, now), 0.0, 100.0), 1) for i in range(16)
                ],
            ),
            memory=MemoryInfo(
                total=self.memory_total,
                used=mem_used,
                available=self.memory_total - mem_used,
                percent=round(mem_used / self.memory_total * 100.0, 1),
            ),
            disks=[
                DiskInfo(
                    device="/dev/nvme0n1p2",
                    mountpoint="/",
                    fstype="ext4",
                    total=self.disk_total,
                    used=disk_used,
                    free=self.disk_total - disk_used,
                    percent=round(disk_used / self.disk_total * 100.0, 1),
                    is_primary=True,
                ),
                DiskInfo(
                    device="/dev/nvme1n1p1",
                    mountpoint="/data",
                    fstype="ext4",
                    total=4 * _TB,
                    used=data_used,
                    free=4 * _TB - data_used,
                    percent=round(data_used / (4 * _TB) * 100.0, 1),
                    is_primary=False,
                ),
            ],
            collected_at=now,
            demo=True,
        )

    # -- gpu ---------------------------------------------------------------
    def collect_gpus(self) -> GpuCollection:
        """Synthetic GPU sample.

        Uses the same signal functions as the history series, with a nominal
        window matching what the dashboard shows while polling.
        """
        now = time.time()
        gpus: list[GpuStatus] = []
        for spec in DEMO_GPUS:
            idx = int(spec["index"])
            util, memory_used, power = _gpu_signals(spec, now, LIVE_RANGE_SPAN)
            gpus.append(
                GpuStatus(
                    index=idx,
                    uuid=spec["uuid"],
                    name=spec["name"],
                    utilization_percent=util,
                    memory_used=memory_used,
                    memory_total=spec["memory_total"],
                    memory_percent=round(memory_used / spec["memory_total"] * 100.0, 1),
                    temperature_c=round(
                        _clamp(
                            spec["base_temp"] + 4.0 * _wave(110, idx, now) + _noise(now, idx + 30, 1.6),
                            25.0,
                            95.0,
                        ),
                        1,
                    ),
                    power_watts=power,
                    power_limit_watts=spec["power_limit"],
                    fan_percent=round(
                        _clamp(45.0 + 20.0 * _wave(95, idx, now) + _noise(now, idx + 40, 4.0), 0.0, 100.0), 1
                    ),
                    clocks_sm_mhz=round(
                        _clamp(2100.0 + 300.0 * _wave(85, idx, now) + _noise(now, idx + 50, 60.0), 300.0, 2800.0),
                        1,
                    ),
                    clocks_mem_mhz=10501.0,
                    persistence_mode=False,
                    process_count=sum(1 for p in DEMO_PROCESSES if p["gpu_index"] == idx),
                    collected_at=now,
                )
            )
        return GpuCollection(
            available=True,
            driver_version="550.107.02",
            cuda_version="12.4",
            nvml_version="12.550.107.02",
            gpus=gpus,
            collected_at=now,
            demo=True,
        )

    def collect_processes(self) -> ProcessCollection:
        """Synthetic GPU process sample."""
        now = time.time()
        load = _load(now)
        processes = [
            GpuProcess(
                pid=spec["pid"],
                gpu_index=spec["gpu_index"],
                gpu_uuid=DEMO_GPUS[spec["gpu_index"]]["uuid"],
                gpu_memory=spec["gpu_memory"],
                name=spec["name"],
                command=spec["command"],
                username=spec["username"],
                cpu_percent=round(
                    _clamp(
                        spec["cpu_percent"] * load
                        + 35.0 * _wave(50, spec["pid"] % 7, now)
                        + 25.0 * _noise(now, spec["pid"] % 13),
                        0.0,
                        3200.0,
                    ),
                    1,
                ),
                memory_rss=spec["memory_rss"],
                status="running",
                start_time=now - spec["runtime_seconds"],
                runtime_seconds=spec["runtime_seconds"],
                type="C",
            )
            for spec in DEMO_PROCESSES
        ]
        return ProcessCollection(available=True, processes=processes, collected_at=now, demo=True)

    # -- history -----------------------------------------------------------
    def system_history_points(self, start: float, end: float, interval: float) -> list[SystemHistoryPoint]:
        """Synthetic host history between ``start`` and ``end``.

        The window width drives the signal shape, so 1h looks like minute-scale
        load and 24h looks like a daily trend instead of a solid block.
        """
        points: list[SystemHistoryPoint] = []
        range_span = max(end - start, interval)
        amplitude, period = _detail_level(range_span)
        ts = start
        while ts <= end:
            cpu = round(
                _clamp(
                    24.0 * _load(ts, range_span)
                    + amplitude * _wave(period, 0.4, ts)
                    + _noise(ts, 1, 3.0 * (amplitude / 8.0), interval),
                    1.0,
                    99.0,
                ),
                1,
            )
            mem_used = int(self.memory_total * _memory_fraction(ts))
            disk_used = int(self.disk_total * _disk_fraction(ts))
            points.append(
                SystemHistoryPoint(
                    timestamp=ts,
                    cpu_percent=cpu,
                    memory_used=mem_used,
                    memory_total=self.memory_total,
                    memory_percent=round(mem_used / self.memory_total * 100.0, 1),
                    disk_used=disk_used,
                    disk_total=self.disk_total,
                    disk_percent=round(disk_used / self.disk_total * 100.0, 1),
                )
            )
            ts += interval
        return points

    def gpu_history_points(self, start: float, end: float, interval: float) -> list[GpuHistoryPoint]:
        """Synthetic GPU history between ``start`` and ``end`` for every demo GPU.

        Uses exactly the same signal functions as the live sample, so a chart and
        the cards above it tell the same story.
        """
        points: list[GpuHistoryPoint] = []
        range_span = max(end - start, interval)
        for spec in DEMO_GPUS:
            idx = int(spec["index"])
            ts = start
            while ts <= end:
                util, memory_used, power = _gpu_signals(spec, ts, range_span, interval)
                points.append(
                    GpuHistoryPoint(
                        timestamp=ts,
                        gpu_index=idx,
                        utilization=util,
                        memory_used=memory_used,
                        memory_total=spec["memory_total"],
                        memory_percent=round(memory_used / spec["memory_total"] * 100.0, 1),
                        temperature=round(
                            _clamp(
                                spec["base_temp"]
                                + 4.0 * _wave(110, idx, ts)
                                + _noise(ts, idx + 30, 1.6, interval),
                                25.0,
                                95.0,
                            ),
                            1,
                        ),
                        power_usage=power,
                        power_limit=spec["power_limit"],
                    )
                )
                ts += interval
        return points
