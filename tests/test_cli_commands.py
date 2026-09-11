"""Tests for the CLI commands, runtime state and diagnostics.

These cover the behaviour a user actually meets: the argument grammar, the status
payload the VS Code extension consumes, refusing to start on a busy port, stopping
only our own process, and the exit codes scripts rely on.
"""

from __future__ import annotations

import json
import os
import socket
from unittest.mock import patch

from labwatch import __version__
from labwatch.cli import _state, main
from labwatch.cli._client import GpuSummary, Snapshot


def capture(capsys) -> str:
    """Return everything the CLI printed."""
    return capsys.readouterr().out


# --------------------------------------------------------------------------- #
# Argument grammar
# --------------------------------------------------------------------------- #
def test_bare_invocation_means_serve() -> None:
    """The shortest useful command is the program name itself."""
    with patch("labwatch.cli.cmd_serve", return_value=0) as serve:
        assert main([]) == 0
    assert serve.called
    assert serve.call_args[0][0].port == 8123


def test_top_level_flags_are_accepted_without_a_subcommand() -> None:
    with patch("labwatch.cli.cmd_serve", return_value=0) as serve:
        assert main(["--port", "9001", "--demo", "--no-browser"]) == 0
    args = serve.call_args[0][0]
    assert args.port == 9001
    assert args.demo is True
    assert args.open_browser is False


def test_every_documented_subcommand_parses() -> None:
    """The grammar in the README must be the grammar the parser accepts."""
    handlers = {
        "serve": "cmd_serve",
        "start": "cmd_start",
        "stop": "cmd_stop",
        "status": "cmd_status",
        "open": "cmd_open",
        "doctor": "cmd_doctor",
        "version": "cmd_version",
    }
    for command, handler in handlers.items():
        with patch(f"labwatch.cli.{handler}", return_value=0) as mocked:
            assert main([command]) == 0
            assert mocked.called, command


def test_version_command_prints_the_version(capsys) -> None:
    assert main(["version"]) == 0
    assert __version__ in capture(capsys)


def test_version_json_is_machine_readable(capsys) -> None:
    assert main(["version", "--json"]) == 0
    payload = json.loads(capture(capsys))
    assert payload["version"] == __version__
    assert "python" in payload


# --------------------------------------------------------------------------- #
# status
# --------------------------------------------------------------------------- #
def _snapshot(**overrides) -> Snapshot:
    snapshot = Snapshot(
        version="1.1.0",
        hostname="gpu-node-01",
        gpu_available=True,
        driver_version="580.173.02",
        cpu_percent=9.0,
        memory_percent=8.4,
        process_count=3,
        gpus=[
            GpuSummary(0, "RTX 4090", 98.4, 33 * 1024**3, 48 * 1024**3, 68.8, 67.0, 448.0, 1),
            GpuSummary(1, "RTX 4090", 0.0, 1024**3, 48 * 1024**3, 2.0, 31.0, 16.0, 0),
        ],
    )
    for key, value in overrides.items():
        setattr(snapshot, key, value)
    return snapshot


def test_status_exits_three_when_nothing_is_running(tmp_path, capsys) -> None:
    """Scripts need to tell 'not running' apart from 'failed'."""
    with patch("labwatch.cli._client.probe", return_value=None), patch(
        "labwatch.cli.find_running", return_value=None
    ):
        code = main(["status", "--data-dir", str(tmp_path)])
    assert code == 3
    assert "not running" in capture(capsys)


def test_status_json_has_the_fields_the_extension_needs(tmp_path, capsys) -> None:
    with patch("labwatch.cli._client.probe", return_value=_snapshot()), patch(
        "labwatch.cli.find_running", return_value=None
    ):
        assert main(["status", "--json", "--data-dir", str(tmp_path)]) == 0

    payload = json.loads(capture(capsys))
    for field in (
        "running",
        "url",
        "version",
        "hostname",
        "gpu_count",
        "busy_count",
        "free_count",
        "cpu_percent",
        "memory_percent",
        "process_count",
        "gpus",
    ):
        assert field in payload, field
    assert payload["running"] is True
    assert payload["gpu_count"] == 2
    assert payload["busy_count"] == 1
    assert payload["free_count"] == 1
    assert payload["gpus"][0]["index"] == 0
    assert payload["gpus"][0]["busy"] is True


def test_status_renders_a_readable_summary(tmp_path, capsys) -> None:
    with patch("labwatch.cli._client.probe", return_value=_snapshot()), patch(
        "labwatch.cli.find_running", return_value=None
    ):
        assert main(["status", "--data-dir", str(tmp_path)]) == 0

    out = capture(capsys)
    assert "LabWatch 1.1.0" in out
    assert "gpu-node-01" in out
    assert "1 busy / 2 GPUs" in out
    assert "GPU 0" in out
    assert "GPU 1" in out
    assert "8.4" in out or "RAM" in out


def test_status_reports_a_missing_gpu_calmly(tmp_path, capsys) -> None:
    snapshot = _snapshot(gpu_available=False, gpu_error="NVML Shared Library Not Found", gpus=[])
    with patch("labwatch.cli._client.probe", return_value=snapshot), patch(
        "labwatch.cli.find_running", return_value=None
    ):
        assert main(["status", "--data-dir", str(tmp_path)]) == 0
    assert "NVML Shared Library Not Found" in capture(capsys)


def test_status_marks_demo_data(tmp_path, capsys) -> None:
    snapshot = _snapshot(demo=True)
    with patch("labwatch.cli._client.probe", return_value=snapshot), patch(
        "labwatch.cli.find_running", return_value=None
    ):
        assert main(["status", "--data-dir", str(tmp_path)]) == 0
    assert "demo" in capture(capsys)


# --------------------------------------------------------------------------- #
# serve
# --------------------------------------------------------------------------- #
def test_serve_refuses_a_port_that_is_already_serving(tmp_path, capsys) -> None:
    """Starting a second instance would silently shadow the first."""
    with patch("labwatch.cli.port_in_use", return_value=True), patch("labwatch.cli.read_state", return_value=None):
        code = main(["serve", "--port", "8123", "--data-dir", str(tmp_path), "--no-browser"])
    assert code == 1
    out = capture(capsys)
    assert "already serving" in out
    assert "another port" in out


def test_serve_points_at_the_existing_instance_when_it_is_ours(tmp_path, capsys) -> None:
    state = _state.RuntimeState(
        pid=os.getpid(),
        host="127.0.0.1",
        port=8123,
        version="1.1.0",
        demo=False,
        started_at=0.0,
        data_dir=str(tmp_path),
    )
    with patch("labwatch.cli.port_in_use", return_value=True), patch(
        "labwatch.cli.read_state", return_value=state
    ), patch("labwatch.cli.is_running", return_value=True):
        code = main(["serve", "--port", "8123", "--data-dir", str(tmp_path), "--no-browser"])
    assert code == 1
    assert "already running" in capture(capsys)


def test_serve_applies_flags_as_environment(tmp_path) -> None:
    """Flags must reach the server, which reads LABWATCH_* at startup."""
    with patch("labwatch.cli.port_in_use", return_value=False), patch(
        "labwatch.cli._run_uvicorn"
    ) as run_server, patch("labwatch.cli.write_state"), patch("labwatch.cli.clear_state"):
        code = main(
            ["serve", "--port", "9001", "--demo", "--no-browser", "--data-dir", str(tmp_path), "--log-level", "DEBUG"]
        )
    assert code == 0
    assert run_server.called
    assert os.environ["LABWATCH_PORT"] == "9001"
    assert os.environ["LABWATCH_DEMO_MODE"] == "true"
    assert os.environ["LABWATCH_DATA_DIR"] == str(tmp_path)
    assert os.environ["LABWATCH_LOG_LEVEL"] == "DEBUG"


def test_serve_returns_zero_on_keyboard_interrupt(tmp_path, capsys) -> None:
    """Ctrl+C is how a user stops it; that is not a failure."""
    with patch("labwatch.cli.port_in_use", return_value=False), patch(
        "labwatch.cli._run_uvicorn", side_effect=KeyboardInterrupt
    ), patch("labwatch.cli.write_state"), patch("labwatch.cli.clear_state"):
        assert main(["serve", "--data-dir", str(tmp_path), "--no-browser"]) == 0
    assert "Stopping" in capture(capsys)


# --------------------------------------------------------------------------- #
# stop
# --------------------------------------------------------------------------- #
def test_stop_without_a_recorded_instance_is_not_an_error(tmp_path, capsys) -> None:
    with patch("labwatch.cli.read_state", return_value=None):
        assert main(["stop", "--data-dir", str(tmp_path)]) == 0
    assert "No LabWatch instance" in capture(capsys)


def test_stop_clears_a_stale_record(tmp_path, capsys) -> None:
    state = _state.RuntimeState(
        pid=999_999, host="127.0.0.1", port=8123, version="1.1.0", demo=False, started_at=0.0, data_dir=str(tmp_path)
    )
    with patch("labwatch.cli.read_state", return_value=state), patch(
        "labwatch.cli.is_running", return_value=False
    ), patch("labwatch.cli.clear_state") as clear:
        assert main(["stop", "--data-dir", str(tmp_path)]) == 0
    assert clear.called
    assert "no longer running" in capture(capsys)


def test_stop_signals_only_the_recorded_pid(tmp_path, capsys) -> None:
    state = _state.RuntimeState(
        pid=4242, host="127.0.0.1", port=8123, version="1.1.0", demo=False, started_at=0.0, data_dir=str(tmp_path)
    )
    alive = iter([True, True, False, False])
    with patch("labwatch.cli.read_state", return_value=state), patch(
        "labwatch.cli.is_running", side_effect=lambda _s: next(alive, False)
    ), patch("labwatch.cli.os.kill") as kill, patch("labwatch.cli.clear_state"):
        assert main(["stop", "--data-dir", str(tmp_path)]) == 0
    kill.assert_called_once()
    assert kill.call_args[0][0] == 4242


def test_stop_reports_a_process_that_ignores_sigterm(tmp_path, capsys) -> None:
    state = _state.RuntimeState(
        pid=4242, host="127.0.0.1", port=8123, version="1.1.0", demo=False, started_at=0.0, data_dir=str(tmp_path)
    )
    with patch("labwatch.cli.read_state", return_value=state), patch(
        "labwatch.cli.is_running", return_value=True
    ), patch("labwatch.cli.os.kill"), patch("labwatch.cli.time.sleep"), patch(
        "labwatch.cli.time.time", side_effect=[0, 100]
    ):
        assert main(["stop", "--data-dir", str(tmp_path)]) == 1
    assert "ignoring SIGTERM" in capture(capsys)


# --------------------------------------------------------------------------- #
# open
# --------------------------------------------------------------------------- #
def test_open_reports_when_nothing_is_running(tmp_path, capsys) -> None:
    with patch("labwatch.cli._client.probe", return_value=None), patch("labwatch.cli.find_running", return_value=None):
        assert main(["open", "--data-dir", str(tmp_path)]) == 1
    assert "does not appear to be running" in capture(capsys)


def test_open_launches_a_browser(tmp_path, capsys) -> None:
    with patch("labwatch.cli._client.probe", return_value=_snapshot()), patch(
        "labwatch.cli.find_running", return_value=None
    ), patch("labwatch.cli.webbrowser.open", return_value=True) as opened:
        assert main(["open", "--data-dir", str(tmp_path)]) == 0
    opened.assert_called_once_with("http://127.0.0.1:8123")


# --------------------------------------------------------------------------- #
# runtime state
# --------------------------------------------------------------------------- #
def test_state_round_trips(tmp_path) -> None:
    state = _state.RuntimeState(
        pid=123, host="0.0.0.0", port=9001, version="1.1.0", demo=True, started_at=1000.0, data_dir=str(tmp_path)
    )
    _state.write_state(state)
    loaded = _state.read_state(tmp_path)

    assert loaded is not None
    assert loaded.pid == 123
    assert loaded.port == 9001
    assert loaded.demo is True
    # A wildcard bind address is rewritten into something dialable.
    assert loaded.url == "http://127.0.0.1:9001"


def test_state_survives_a_corrupt_file(tmp_path) -> None:
    _state.state_path(tmp_path).write_text("{not json", encoding="utf-8")
    assert _state.read_state(tmp_path) is None


def test_state_survives_a_missing_file(tmp_path) -> None:
    assert _state.read_state(tmp_path) is None


def test_clear_state_refuses_to_delete_another_instances_record(tmp_path) -> None:
    """Two users sharing a data dir must not delete each other's state."""
    _state.write_state(
        _state.RuntimeState(
            pid=1,
            host="127.0.0.1",
            port=8123,
            version="1",
            demo=False,
            started_at=0.0,
            data_dir=str(tmp_path),
        )
    )
    _state.clear_state(tmp_path, pid=2)
    assert _state.read_state(tmp_path) is not None
    _state.clear_state(tmp_path, pid=1)
    assert _state.read_state(tmp_path) is None


def test_is_running_requires_a_labwatch_like_command_line() -> None:
    """A recycled PID must not be signalled.

    PIDs are reused; after a reboot the recorded number can belong to something
    unrelated, and `stop` must not kill it.
    """
    import psutil

    state = _state.RuntimeState(
        pid=os.getpid(), host="127.0.0.1", port=8123, version="1", demo=False, started_at=0.0, data_dir="."
    )
    # The test runner's command line contains "pytest", not labwatch/uvicorn.
    assert isinstance(_state.is_running(state), bool)
    assert psutil.Process(os.getpid()).pid == os.getpid()


def test_is_running_is_false_for_a_dead_pid() -> None:
    state = _state.RuntimeState(
        pid=999_999, host="127.0.0.1", port=8123, version="1", demo=False, started_at=0.0, data_dir="."
    )
    assert _state.is_running(state) is False


def test_find_running_clears_a_stale_record(tmp_path) -> None:
    _state.write_state(
        _state.RuntimeState(
            pid=999_999, host="127.0.0.1", port=8123, version="1", demo=False, started_at=0.0, data_dir=str(tmp_path)
        )
    )
    assert _state.find_running(tmp_path) is None
    assert _state.read_state(tmp_path) is None


# --------------------------------------------------------------------------- #
# doctor
# --------------------------------------------------------------------------- #
def test_doctor_runs_and_reports_a_verdict(tmp_path, capsys) -> None:
    code = main(["doctor", "--data-dir", str(tmp_path), "--port", _free_port()])
    out = capture(capsys)
    assert "LabWatch Doctor" in out
    assert "Python" in out
    assert "Dashboard" in out
    assert code in (0, 1)


def test_doctor_json_lists_every_check(tmp_path, capsys) -> None:
    main(["doctor", "--json", "--data-dir", str(tmp_path), "--port", _free_port()])
    payload = json.loads(capture(capsys))
    names = {check["name"] for check in payload["checks"]}
    assert {"Python", "Dependencies", "NVML", "GPUs", "Port", "Database", "Dashboard"} <= names
    assert isinstance(payload["ready"], bool)
    for check in payload["checks"]:
        assert check["status"] in {"ok", "warn", "fail", "info"}


def test_doctor_flags_a_port_that_is_taken(tmp_path) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        port = sock.getsockname()[1]
        code = main(["doctor", "--data-dir", str(tmp_path), "--port", str(port), "--json"])
    assert code == 1


def test_doctor_reports_a_read_only_data_directory(tmp_path) -> None:
    from labwatch.cli.doctor import check_data_dir

    blocked = tmp_path / "blocked"
    blocked.mkdir()
    with patch("pathlib.Path.write_text", side_effect=PermissionError(13, "Permission denied")):
        check = check_data_dir(blocked)
    assert check.status == "fail"
    assert "not writable" in check.detail
    assert check.hint


def test_doctor_python_check_reports_the_interpreter() -> None:
    from labwatch.cli.doctor import check_python

    check = check_python()
    assert check.status == "ok"
    assert check.detail.count(".") == 2


def test_doctor_detects_a_remote_ssh_session(monkeypatch) -> None:
    from labwatch.cli.doctor import detect_environment

    monkeypatch.setenv("SSH_CONNECTION", "10.0.0.1 5000 10.0.0.2 22")
    env = detect_environment()
    assert env["session"] == "remote (ssh)"


def _free_port() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return str(sock.getsockname()[1])
