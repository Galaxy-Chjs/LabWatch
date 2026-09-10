"""Tests for the background collector loop and the static frontend mount."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.collector import BackgroundCollector
from app.services.history import HistoryService
from app.services.monitoring import MonitoringService


class _FailingMonitoring:
    """Monitoring stub whose samples always raise."""

    def __init__(self) -> None:
        self.calls = 0

    def system(self):
        self.calls += 1
        raise RuntimeError("collector exploded")

    def gpus(self):  # pragma: no cover - not reached
        raise RuntimeError("collector exploded")

    def shutdown(self) -> None:
        return None


class _BrokenHistory:
    """History stub whose writes always raise."""

    last_write = None

    def record_system(self, *_args, **_kwargs):
        raise RuntimeError("disk is full")

    def record_gpus(self, *_args, **_kwargs):
        raise RuntimeError("disk is full")

    def prune(self, *_args, **_kwargs):
        raise RuntimeError("cannot prune")


@pytest.mark.asyncio
async def test_sample_failure_does_not_kill_the_loop(tmp_settings: Settings):
    collector = BackgroundCollector(tmp_settings, _FailingMonitoring(), _BrokenHistory())  # type: ignore[arg-type]
    await collector._collect_once()

    assert collector.errors == 1
    assert collector.writes == 0
    assert collector.running is False  # never started as a task


@pytest.mark.asyncio
async def test_write_failure_is_counted(tmp_settings: Settings, database, demo_settings):
    monitoring = MonitoringService(demo_settings)
    collector = BackgroundCollector(tmp_settings, monitoring, _BrokenHistory())  # type: ignore[arg-type]
    try:
        await collector._collect_once()
        assert collector.errors == 1
        assert collector.writes == 0
    finally:
        monitoring.shutdown()


@pytest.mark.asyncio
async def test_prune_failure_is_swallowed(tmp_settings: Settings, demo_settings):
    monitoring = MonitoringService(demo_settings)
    collector = BackgroundCollector(tmp_settings, monitoring, _BrokenHistory())  # type: ignore[arg-type]
    try:
        await collector._maybe_prune()
        assert collector._last_prune > 0
    finally:
        monitoring.shutdown()


@pytest.mark.asyncio
async def test_collector_records_and_stops(demo_settings: Settings, database):
    settings = demo_settings.model_copy(update={"history_interval": 0.2})
    monitoring = MonitoringService(settings)
    history = HistoryService(database, retention_hours=1.0)
    collector = BackgroundCollector(settings, monitoring, history)
    try:
        task = collector.start()
        assert collector.running is True
        deadline = time.time() + 5
        while time.time() < deadline and collector.writes < 2:
            await asyncio.sleep(0.05)
        assert collector.writes >= 2
        assert task is not None
        await collector.stop()
        assert collector.running is False
        assert history.system_history("1h").points
    finally:
        monitoring.shutdown()


@pytest.mark.asyncio
async def test_start_is_idempotent(demo_settings: Settings, database):
    settings = demo_settings.model_copy(update={"history_interval": 5.0})
    monitoring = MonitoringService(settings)
    collector = BackgroundCollector(settings, monitoring, HistoryService(database, 1.0))
    try:
        first = collector.start()
        second = collector.start()
        assert first is second
        await collector.stop()
    finally:
        monitoring.shutdown()


# --------------------------------------------------------------------------- #
# Health reporting of the collector
# --------------------------------------------------------------------------- #
def test_health_exposes_live_collector_state(tmp_path: Path):
    """Regression: a running server used to always report ``last_history_write: null``.

    The value was read from a context field that is only assigned during
    shutdown, so the number never appeared while the service was up.
    """
    settings = Settings(
        data_dir=tmp_path,
        demo_mode=True,
        enable_background_collector=True,
        history_interval=0.5,
        _env_file=None,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        # Wait for a *completed* collection cycle. Polling on last_history_write
        # alone is not enough: it can already hold a value from a previous
        # in-process app, while this app's first sample is still in flight.
        deadline = time.time() + 10
        body = client.get("/api/health").json()
        while body["collector_writes"] < 1 and time.time() < deadline:
            time.sleep(0.1)
            body = client.get("/api/health").json()

        assert body["collector_writes"] >= 1
        assert body["collector_errors"] == 0
        assert body["collector_running"] is True
        assert body["collector_interval_seconds"] == 0.5
        # The regression: this used to stay null for the lifetime of the server
        # because it was read from a field only assigned during shutdown.
        assert body["last_history_write"] is not None
        assert body["last_history_write"] <= time.time()

        # Read the stored rows directly rather than through the derived health
        # field, whose exact value depends on how many intervals elapsed.
        assert app.state.context.history.system_history("24h").points


def test_health_without_collector_reports_no_writes(tmp_settings: Settings):
    app = create_app(tmp_settings)
    with TestClient(app) as client:
        body = client.get("/api/health").json()
        assert body["collector_running"] is False
        assert body["collector_writes"] == 0
        assert body["collector_interval_seconds"] is None
        assert body["last_history_write"] is None


# --------------------------------------------------------------------------- #
# Static frontend serving
# --------------------------------------------------------------------------- #
@pytest.fixture
def static_bundle(tmp_path: Path) -> Path:
    """A minimal pre-built frontend bundle."""
    directory = tmp_path / "static"
    (directory / "assets").mkdir(parents=True)
    (directory / "index.html").write_text("<!doctype html><title>LabWatch</title>", encoding="utf-8")
    (directory / "assets" / "app.js").write_text("console.log('labwatch')", encoding="utf-8")
    (directory / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    (directory / "robots.txt").write_text("User-agent: *", encoding="utf-8")
    return directory


def test_frontend_is_served_when_present(tmp_path: Path, static_bundle: Path, demo_settings: Settings):
    settings = demo_settings.model_copy(update={"static_dir": static_bundle})
    app = create_app(settings)
    with TestClient(app) as client:
        root = client.get("/")
        assert root.status_code == 200
        assert "LabWatch" in root.text

        # Real files under the bundle are served directly.
        assert client.get("/assets/app.js").status_code == 200
        assert client.get("/favicon.svg").status_code == 200
        assert client.get("/robots.txt").status_code == 200

        # Unknown client-side routes fall back to index.html.
        fallback = client.get("/some/deep/route")
        assert fallback.status_code == 200
        assert "LabWatch" in fallback.text

        # The API keeps working alongside the static mount.
        assert client.get("/api/health").status_code == 200


def test_frontend_not_mounted_when_missing(tmp_path: Path, demo_settings: Settings):
    settings = demo_settings.model_copy(update={"static_dir": tmp_path / "does-not-exist"})
    app = create_app(settings)
    with TestClient(app) as client:
        assert client.get("/").status_code == 404
        assert client.get("/api/health").status_code == 200


def test_static_dir_without_index_is_ignored(tmp_path: Path, demo_settings: Settings):
    empty = tmp_path / "empty"
    empty.mkdir()
    settings = demo_settings.model_copy(update={"static_dir": empty})
    app = create_app(settings)
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/").status_code == 404


def test_spa_never_escapes_the_static_directory(tmp_path: Path, static_bundle: Path, demo_settings: Settings):
    secret = tmp_path / "secret.txt"
    secret.write_text("top secret", encoding="utf-8")

    settings = demo_settings.model_copy(update={"static_dir": static_bundle})
    app = create_app(settings)
    with TestClient(app) as client:
        response = client.get("/../secret.txt")
        assert "top secret" not in response.text
