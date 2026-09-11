"""Pydantic schemas describing every value LabWatch exposes over the API.

Any field that a host may legitimately be unable to report (unsupported
sensor, permission denied, ...) is typed as ``Optional`` and serialised as
``null``: the dashboard renders those as ``N/A`` instead of failing.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, computed_field

HistoryRange = Literal["1h", "6h", "24h"]

RANGE_SECONDS: dict[str, int] = {"1h": 3600, "6h": 6 * 3600, "24h": 24 * 3600}


# --------------------------------------------------------------------------- #
# System
# --------------------------------------------------------------------------- #
class CpuInfo(BaseModel):
    """CPU utilisation and load information."""

    usage_percent: float | None = Field(None, description="Overall CPU utilisation in percent.")
    physical_cores: int | None = None
    logical_cores: int | None = None
    frequency_mhz: float | None = None
    load_average: tuple[float, float, float] | None = Field(
        None,
        description="1/5/15 minute load average. Not available on Windows.",
    )
    per_core_percent: list[float] = Field(default_factory=list)


class MemoryInfo(BaseModel):
    """Host memory usage in bytes.

    ``used``/``percent`` deliberately follow what ``free`` reports as
    *available* memory (``MemAvailable`` minus what is genuinely in use) rather
    than the kernel's ``MemFree``. On a busy server most of RAM holds page cache
    and reclaimable slab, so ``MemFree`` alone would suggest the machine is full
    when it is not.
    """

    total: int | None = None
    used: int | None = None
    free: int | None = Field(None, description="Completely unallocated memory (MemFree).")
    cached: int | None = Field(
        None,
        description="Page cache, buffers and reclaimable slab, i.e. memory the kernel can hand back.",
    )
    available: int | None = None
    percent: float | None = None


class DiskInfo(BaseModel):
    """Usage for a single mount point."""

    device: str
    mountpoint: str
    fstype: str | None = None
    total: int | None = None
    used: int | None = None
    free: int | None = None
    percent: float | None = None
    is_primary: bool = False


class HostInfo(BaseModel):
    """Static-ish host identification."""

    hostname: str
    os: str
    kernel: str
    platform: str
    boot_time: float | None = Field(None, description="Unix timestamp of last boot.")


class SystemStatus(BaseModel):
    """Aggregated host payload returned by ``/api/system``."""

    host: HostInfo
    uptime_seconds: float | None = None
    cpu: CpuInfo
    memory: MemoryInfo
    disks: list[DiskInfo] = Field(default_factory=list)
    collected_at: float = Field(description="Unix timestamp the sample was taken.")
    demo: bool = False

    @computed_field  # type: ignore[prop-decorator]
    @property
    def uptime_human(self) -> str | None:
        """Human readable uptime, e.g. ``5d 14h 3m``."""
        return format_duration(self.uptime_seconds)


# --------------------------------------------------------------------------- #
# GPU
# --------------------------------------------------------------------------- #
class GpuStatus(BaseModel):
    """Live state of one NVIDIA GPU."""

    index: int
    uuid: str | None = None
    name: str | None = None
    utilization_percent: float | None = None
    memory_used: int | None = Field(None, description="Bytes of GPU memory in use.")
    memory_total: int | None = Field(None, description="Bytes of total GPU memory.")
    memory_percent: float | None = None
    temperature_c: float | None = None
    power_watts: float | None = None
    power_limit_watts: float | None = None
    fan_percent: float | None = None
    clocks_sm_mhz: float | None = None
    clocks_mem_mhz: float | None = None
    persistence_mode: bool | None = None
    process_count: int | None = None
    collected_at: float = 0.0

    @computed_field  # type: ignore[prop-decorator]
    @property
    def power_percent(self) -> float | None:
        """Instantaneous power draw as a percentage of the enforced limit."""
        if self.power_watts is None or not self.power_limit_watts:
            return None
        return round(min(100.0, self.power_watts / self.power_limit_watts * 100.0), 1)


class GpuProcess(BaseModel):
    """A compute process holding GPU memory, enriched with OS level details."""

    pid: int
    gpu_index: int
    gpu_uuid: str | None = None
    gpu_memory: int | None = Field(None, description="Bytes of GPU memory held by the process.")
    name: str | None = None
    command: str | None = None
    username: str | None = None
    cpu_percent: float | None = None
    memory_rss: int | None = Field(None, description="Resident host memory of the process.")
    status: str | None = None
    start_time: float | None = Field(None, description="Unix timestamp the process started.")
    runtime_seconds: float | None = None
    type: str | None = Field(None, description="NVML process type: C (compute) or G (graphics).")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def runtime_human(self) -> str | None:
        """Human readable runtime, e.g. ``03:42:18``."""
        return format_runtime(self.runtime_seconds)


class GpuCollection(BaseModel):
    """Result of a GPU collection attempt."""

    available: bool = Field(description="True when NVML is usable on this host.")
    driver_version: str | None = None
    cuda_version: str | None = None
    nvml_version: str | None = None
    error: str | None = Field(None, description="Reason NVML/GPU data is unavailable.")
    gpus: list[GpuStatus] = Field(default_factory=list)
    collected_at: float = 0.0
    demo: bool = False


class ProcessCollection(BaseModel):
    """Result of a GPU process collection attempt."""

    available: bool = Field(description="True when GPU process data could be read.")
    error: str | None = None
    processes: list[GpuProcess] = Field(default_factory=list)
    collected_at: float = 0.0
    demo: bool = False


class Overview(BaseModel):
    """Single-call payload used by the dashboard's polling loop."""

    system: SystemStatus
    gpu_collection: GpuCollection = Field(serialization_alias="gpus")
    process_collection: ProcessCollection = Field(serialization_alias="processes")
    poll_interval: float
    generated_at: float

    model_config = {"populate_by_name": True}


# --------------------------------------------------------------------------- #
# History
# --------------------------------------------------------------------------- #
class SystemHistoryPoint(BaseModel):
    """One persisted host sample."""

    timestamp: float
    cpu_percent: float | None = None
    memory_used: int | None = None
    memory_total: int | None = None
    memory_percent: float | None = None
    disk_used: int | None = None
    disk_total: int | None = None
    disk_percent: float | None = None


class GpuHistoryPoint(BaseModel):
    """One persisted GPU sample."""

    timestamp: float
    gpu_index: int
    utilization: float | None = None
    memory_used: int | None = None
    memory_total: int | None = None
    memory_percent: float | None = None
    temperature: float | None = None
    power_usage: float | None = None
    power_limit: float | None = None


class SystemHistory(BaseModel):
    """Time series for host metrics."""

    range: HistoryRange
    start: float
    end: float
    interval_seconds: float
    points: list[SystemHistoryPoint] = Field(default_factory=list)
    demo: bool = False


class GpuHistorySeries(BaseModel):
    """Time series for one GPU."""

    gpu_index: int
    gpu_name: str | None = None
    points: list[GpuHistoryPoint] = Field(default_factory=list)


class GpuHistory(BaseModel):
    """Time series for every known GPU."""

    range: HistoryRange
    start: float
    end: float
    interval_seconds: float
    series: list[GpuHistorySeries] = Field(default_factory=list)
    demo: bool = False


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #
class HealthStatus(BaseModel):
    """Service health probe."""

    status: Literal["ok", "degraded"] = "ok"
    version: str
    uptime_seconds: float
    database: Literal["ok", "error"] = "ok"
    database_error: str | None = None
    gpu_available: bool = False
    gpu_error: str | None = None
    gpu_count: int = 0
    demo_mode: bool = False
    collector_running: bool = False
    collector_interval_seconds: float | None = Field(
        None, description="Configured seconds between persisted history rows."
    )
    collector_writes: int = Field(0, description="History samples written since startup.")
    collector_errors: int = Field(0, description="Failed collection or write attempts since startup.")
    last_history_write: float | None = Field(
        None, description="Unix timestamp of the most recent persisted history sample."
    )
    history_points: int | None = Field(None, description="Rows currently stored for the host series.")


# --------------------------------------------------------------------------- #
# Formatting helpers (shared with the HTML report generator)
# --------------------------------------------------------------------------- #
def format_duration(seconds: float | None) -> str | None:
    """Render a duration in seconds as ``5d 14h 3m``."""
    if seconds is None:
        return None
    total = int(seconds)
    if total < 0:
        return None
    days, rem = divmod(total, 86_400)
    hours, rem = divmod(rem, 3_600)
    minutes, secs = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h {minutes}m"
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {secs}s"
    return f"{secs}s"


def format_runtime(seconds: float | None) -> str | None:
    """Render a runtime as ``HH:MM:SS`` (or ``Nd HH:MM:SS`` past a day)."""
    if seconds is None:
        return None
    total = int(seconds)
    if total < 0:
        return None
    days, rem = divmod(total, 86_400)
    hours, rem = divmod(rem, 3_600)
    minutes, secs = divmod(rem, 60)
    if days:
        return f"{days}d {hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"
