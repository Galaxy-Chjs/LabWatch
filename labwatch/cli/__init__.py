"""``labwatch`` command line interface.

Usage:
    labwatch                     # start and open the dashboard
    labwatch --demo              # start with synthetic data (no GPU needed)
    labwatch doctor              # check that this machine can run LabWatch
    labwatch start --background  # start detached
    labwatch status              # is it running, and what are the GPUs doing
    labwatch stop                # stop a background instance
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

from .. import __version__
from . import _client
from ._console import Console
from ._state import RuntimeState, clear_state, find_running, is_running, read_state, write_state
from .doctor import render as render_doctor
from .doctor import run_doctor

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8123
BROWSER_DELAY_SECONDS = 1.2


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def resolve_data_dir(explicit: str | None) -> Path:
    """Data directory from the flag, the environment, or the platform default."""
    from ..server.config import default_data_dir

    if explicit:
        return Path(explicit).expanduser()
    return default_data_dir()


def port_in_use(host: str, port: int) -> bool:
    """Whether something is already listening on the address."""
    snapshot = _client.probe(host, port)
    return snapshot is not None


def wait_for_server(host: str, port: int, timeout: float = 15.0) -> _client.Snapshot | None:
    """Poll until the server answers or the timeout expires."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        snapshot = _client.probe(host, port, timeout=1.0)
        if snapshot is not None:
            return snapshot
        time.sleep(0.2)
    return None


def apply_environment(settings_overrides: dict[str, str]) -> None:
    """Export settings as LABWATCH_* variables for the server process."""
    for key, value in settings_overrides.items():
        os.environ[key] = value


def open_browser_later(url: str) -> None:
    """Open the dashboard once the server is likely up."""

    def _open() -> None:
        time.sleep(BROWSER_DELAY_SECONDS)
        # A headless host has no browser; that must never break startup.
        with contextlib.suppress(Exception):
            webbrowser.open(url)

    import threading

    threading.Thread(target=_open, name="labwatch-open-browser", daemon=True).start()


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #
def cmd_serve(args: argparse.Namespace) -> int:
    """Start the dashboard in the foreground."""
    console = Console()
    data_dir = resolve_data_dir(args.data_dir)

    if port_in_use(args.host, args.port):
        console.fail(f"Port {args.port} is already serving something.")
        existing = read_state(data_dir)
        if existing is not None and is_running(existing):
            console.hint(f"LabWatch is already running at {existing.url}")
            console.hint("Use 'labwatch status' to inspect it, or 'labwatch --port 8124'.")
        else:
            console.hint(f"Choose another port, e.g. labwatch --port {args.port + 1}")
        return 1

    overrides = {
        "LABWATCH_HOST": args.host,
        "LABWATCH_PORT": str(args.port),
        "LABWATCH_DATA_DIR": str(data_dir),
        "LABWATCH_DEMO_MODE": "true" if args.demo else "false",
        "LABWATCH_LOG_LEVEL": args.log_level,
    }
    if args.retention_hours is not None:
        overrides["LABWATCH_RETENTION_HOURS"] = str(args.retention_hours)
    if args.history_interval is not None:
        overrides["LABWATCH_HISTORY_INTERVAL"] = str(args.history_interval)
    apply_environment(overrides)

    url = _client.base_url(args.host, args.port)
    console.banner()
    render_startup_checks(console, args)

    state = RuntimeState(
        pid=os.getpid(),
        host=args.host,
        port=args.port,
        version=__version__,
        demo=args.demo,
        started_at=time.time(),
        data_dir=str(data_dir),
    )
    write_state(state)

    if args.open_browser:
        open_browser_later(url)

    console.ok("Dashboard running")
    console.url(url)
    console.hint("Press Ctrl+C to stop")
    console.blank()

    try:
        _run_uvicorn(args)
    except KeyboardInterrupt:  # pragma: no cover - interactive path
        console.blank()
        console.write("Stopping…")
    finally:
        clear_state(data_dir, pid=os.getpid())
    return 0


def render_startup_checks(console: Console, args: argparse.Namespace) -> None:
    """Print the short 'what did we find' block before serving."""
    if args.demo:
        console.warn("Demo mode — synthetic GPUs, clearly labelled in the UI")
        console.ok("3 demo GPUs loaded")
        return

    try:
        from ..server.collectors.gpu import NvmlGpuCollector

        collector = NvmlGpuCollector(collect_commands=False)
        try:
            available = collector.available
            error = collector.init_error
            driver = collector._driver_version
            count = len(collector._handles)
        finally:
            collector.shutdown()
    except Exception as exc:  # noqa: BLE001
        console.warn(f"NVIDIA probe failed ({type(exc).__name__}); host metrics only")
        return

    if not available:
        console.warn(f"No NVIDIA GPU ({error}) — host metrics only")
        console.hint("labwatch --demo shows the full UI without a GPU")
        return
    console.ok(f"NVIDIA detected{' (driver ' + driver + ')' if driver else ''}")
    console.ok(f"{count} GPU{'s' if count != 1 else ''} detected")


def _run_uvicorn(args: argparse.Namespace) -> None:
    """Hand control to uvicorn with the already-constructed app.

    Passing the application object (rather than an import string) avoids
    requiring ``labwatch`` to be importable as ``labwatch.server.main:app`` from
    whatever directory the user happens to be in.
    """
    import uvicorn

    from ..server.main import create_app

    app = create_app()
    config = uvicorn.Config(
        app,
        host=args.host,
        port=args.port,
        log_level=args.log_level.lower(),
        access_log=False,
        log_config=None,
    )
    uvicorn.Server(config).run()


def cmd_start(args: argparse.Namespace) -> int:
    """Start the dashboard in the background."""
    console = Console()
    data_dir = resolve_data_dir(args.data_dir)

    existing = find_running(data_dir)
    if existing is not None:
        console.warn(f"Already running (pid {existing.pid})")
        console.url(existing.url)
        return 0

    command = [
        sys.executable,
        "-m",
        "labwatch",
        "serve",
        "--host",
        args.host,
        "--port",
        str(args.port),
        "--data-dir",
        str(data_dir),
        "--log-level",
        args.log_level,
    ]
    if args.demo:
        command.append("--demo")

    creation: dict[str, object] = {}
    if os.name == "nt":
        creation["creationflags"] = (
            subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
        )
    else:
        creation["start_new_session"] = True

    log_path = data_dir / "labwatch.log"
    data_dir.mkdir(parents=True, exist_ok=True)
    log_file = open(log_path, "a", encoding="utf-8")  # noqa: SIM115 - handed to the child
    try:
        subprocess.Popen(command, stdout=log_file, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, **creation)
    except OSError as exc:
        log_file.close()
        console.fail(f"Could not start in the background: {exc}")
        return 1

    snapshot = wait_for_server(args.host, args.port, timeout=20.0)
    if snapshot is None:
        console.fail("Started, but the server did not become reachable.")
        console.hint(f"Check the log: {log_path}")
        return 1

    state = read_state(data_dir)
    console.banner()
    console.ok(f"Running in the background{' (pid ' + str(state.pid) + ')' if state else ''}")
    console.url(_client.base_url(args.host, args.port))
    console.hint(f"Logs: {log_path}")
    console.hint("Stop with: labwatch stop")
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    """Stop a background instance."""
    console = Console()
    data_dir = resolve_data_dir(args.data_dir)
    state = read_state(data_dir)

    if state is None:
        console.warn("No LabWatch instance recorded here.")
        console.hint(f"Looked in {data_dir}")
        return 0
    if not is_running(state):
        console.warn(f"Recorded process {state.pid} is no longer running.")
        clear_state(data_dir, pid=state.pid)
        return 0

    try:
        os.kill(state.pid, signal.SIGTERM)
    except OSError as exc:
        console.fail(f"Could not signal pid {state.pid}: {exc}")
        return 1

    deadline = time.time() + 10.0
    while time.time() < deadline and is_running(state):
        time.sleep(0.2)

    if is_running(state):
        console.warn("Still running after 10 s; the process may be ignoring SIGTERM.")
        return 1

    clear_state(data_dir, pid=state.pid)
    console.ok(f"Stopped (pid {state.pid})")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    """Report whether LabWatch is running and what the GPUs are doing."""
    data_dir = resolve_data_dir(args.data_dir)
    state = find_running(data_dir)
    console = Console()

    host = state.host if state is not None else args.host
    port = state.port if state is not None else args.port
    snapshot = _client.probe(host, port, timeout=2.0 if state is not None else 0.5)

    if args.json:
        return _status_json(state, snapshot, host, port, console)

    if snapshot is None:
        if state is not None:
            console.fail(f"Recorded on port {port} but not answering.")
            console.hint(f"Last known URL: {state.url}")
            return 1
        console.warn("LabWatch is not running.")
        console.hint("Start it with: labwatch")
        return 3

    console.heading(f"LabWatch {snapshot.version}")
    console.write(
        f"  {console.paint(snapshot.hostname, 'bold')}"
        f"  {console.paint('·', 'dim')}  {_client.base_url(host, port)}"
        f"{'  ' + console.paint('· demo data', 'yellow') if snapshot.demo else ''}"
    )
    console.blank()

    if not snapshot.gpu_available:
        console.warn(f"NVIDIA GPU unavailable: {snapshot.gpu_error or 'unknown reason'}")
    elif not snapshot.gpus:
        console.warn("No GPUs reported.")
    else:
        driver = f"  {console.paint('driver ' + snapshot.driver_version, 'dim')}" if snapshot.driver_version else ""
        console.write(
            f"  {console.paint(f'{snapshot.busy_count} busy / {len(snapshot.gpus)} GPUs', 'bold')}"
            f"  {console.paint('·', 'dim')}  {snapshot.free_count} free{driver}"
        )
        console.blank()
        for gpu in snapshot.gpus:
            console.write(_format_gpu_line(gpu, console))

    if snapshot.cpu_percent is not None or snapshot.memory_percent is not None:
        console.blank()
        cpu = f"CPU {snapshot.cpu_percent:.0f}%" if snapshot.cpu_percent is not None else "CPU N/A"
        mem = f"RAM {snapshot.memory_percent:.0f}%" if snapshot.memory_percent is not None else "RAM N/A"
        console.write(f"  {console.paint(f'{cpu}  ·  {mem}  ·  {snapshot.process_count} GPU processes', 'dim')}")

    if state is not None:
        console.blank()
        console.hint(f"pid {state.pid} · up {_format_duration(state.uptime_seconds)} · {data_dir}")
    return 0


def _format_gpu_line(gpu: _client.GpuSummary, console: Console) -> str:
    """One aligned GPU row for ``labwatch status``."""
    util = f"{gpu.utilization_percent:5.1f}%" if gpu.utilization_percent is not None else "    N/A"
    vram = f"{_client.format_bytes(gpu.memory_used)} / {_client.format_bytes(gpu.memory_total)}"
    temp = f"{gpu.temperature_c:.0f}°C" if gpu.temperature_c is not None else "N/A"
    power = f"{gpu.power_watts:.0f} W" if gpu.power_watts is not None else "N/A"
    marker = console.paint("busy", "yellow") if gpu.busy else console.paint("free", "green")
    util_colored = console.paint(util, "yellow" if gpu.busy else "green")
    name = (gpu.name or "GPU")[:22]
    return f"  GPU {gpu.index}  {name:<22}  {util_colored}  {vram:>18}  {temp:>5}  {power:>6}  {marker}"


def _status_json(
    state: RuntimeState | None,
    snapshot: _client.Snapshot | None,
    host: str,
    port: int,
    console: Console,
) -> int:
    """Machine-readable status, used by the VS Code extension."""
    payload = {
        "running": snapshot is not None,
        "url": _client.base_url(host, port),
        "pid": state.pid if state is not None else None,
        "uptime_seconds": state.uptime_seconds if state is not None else None,
        "version": snapshot.version if snapshot is not None else None,
        "hostname": snapshot.hostname if snapshot is not None else None,
        "demo": snapshot.demo if snapshot is not None else None,
        "gpu_available": snapshot.gpu_available if snapshot is not None else False,
        "gpu_error": snapshot.gpu_error if snapshot is not None else None,
        "driver_version": snapshot.driver_version if snapshot is not None else None,
        "cuda_version": snapshot.cuda_version if snapshot is not None else None,
        "gpu_count": len(snapshot.gpus) if snapshot is not None else 0,
        "busy_count": snapshot.busy_count if snapshot is not None else 0,
        "free_count": snapshot.free_count if snapshot is not None else 0,
        "cpu_percent": snapshot.cpu_percent if snapshot is not None else None,
        "memory_percent": snapshot.memory_percent if snapshot is not None else None,
        "process_count": snapshot.process_count if snapshot is not None else 0,
        "gpus": [
            {
                "index": gpu.index,
                "name": gpu.name,
                "utilization_percent": gpu.utilization_percent,
                "memory_used": gpu.memory_used,
                "memory_total": gpu.memory_total,
                "memory_percent": gpu.memory_percent,
                "temperature_c": gpu.temperature_c,
                "power_watts": gpu.power_watts,
                "process_count": gpu.process_count,
                "busy": gpu.busy,
            }
            for gpu in (snapshot.gpus if snapshot is not None else [])
        ],
    }
    console.write(json.dumps(payload, indent=2))
    return 0 if snapshot is not None else 3


def cmd_open(args: argparse.Namespace) -> int:
    """Open the dashboard in a browser."""
    console = Console()
    data_dir = resolve_data_dir(args.data_dir)
    state = find_running(data_dir)
    host = state.host if state is not None else args.host
    port = state.port if state is not None else args.port
    url = _client.base_url(host, port)

    if _client.probe(host, port, timeout=1.5) is None:
        console.fail("LabWatch does not appear to be running.")
        console.hint("Start it with: labwatch")
        return 1
    try:
        webbrowser.open(url)
    except Exception as exc:  # noqa: BLE001
        console.warn(f"Could not open a browser ({exc}).")
        console.url(url)
        return 1
    console.ok("Opening the dashboard")
    console.url(url)
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    """Check the local environment."""
    console = Console()
    report = run_doctor(
        host=args.host,
        port=args.port,
        data_dir=resolve_data_dir(args.data_dir),
    )
    if args.json:
        payload = {
            "ready": report.ready,
            "gpu_count": report.gpu_count,
            "environment": report.environment,
            "checks": [
                {"name": c.name, "status": c.status, "detail": c.detail, "hint": c.hint} for c in report.checks
            ],
        }
        console.write(json.dumps(payload, indent=2))
        return 0 if report.ready else 1

    render_doctor(report, console)
    return 0 if report.ready else 1


def cmd_version(args: argparse.Namespace) -> int:
    """Print the version."""
    console = Console()
    if args.json:
        console.write(json.dumps({"version": __version__, "python": sys.version.split()[0]}))
    else:
        console.write(f"labwatch {__version__}")
    return 0


def _format_duration(seconds: float) -> str:
    """Human duration for uptime."""
    total = int(seconds)
    days, rem = divmod(total, 86_400)
    hours, rem = divmod(rem, 3_600)
    minutes, secs = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {secs}s"
    return f"{secs}s"


# --------------------------------------------------------------------------- #
# Argument parsing
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    """Construct the CLI grammar.

    ``labwatch`` with no subcommand serves, so the shortest useful invocation is
    just the program name.
    """
    parser = argparse.ArgumentParser(
        prog="labwatch",
        description="Watch your GPUs: a local dashboard for NVIDIA GPU servers.",
        epilog="Run 'labwatch doctor' to check this machine, or 'labwatch --demo' to explore without a GPU.",
    )
    parser.add_argument("--version", action="version", version=f"labwatch {__version__}")

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--host", default=DEFAULT_HOST, help=f"bind address (default {DEFAULT_HOST})")
    common.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port (default {DEFAULT_PORT})")
    common.add_argument("--data-dir", default=None, help="where history is stored")
    common.add_argument("--json", action="store_true", help="machine-readable output")

    subparsers = parser.add_subparsers(dest="command")

    serve = subparsers.add_parser("serve", parents=[common], help="start the server (default)")
    serve.add_argument("--demo", action="store_true", help="serve synthetic data, no GPU required")
    serve.add_argument("--no-browser", dest="open_browser", action="store_false", default=True)
    serve.add_argument("--log-level", default="INFO", help="DEBUG, INFO, WARNING, ERROR")
    serve.add_argument("--retention-hours", type=float, default=None, help="how long history is kept")
    serve.add_argument("--history-interval", type=float, default=None, help="seconds between history rows")
    serve.set_defaults(func=cmd_serve)

    start = subparsers.add_parser("start", parents=[common], help="start in the background")
    start.add_argument("--demo", action="store_true", help="serve synthetic data")
    start.add_argument("--log-level", default="INFO")
    start.set_defaults(func=cmd_start)

    stop = subparsers.add_parser("stop", parents=[common], help="stop a background instance")
    stop.set_defaults(func=cmd_stop)

    status = subparsers.add_parser("status", parents=[common], help="show whether it is running")
    status.set_defaults(func=cmd_status)

    open_cmd = subparsers.add_parser("open", parents=[common], help="open the dashboard in a browser")
    open_cmd.set_defaults(func=cmd_open)

    doctor = subparsers.add_parser("doctor", parents=[common], help="check the local environment")
    doctor.set_defaults(func=cmd_doctor)

    version = subparsers.add_parser("version", help="print the version")
    version.add_argument("--json", action="store_true", help="machine-readable output")
    version.set_defaults(func=cmd_version)

    return parser


def _serve_defaults(args: argparse.Namespace) -> argparse.Namespace:
    """Fill in the serve options when no subcommand was given."""
    args.demo = getattr(args, "demo", False)
    args.open_browser = getattr(args, "open_browser", True)
    args.log_level = getattr(args, "log_level", "INFO")
    args.retention_hours = None
    args.history_interval = None
    args.func = cmd_serve
    return args


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()

    # Top-level flags without a subcommand mean "serve".
    known = {"serve", "start", "stop", "status", "open", "doctor", "version"}
    if not any(token in known for token in argv):
        serve_parser = argparse.ArgumentParser(prog="labwatch", add_help=False)
        serve_parser.add_argument("--host", default=DEFAULT_HOST)
        serve_parser.add_argument("--port", type=int, default=DEFAULT_PORT)
        serve_parser.add_argument("--data-dir", default=None)
        serve_parser.add_argument("--json", action="store_true")
        serve_parser.add_argument("--demo", action="store_true")
        serve_parser.add_argument("--no-browser", dest="open_browser", action="store_false", default=True)
        serve_parser.add_argument("--log-level", default="INFO")
        args, _unknown = serve_parser.parse_known_args(argv)
        return cmd_serve(_serve_defaults(args))

    args = parser.parse_args(argv)
    return int(args.func(args))
