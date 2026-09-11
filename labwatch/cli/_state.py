"""Runtime state: where a running LabWatch records itself.

A small JSON file under the data directory lets ``labwatch status`` and
``labwatch stop`` find a background instance without a scan of the process
table. It is advisory only: every read verifies that the recorded PID is alive
and still belongs to LabWatch before trusting it.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

STATE_FILENAME = "runtime.json"

#: Unix epoch that ``psutil``-style create times on some platforms start at.
_EPOCH_TOLERANCE_SECONDS = 2.0


@dataclass
class RuntimeState:
    """A LabWatch instance recorded on disk."""

    pid: int
    host: str
    port: int
    version: str
    demo: bool
    started_at: float
    data_dir: str

    @property
    def url(self) -> str:
        """Dashboard URL for this instance."""
        host = "127.0.0.1" if self.host in {"0.0.0.0", "::"} else self.host
        return f"http://{host}:{self.port}"

    @property
    def uptime_seconds(self) -> float:
        """Seconds since this instance started."""
        return max(0.0, time.time() - self.started_at)


def state_path(data_dir: Path) -> Path:
    """Location of the runtime state file for a data directory."""
    return Path(data_dir) / STATE_FILENAME


def write_state(state: RuntimeState) -> None:
    """Record a running instance; failures are logged, never fatal."""
    path = state_path(Path(state.data_dir))
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(state), indent=2), encoding="utf-8")
    except OSError as exc:  # pragma: no cover - depends on the filesystem
        logger.warning("Could not write runtime state to %s: %s", path, exc)


def clear_state(data_dir: Path, *, pid: int | None = None) -> None:
    """Remove the state file, refusing to delete another instance's record."""
    path = state_path(data_dir)
    if not path.exists():
        return
    if pid is not None:
        current = read_state(data_dir)
        if current is not None and current.pid != pid:
            return
    try:
        path.unlink()
    except OSError as exc:  # pragma: no cover - depends on the filesystem
        logger.warning("Could not remove runtime state %s: %s", path, exc)


def read_state(data_dir: Path) -> RuntimeState | None:
    """Read the recorded instance, or ``None`` when there is no usable record."""
    path = state_path(data_dir)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return RuntimeState(
            pid=int(raw["pid"]),
            host=str(raw.get("host", "127.0.0.1")),
            port=int(raw["port"]),
            version=str(raw.get("version", "unknown")),
            demo=bool(raw.get("demo", False)),
            started_at=float(raw.get("started_at", 0.0)),
            data_dir=str(raw.get("data_dir", str(data_dir))),
        )
    except (OSError, ValueError, KeyError, TypeError):
        return None


def is_running(state: RuntimeState) -> bool:
    """Whether the recorded process is alive *and* is a LabWatch process.

    Checking the command line guards against a recycled PID: after a reboot the
    same number can belong to something entirely unrelated, and we must not
    signal it.
    """
    try:
        import psutil
    except ImportError:  # pragma: no cover - psutil is a hard dependency
        return False

    try:
        proc = psutil.Process(state.pid)
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, OSError):
        return False

    try:
        cmdline = " ".join(proc.cmdline())
    except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
        # Cannot inspect it; fall back to "the PID exists" rather than a false negative.
        return True

    # A LabWatch process always mentions labwatch or the uvicorn app it hosts.
    markers = ("labwatch", "uvicorn")
    return any(marker in cmdline for marker in markers)


def find_running(data_dir: Path) -> RuntimeState | None:
    """Return the recorded instance if it is genuinely still running."""
    state = read_state(data_dir)
    if state is None:
        return None
    if not is_running(state):
        clear_state(data_dir, pid=state.pid)
        return None
    return state


def pid_alive(pid: int) -> bool:
    """Whether a PID exists (used only for diagnostics)."""
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    except Exception:  # noqa: BLE001 - Windows raises a bare OSError subclass
        return False
    return True
