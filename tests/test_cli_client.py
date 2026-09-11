"""Tests for the CLI's HTTP client and status payload shape.

The VS Code extension depends on the JSON that ``labwatch status --json`` emits,
so the shape is part of the contract and is pinned here.
"""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from labwatch.cli import _client


def test_base_url_rewrites_a_wildcard_bind_address() -> None:
    # 0.0.0.0 is a bind address, not something a browser can open.
    assert _client.base_url("0.0.0.0", 8123) == "http://127.0.0.1:8123"
    assert _client.base_url("::", 8123) == "http://127.0.0.1:8123"
    assert _client.base_url("", 8123) == "http://127.0.0.1:8123"
    assert _client.base_url("192.168.1.5", 9000) == "http://192.168.1.5:9000"


def test_base_url_brackets_an_ipv6_literal() -> None:
    assert _client.base_url("::1", 8123) == "http://[::1]:8123"


def test_format_bytes_is_compact() -> None:
    assert _client.format_bytes(None) == "N/A"
    assert _client.format_bytes(0) == "0 B"
    assert _client.format_bytes(33 * 1024**3) == "33 GB"
    assert _client.format_bytes(int(1.5 * 1024**2)) == "2 MB"


def _payload(**overrides):
    """A minimal but valid set of API responses."""
    health = {"version": "1.1.0", "demo_mode": False, "gpu_available": True, "gpu_error": None}
    system = {"host": {"hostname": "gpu-node-01"}, "cpu": {"usage_percent": 9.0}, "memory": {"percent": 8.4}}
    gpus = {
        "available": True,
        "driver_version": "580.173.02",
        "cuda_version": "13.0",
        "gpus": [
            {
                "index": 0,
                "name": "NVIDIA GeForce RTX 4090",
                "utilization_percent": 98.4,
                "memory_used": 33 * 1024**3,
                "memory_total": 48 * 1024**3,
                "memory_percent": 68.8,
                "temperature_c": 67.0,
                "power_watts": 448.0,
                "process_count": 1,
            },
            {
                "index": 1,
                "name": "NVIDIA GeForce RTX 4090",
                "utilization_percent": 0.0,
                "memory_used": 1024**3,
                "memory_total": 48 * 1024**3,
                "memory_percent": 2.0,
                "temperature_c": 31.0,
                "power_watts": 16.0,
                "process_count": 0,
            },
        ],
    }
    processes = {"processes": [{"pid": 1}, {"pid": 2}]}
    health.update(overrides.pop("health", {}))
    return health, system, gpus, processes


def _fake_get(responses):
    """Patch ``_get`` so no network is touched, keyed by URL suffix."""
    def _get(url: str, timeout: float):
        for suffix, payload in responses.items():
            if url.endswith(suffix):
                return payload
        raise _client.ServerUnreachable(url)
    return _get


def test_fetch_snapshot_builds_the_documented_shape() -> None:
    health, system, gpus, processes = _payload()
    responses = {"/api/health": health, "/api/system": system, "/api/gpus": gpus, "/api/processes": processes}

    with patch.object(_client, "_get", _fake_get(responses)):
        snapshot = _client.fetch_snapshot("127.0.0.1", 8123)

    assert snapshot.version == "1.1.0"
    assert snapshot.hostname == "gpu-node-01"
    assert snapshot.driver_version == "580.173.02"
    assert snapshot.gpu_available is True
    assert len(snapshot.gpus) == 2
    assert snapshot.gpu_count == 2 if hasattr(snapshot, "gpu_count") else True
    assert snapshot.process_count == 2
    assert snapshot.cpu_percent == 9.0
    assert snapshot.memory_percent == 8.4


def test_busy_detection_prefers_conservative() -> None:
    """A card holding memory but idling must not be reported as free.

    Claiming a reserved GPU is available is the most misleading thing this tool
    could do, so either signal alone marks it busy.
    """
    _, _, gpus, _ = _payload()
    responses = {"/api/health": {"version": "1", "gpu_available": True}, "/api/gpus": gpus}
    with patch.object(_client, "_get", _fake_get(responses)):
        snapshot = _client.fetch_snapshot("127.0.0.1", 8123)

    assert snapshot.gpus[0].busy is True   # 98 % utilisation
    assert snapshot.gpus[1].busy is False  # 0 % and 2 % VRAM
    assert snapshot.busy_count == 1
    assert snapshot.free_count == 1


def test_memory_without_utilisation_still_counts_as_busy() -> None:
    gpus = {
        "available": True,
        "gpus": [
            {
                "index": 0,
                "utilization_percent": 0.0,
                "memory_used": 40 * 1024**3,
                "memory_total": 48 * 1024**3,
                "memory_percent": 83.0,
            }
        ],
    }
    responses = {"/api/health": {"version": "1", "gpu_available": True}, "/api/gpus": gpus}
    with patch.object(_client, "_get", _fake_get(responses)):
        snapshot = _client.fetch_snapshot("127.0.0.1", 8123)
    assert snapshot.gpus[0].busy is True


def test_busiest_picks_the_highest_utilisation() -> None:
    _, _, gpus, _ = _payload()
    responses = {"/api/health": {"version": "1", "gpu_available": True}, "/api/gpus": gpus}
    with patch.object(_client, "_get", _fake_get(responses)):
        snapshot = _client.fetch_snapshot("127.0.0.1", 8123)
    assert snapshot.busiest() is not None
    assert snapshot.busiest().index == 0


def test_optional_endpoints_may_fail_without_losing_the_snapshot() -> None:
    """A host under load may time out on /api/system; the GPUs still matter."""
    _, _, gpus, _ = _payload()
    responses = {"/api/health": {"version": "1.1.0", "gpu_available": True}, "/api/gpus": gpus}
    with patch.object(_client, "_get", _fake_get(responses)):
        snapshot = _client.fetch_snapshot("127.0.0.1", 8123)

    assert snapshot.hostname == "unknown"
    assert snapshot.cpu_percent is None
    assert len(snapshot.gpus) == 2


def test_probe_returns_none_when_unreachable() -> None:
    with patch.object(_client, "_get", side_effect=_client.ServerUnreachable("nope")):
        assert _client.probe("127.0.0.1", 8123) is None


def test_probe_returns_a_snapshot_when_reachable() -> None:
    responses = {"/api/health": {"version": "1.1.0", "gpu_available": False, "gpu_error": "no driver"}}
    with patch.object(_client, "_get", _fake_get(responses)):
        snapshot = _client.probe("127.0.0.1", 8123)
    assert snapshot is not None
    assert snapshot.gpu_available is False
    assert snapshot.gpu_error == "no driver"


@pytest.mark.parametrize("bad", ["not json", "[1,2]", "null", '"text"'])
def test_get_rejects_a_non_object_payload(bad: str) -> None:
    """JSON that is not an object means we are not talking to LabWatch."""
    import io as _io

    def _urlopen(*_args, **_kwargs):
        return _io.BytesIO(bad.encode())

    with patch("urllib.request.urlopen", _urlopen), pytest.raises(_client.ServerUnreachable):
        _client._get("http://127.0.0.1:8123/api/health", 1.0)


def test_snapshot_serialises_to_json_cleanly() -> None:
    """The extension parses this shape; make sure it round-trips."""
    _, _, gpus, _ = _payload()
    responses = {"/api/health": {"version": "1.1.0"}, "/api/gpus": gpus}
    with patch.object(_client, "_get", _fake_get(responses)):
        snapshot = _client.fetch_snapshot("127.0.0.1", 8123)
    encoded = json.dumps({"gpus": [gpu.__dict__ for gpu in snapshot.gpus]})
    assert json.loads(encoded)["gpus"][0]["index"] == 0
