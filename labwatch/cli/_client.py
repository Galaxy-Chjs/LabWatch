"""Tiny read-only JSON client for a running LabWatch server.

Standard library only, so the CLI and editor integrations can query an instance
without importing the server's dependency tree.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

DEFAULT_TIMEOUT = 6.0


class ServerUnreachable(RuntimeError):
    """The server did not answer, or answered with an error."""


@dataclass
class GpuSummary:
    """The few GPU facts a one-line status needs."""

    index: int
    name: str | None
    utilization_percent: float | None
    memory_used: int | None
    memory_total: int | None
    memory_percent: float | None
    temperature_c: float | None
    power_watts: float | None
    process_count: int | None

    @property
    def busy(self) -> bool:
        """Whether this GPU looks occupied.

        Deliberately conservative: a card holding a large allocation but sitting
        at 0 % is still reserved by somebody, and reporting it as free would be
        the single most misleading thing this tool could do.
        """
        if (self.utilization_percent or 0) >= 25:
            return True
        return (self.memory_percent or 0) >= 20


@dataclass
class Snapshot:
    """Everything the CLI needs from one poll."""

    version: str = "unknown"
    hostname: str = "unknown"
    demo: bool = False
    gpu_available: bool = False
    gpu_error: str | None = None
    driver_version: str | None = None
    cuda_version: str | None = None
    cpu_percent: float | None = None
    memory_percent: float | None = None
    process_count: int = 0
    gpus: list[GpuSummary] = field(default_factory=list)

    @property
    def busy_count(self) -> int:
        """How many GPUs look occupied."""
        return sum(1 for gpu in self.gpus if gpu.busy)

    @property
    def free_count(self) -> int:
        """How many GPUs look free."""
        return len(self.gpus) - self.busy_count

    def busiest(self) -> GpuSummary | None:
        """The GPU with the highest utilisation, for a compact status line."""
        if not self.gpus:
            return None
        return max(self.gpus, key=lambda gpu: (gpu.utilization_percent or 0, gpu.memory_percent or 0))


def _get(url: str, timeout: float) -> dict[str, Any]:
    """Fetch and decode a JSON object.

    Validates that the payload really is an object: every endpoint returns one, and
    a list or a bare ``null`` means we are not talking to LabWatch. Raising here
    keeps the failure message about the API rather than surfacing as an
    ``AttributeError`` deep inside a caller.
    """
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - local URL only
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ServerUnreachable(f"HTTP {exc.code} from {url}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ServerUnreachable(f"Cannot reach LabWatch at {url}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ServerUnreachable(f"LabWatch returned invalid JSON from {url}: {exc}") from exc

    if not isinstance(payload, dict):
        raise ServerUnreachable(f"LabWatch returned a {type(payload).__name__} from {url}, expected an object")
    return payload


def base_url(host: str, port: int) -> str:
    """Normalise a bind address into a URL a client can actually dial."""
    dial = "127.0.0.1" if host in {"0.0.0.0", "::", ""} else host
    if ":" in dial and not dial.startswith("["):
        dial = f"[{dial}]"
    return f"http://{dial}:{port}"


def fetch_snapshot(host: str, port: int, *, timeout: float = DEFAULT_TIMEOUT) -> Snapshot:
    """Read health, host metrics and GPUs in one go."""
    root = base_url(host, port)
    health = _get(f"{root}/api/health", timeout)
    if not isinstance(health, dict):  # pragma: no cover - defensive
        raise ServerUnreachable("Unexpected health payload")

    snapshot = Snapshot(
        version=str(health.get("version", "unknown")),
        demo=bool(health.get("demo_mode", False)),
        gpu_available=bool(health.get("gpu_available", False)),
        gpu_error=health.get("gpu_error"),
    )

    try:
        system = _get(f"{root}/api/system", timeout)
    except ServerUnreachable:
        system = None
    if isinstance(system, dict):
        snapshot.hostname = str(system.get("host", {}).get("hostname", "unknown"))
        snapshot.cpu_percent = system.get("cpu", {}).get("usage_percent")
        snapshot.memory_percent = system.get("memory", {}).get("percent")

    try:
        collection = _get(f"{root}/api/gpus", timeout)
    except ServerUnreachable:
        collection = None
    if isinstance(collection, dict):
        snapshot.driver_version = collection.get("driver_version")
        snapshot.cuda_version = collection.get("cuda_version")
        snapshot.gpu_available = bool(collection.get("available", snapshot.gpu_available))
        snapshot.gpu_error = collection.get("error") or snapshot.gpu_error
        for raw in collection.get("gpus", []):
            snapshot.gpus.append(
                GpuSummary(
                    index=int(raw.get("index", 0)),
                    name=raw.get("name"),
                    utilization_percent=raw.get("utilization_percent"),
                    memory_used=raw.get("memory_used"),
                    memory_total=raw.get("memory_total"),
                    memory_percent=raw.get("memory_percent"),
                    temperature_c=raw.get("temperature_c"),
                    power_watts=raw.get("power_watts"),
                    process_count=raw.get("process_count"),
                )
            )

    try:
        processes = _get(f"{root}/api/processes", timeout)
    except ServerUnreachable:
        processes = None
    if isinstance(processes, dict):
        snapshot.process_count = len(processes.get("processes", []))

    return snapshot


def probe(host: str, port: int, *, timeout: float = 1.5) -> Snapshot | None:
    """Return a snapshot when a LabWatch server answers, else ``None``."""
    try:
        return fetch_snapshot(host, port, timeout=timeout)
    except ServerUnreachable:
        return None


def format_bytes(value: int | None, digits: int = 0) -> str:
    """Compact byte formatting, e.g. ``37.2 GB``."""
    if value is None:
        return "N/A"
    size = float(value)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(size) < 1024 or unit == "TB":
            return f"{size:.{digits}f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size:.{digits}f} TB"  # pragma: no cover - unreachable
