"""``labwatch doctor``: check that this machine can actually run LabWatch.

Every check answers a question a user would otherwise have to debug themselves:
is the driver there, is NVML loadable, are the GPUs visible, is the port free,
can we write history, is the bundled dashboard present.
"""

from __future__ import annotations

import importlib.util
import os
import platform
import socket
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from ._console import Console

CheckStatus = Literal["ok", "warn", "fail", "info"]

#: Lowest Python the package claims to support (see pyproject.toml).
MIN_PYTHON = (3, 10)


@dataclass
class Check:
    """One diagnostic result."""

    name: str
    status: CheckStatus
    detail: str
    hint: str | None = None


@dataclass
class DoctorReport:
    """The full set of diagnostics, plus a machine summary."""

    checks: list[Check] = field(default_factory=list)
    environment: dict[str, str] = field(default_factory=dict)

    @property
    def ready(self) -> bool:
        """Whether nothing failed. Warnings do not block a start."""
        return not any(check.status == "fail" for check in self.checks)

    @property
    def gpu_count(self) -> int:
        """GPU count discovered by the NVML check, when it succeeded."""
        for check in self.checks:
            if check.name == "GPUs":
                try:
                    return int(check.detail.split()[0])
                except (ValueError, IndexError):
                    return 0
        return 0


# --------------------------------------------------------------------------- #
# Individual checks
# --------------------------------------------------------------------------- #
def check_python() -> Check:
    """Interpreter version."""
    version = ".".join(str(part) for part in sys.version_info[:3])
    if sys.version_info[:2] < MIN_PYTHON:
        required = ".".join(str(part) for part in MIN_PYTHON)
        return Check(
            "Python",
            "fail",
            f"{version} (needs {required}+)",
            hint=f"LabWatch requires Python {required} or newer.",
        )
    return Check("Python", "ok", version, hint=sys.executable)


def check_dependencies() -> Check:
    """Whether the runtime dependencies are importable.

    Specifically avoids importing them, so a broken install is reported instead
    of crashing the diagnostic itself.
    """
    required = ["fastapi", "uvicorn", "psutil", "sqlalchemy", "pydantic", "pydantic_settings", "pynvml"]
    missing = [name for name in required if importlib.util.find_spec(name) is None]
    if missing:
        return Check(
            "Dependencies",
            "fail",
            f"missing: {', '.join(missing)}",
            hint="Reinstall with: pip install --force-reinstall labwatch",
        )
    return Check("Dependencies", "ok", f"{len(required)} runtime packages importable")


def check_nvml() -> Check:
    """Whether the NVIDIA management library can be initialised."""
    if importlib.util.find_spec("pynvml") is None:
        return Check(
            "NVML",
            "fail",
            "nvidia-ml-py is not installed",
            hint="Install it with: pip install nvidia-ml-py",
        )
    try:
        from ..server.collectors.gpu import NvmlGpuCollector

        collector = NvmlGpuCollector(collect_commands=False)
        try:
            available = collector.available
            error = collector.init_error
            driver = collector._driver_version
        finally:
            collector.shutdown()
    except Exception as exc:  # noqa: BLE001 - the whole point is to report this
        return Check("NVML", "fail", f"{type(exc).__name__}: {exc}", hint="See labwatch --demo to run without a GPU.")

    if not available:
        return Check(
            "NVML",
            "fail",
            error or "unavailable",
            hint="On a GPU host this usually means the driver is missing or the container lacks GPU access.",
        )
    detail = f"available (driver {driver})" if driver else "available"
    return Check("NVML", "ok", detail)


def check_gpus() -> Check:
    """How many NVIDIA devices are visible."""
    try:
        from ..server.collectors.gpu import NvmlGpuCollector

        collector = NvmlGpuCollector(collect_commands=False)
        try:
            if not collector.available:
                return Check("GPUs", "fail", "none detected", hint="Run nvidia-smi to confirm the driver sees a card.")
            collection = collector.collect_gpus()
        finally:
            collector.shutdown()
    except Exception as exc:  # noqa: BLE001
        return Check("GPUs", "fail", f"{type(exc).__name__}: {exc}")

    count = len(collection.gpus)
    names = {gpu.name for gpu in collection.gpus if gpu.name}
    label = names.pop() if len(names) == 1 else f"{len(names)} models"
    return Check("GPUs", "ok", f"{count} detected", hint=f"{count} × {label}" if names else None)


def check_port(host: str, port: int) -> Check:
    """Whether the requested address can be bound."""
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    sock = socket.socket(family, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
    except OSError as exc:
        return Check(
            "Port",
            "fail",
            f"{host}:{port} unavailable ({exc.strerror or exc})",
            hint="Pick another with: labwatch --port 8124",
        )
    finally:
        sock.close()
    return Check("Port", "ok", f"{host}:{port} available")


def check_data_dir(data_dir: Path) -> Check:
    """Whether history can be written where we intend to put it."""
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        probe = data_dir / ".labwatch-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as exc:
        return Check(
            "Database",
            "fail",
            f"{data_dir} is not writable ({exc.strerror or exc})",
            hint="Set LABWATCH_DATA_DIR to a writable directory.",
        )
    return Check("Database", "ok", str(data_dir), hint="history: labwatch.db")


def check_dashboard() -> Check:
    """Whether the built UI ships with this installation."""
    from ..server.config import UI_DIR

    index = UI_DIR / "index.html"
    if not index.is_file():
        return Check(
            "Dashboard",
            "warn",
            "bundled UI not found — API only",
            hint=f"Expected {index}. Reinstall the package to restore it.",
        )
    assets = UI_DIR / "assets"
    size = sum(f.stat().st_size for f in assets.glob("*")) if assets.is_dir() else 0
    return Check("Dashboard", "ok", f"bundled ({size / 1024:.0f} KB)")


def detect_environment() -> dict[str, str]:
    """A short summary of where LabWatch is about to run."""
    env: dict[str, str] = {
        "platform": f"{platform.system()} {platform.release()}",
        "python": sys.executable,
    }
    if os.path.exists("/.dockerenv") or os.environ.get("CONTAINER"):
        env["container"] = "yes"
    if os.environ.get("SSH_CONNECTION"):
        # Remote-SSH and plain ssh sessions both set this; worth surfacing because
        # it changes what "localhost" means for the user's browser.
        env["session"] = "remote (ssh)"
    if os.environ.get("VSCODE_IPC_HOOK_CLI") or os.environ.get("TERM_PROGRAM") == "vscode":
        env["editor"] = "VS Code"
    return env


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #
def run_doctor(
    *,
    host: str = "127.0.0.1",
    port: int = 8123,
    data_dir: Path | None = None,
) -> DoctorReport:
    """Run every check and return the results."""
    from ..server.config import Settings, default_data_dir

    resolved_data_dir = Path(data_dir) if data_dir is not None else default_data_dir()
    report = DoctorReport(environment=detect_environment())
    report.checks.extend(
        [
            check_python(),
            check_dependencies(),
            check_nvml(),
            check_gpus(),
            check_port(host, port),
            check_data_dir(resolved_data_dir),
            check_dashboard(),
        ]
    )
    # Keep Settings importable-only usage honest: it validates env overrides, so a
    # malformed LABWATCH_* variable surfaces here rather than at first request.
    try:
        Settings(_env_file=None)
    except Exception as exc:  # noqa: BLE001
        report.checks.append(
            Check("Configuration", "fail", f"{type(exc).__name__}: {exc}", hint="Check your LABWATCH_* variables.")
        )
    return report


def render(report: DoctorReport, console: Console) -> None:
    """Print a doctor report the way a user can act on it."""
    console.heading("LabWatch Doctor")
    console.blank()
    for check in report.checks:
        line = f"{check.name} {console.paint('—', 'dim')} {check.detail}" if check.detail else check.name
        if check.status == "ok":
            console.ok(line)
        elif check.status == "warn":
            console.warn(line)
        elif check.status == "fail":
            console.fail(line)
        else:
            console.write(f"· {line}")
        if check.hint:
            console.info(check.hint)
    console.blank()

    if report.environment:
        console.heading("Environment")
        for key, value in report.environment.items():
            console.write(f"  {console.paint(key, 'dim')}: {value}")
        console.blank()

    if report.ready:
        if report.gpu_count:
            console.ok(f"Ready — {report.gpu_count} GPU{'s' if report.gpu_count != 1 else ''} available.")
        else:
            console.warn("Ready, but no GPU was detected. Use labwatch --demo to explore the UI.")
    else:
        console.fail("Not ready — resolve the failures above.")
