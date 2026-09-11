"""API level tests.

The FastAPI application is exercised end to end with ``TestClient``. The NVML
layer is replaced by demo mode or by monkeypatching the collector, so the suite
passes on CI runners that have no NVIDIA GPU.
"""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from labwatch.server.main import create_app


@pytest.fixture
def client(demo_settings):
    app = create_app(demo_settings)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def real_client(tmp_settings):
    """Client in non-demo mode; NVML may or may not be present on this host."""
    app = create_app(tmp_settings)
    with TestClient(app) as test_client:
        yield test_client


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #
def test_health_returns_200(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    assert body["version"]
    assert body["database"] == "ok"
    assert body["demo_mode"] is True
    assert body["uptime_seconds"] >= 0


def test_health_reports_gpu_state_without_gpu(real_client: TestClient):
    body = real_client.get("/api/health").json()
    # Either a GPU is present, or the error explains why not; never a crash.
    assert isinstance(body["gpu_available"], bool)
    if not body["gpu_available"]:
        assert body["gpu_error"]


def test_health_reports_database_failure(client: TestClient, monkeypatch):
    context = client.app.state.context
    original_session = context.history.database.session

    class BrokenSession:
        def __enter__(self):
            raise RuntimeError("database is gone")

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(context.history.database, "session", lambda: BrokenSession())
    body = client.get("/api/health").json()
    assert body["status"] == "degraded"
    assert body["database"] == "error"
    assert "database is gone" in body["database_error"]
    monkeypatch.setattr(context.history.database, "session", original_session)


# --------------------------------------------------------------------------- #
# System
# --------------------------------------------------------------------------- #
def test_system_schema(client: TestClient):
    body = client.get("/api/system").json()

    assert body["host"]["hostname"]
    assert body["host"]["os"]
    assert "cpu" in body and "usage_percent" in body["cpu"]
    assert {"total", "used", "available", "percent"} <= set(body["memory"])
    assert isinstance(body["disks"], list) and body["disks"]
    assert body["disks"][0]["is_primary"] is True
    assert body["demo"] is True
    assert body["uptime_human"]


def test_system_reports_memory_breakdown(client: TestClient):
    """`free`, `cached` and `available` are exposed so the number can be reconciled."""
    memory = client.get("/api/system").json()["memory"]
    assert {"free", "cached", "available"} <= set(memory)
    if memory["total"] and memory["used"] is not None:
        assert 0 <= memory["used"] <= memory["total"]


def test_system_all_mounts_can_be_disabled(client: TestClient):
    """`all_mounts=false` restricts the response to the primary filesystem."""
    body = client.get("/api/system", params={"all_mounts": False}).json()
    assert len(body["disks"]) == 1
    assert body["disks"][0]["is_primary"] is True


def test_overview_includes_every_mount_by_default(demo_settings):
    """Regression: the dashboard only ever showed the root filesystem.

    The demo collector exposes two filesystems, and the overview payload (the one
    the UI actually polls) must carry both, otherwise a data volume filling up is
    invisible.
    """
    from labwatch.server.main import create_app

    app = create_app(demo_settings)
    with TestClient(app) as client:
        disks = client.get("/api/overview").json()["system"]["disks"]
    assert len(disks) == 2
    assert {d["mountpoint"] for d in disks} == {"/", "/data"}


def test_system_with_all_mounts(client: TestClient):
    body = client.get("/api/system", params={"all_mounts": True}).json()
    assert len(body["disks"]) == 2


# --------------------------------------------------------------------------- #
# GPUs
# --------------------------------------------------------------------------- #
def test_gpus_endpoint(client: TestClient):
    body = client.get("/api/gpus").json()

    assert body["available"] is True
    assert body["demo"] is True
    assert len(body["gpus"]) == 3
    gpu = body["gpus"][0]
    for field in (
        "index",
        "uuid",
        "name",
        "utilization_percent",
        "memory_used",
        "memory_total",
        "memory_percent",
        "temperature_c",
        "power_watts",
        "power_limit_watts",
    ):
        assert field in gpu
    assert 0 <= gpu["memory_percent"] <= 100


def test_gpus_endpoint_without_hardware(real_client: TestClient, monkeypatch):
    context = real_client.app.state.context
    context.monitoring.gpu_collector._init_error = "NVML Shared Library Not Found"

    body = real_client.get("/api/gpus").json()
    assert body["available"] is False
    assert body["gpus"] == []
    assert body["error"]


def test_processes_endpoint(client: TestClient):
    body = client.get("/api/processes").json()

    assert body["available"] is True
    assert len(body["processes"]) == 3
    proc = body["processes"][0]
    assert proc["pid"] > 0
    assert proc["command"]
    assert proc["runtime_human"]
    assert proc["username"]


def test_processes_endpoint_filter(client: TestClient):
    body = client.get("/api/processes", params={"gpu_index": 1}).json()
    assert [p["gpu_index"] for p in body["processes"]] == [1]


def test_processes_endpoint_rejects_negative_index(client: TestClient):
    assert client.get("/api/processes", params={"gpu_index": -1}).status_code == 422


# --------------------------------------------------------------------------- #
# Overview
# --------------------------------------------------------------------------- #
def test_overview_returns_everything(client: TestClient):
    body = client.get("/api/overview").json()

    assert {"system", "gpus", "processes", "poll_interval", "generated_at"} <= set(body)
    assert body["system"]["host"]["hostname"]
    assert body["gpus"]["gpus"]
    assert body["processes"]["processes"]
    assert body["poll_interval"] > 0


# --------------------------------------------------------------------------- #
# History
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("range_key", ["1h", "6h", "24h"])
def test_history_ranges_are_accepted(client: TestClient, range_key: str):
    response = client.get("/api/history/system", params={"range": range_key})
    assert response.status_code == 200
    body = response.json()
    assert body["range"] == range_key
    assert body["end"] > body["start"]
    assert body["points"]
    assert body["demo"] is True


def test_gpu_history_all_series(client: TestClient):
    body = client.get("/api/history/gpus", params={"range": "1h"}).json()
    assert {s["gpu_index"] for s in body["series"]} == {0, 1, 2}


def test_gpu_history_single_gpu(client: TestClient):
    body = client.get("/api/history/gpus/2", params={"range": "1h"}).json()
    assert [s["gpu_index"] for s in body["series"]] == [2]
    assert body["series"][0]["points"]


def test_history_range_validation(client: TestClient):
    response = client.get("/api/history/system", params={"range": "99x"})
    assert response.status_code == 422
    assert "1h" in response.text


def test_history_uses_persisted_rows(real_client: TestClient):
    context = real_client.app.state.context
    now = time.time()
    status = context.monitoring.system().model_copy(update={"collected_at": now - 30})
    context.history.record_system(status)

    body = real_client.get("/api/history/system", params={"range": "1h"}).json()
    assert body["demo"] is False
    assert len(body["points"]) >= 1


# --------------------------------------------------------------------------- #
# Misc
# --------------------------------------------------------------------------- #
def test_api_root_lists_endpoints(client: TestClient):
    body = client.get("/api").json()
    assert body["name"] == "LabWatch"
    assert "/api/overview" in body["endpoints"]


def test_openapi_schema_is_valid(client: TestClient):
    response = client.get("/api/openapi.json")
    assert response.status_code == 200
    assert response.json()["info"]["title"] == "LabWatch API"


def test_unknown_api_route_returns_404(client: TestClient):
    assert client.get("/api/does-not-exist").status_code == 404


def test_unknown_api_route_is_not_swallowed_by_the_spa_fallback(tmp_path, demo_settings):
    """Regression found when the dashboard started shipping inside the package.

    With a bundled UI present, the SPA fallback answered *every* unmatched path
    with index.html. A typo in an API call therefore returned HTTP 200 and a page
    of HTML instead of a 404, which is far harder to debug. Unknown ``/api/*``
    paths must stay real 404s while client-side routes still fall back.
    """
    bundle = tmp_path / "static"
    (bundle / "assets").mkdir(parents=True)
    (bundle / "index.html").write_text("<!doctype html><title>LabWatch</title>", encoding="utf-8")
    (bundle / "assets" / "app.js").write_text("console.log('x')", encoding="utf-8")

    settings = demo_settings.model_copy(update={"static_dir": bundle})
    app = create_app(settings)
    with TestClient(app) as static_client:
        missing = static_client.get("/api/does-not-exist")
        assert missing.status_code == 404
        assert missing.headers["content-type"].startswith("application/json")
        assert "Unknown endpoint" in missing.json()["detail"]

        # A real endpoint still works, and a client-side route still falls back.
        assert static_client.get("/api/health").status_code == 200
        assert static_client.get("/some/deep/route").status_code == 200


def test_cors_preflight_is_allowed(client: TestClient):
    response = client.options(
        "/api/overview",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"


def test_background_collector_writes_history(tmp_settings):
    """With the collector enabled, rows appear without any HTTP request."""
    settings = tmp_settings.model_copy(update={"enable_background_collector": True, "history_interval": 1.0})
    app = create_app(settings)
    with TestClient(app) as client:
        context = app.state.context
        assert context.collector_task is not None
        deadline = time.time() + 5
        while time.time() < deadline and context.history.last_write is None:
            time.sleep(0.1)
        assert context.history.last_write is not None
        body = client.get("/api/history/system", params={"range": "1h"}).json()
        assert len(body["points"]) >= 1
        assert client.get("/api/health").json()["collector_running"] is True
