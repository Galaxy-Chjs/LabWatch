"""LabWatch application factory and ASGI entry point.

Run locally with::

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .api import gpu, health, history, overview, system
from .api.deps import AppContext
from .config import Settings, get_settings
from .database import Database
from .services import BackgroundCollector, HistoryService, MonitoringService

logger = logging.getLogger(__name__)

API_PREFIX = "/api"


def configure_logging(settings: Settings) -> None:
    """Configure root logging once, using a compact readable format."""
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        force=True,
    )
    # Uvicorn access logs at INFO are noisy for a 2s polling dashboard.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Wire up database, collectors and the background task."""
    settings: Settings = getattr(app.state, "settings", None) or get_settings()
    configure_logging(settings)

    logger.info(
        "Starting LabWatch %s (demo_mode=%s, poll=%.1fs, history=%.1fs, retention=%.0fh)",
        __version__,
        settings.demo_mode,
        settings.poll_interval,
        settings.history_interval,
        settings.retention_hours,
    )

    database = Database(settings.resolved_database_url)
    try:
        database.create_all()
    except Exception:
        logger.exception("Failed to create the database schema at %s", settings.resolved_database_url)

    history_service = HistoryService(
        database=database,
        retention_hours=settings.retention_hours,
        max_rows=settings.retention_max_rows,
    )
    monitoring = MonitoringService(settings)

    collector: BackgroundCollector | None = None
    task = None
    if settings.enable_background_collector:
        collector = BackgroundCollector(settings, monitoring, history_service)
        task = collector.start()

    context = AppContext(
        settings=settings,
        monitoring=monitoring,
        history=history_service,
        started_at=time.time(),
        collector=collector,
        collector_task=task,
    )
    app.state.context = context

    try:
        yield
    finally:
        if collector is not None:
            await collector.stop()
            context.last_history_write = history_service.last_write
        monitoring.shutdown()
        database.dispose()
        logger.info("LabWatch stopped")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the FastAPI application.

    Args:
        settings: optional overrides, mainly for tests.
    """
    resolved = settings or get_settings()
    app = FastAPI(
        title="LabWatch API",
        version=__version__,
        description=(
            "Lightweight self-hosted monitoring for NVIDIA GPUs and AI development servers. "
            "Read-only: LabWatch never modifies the host it monitors."
        ),
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings = resolved

    origins = resolved.cors_origin_list
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(system.router, prefix=API_PREFIX)
    app.include_router(gpu.router, prefix=API_PREFIX)
    app.include_router(history.router, prefix=API_PREFIX)
    app.include_router(overview.router, prefix=API_PREFIX)

    @app.get("/api", include_in_schema=False)
    def api_root() -> dict[str, object]:
        """Small discovery payload for humans poking at the API."""
        return {
            "name": "LabWatch",
            "version": __version__,
            "demo_mode": resolved.demo_mode,
            "endpoints": [
                "/api/health",
                "/api/overview",
                "/api/system",
                "/api/gpus",
                "/api/processes",
                "/api/history/system?range=1h",
                "/api/history/gpus/0?range=1h",
                "/api/docs",
            ],
        }

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Never leak a stack trace to the browser; log it instead."""
        logger.exception("Unhandled error while serving %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal LabWatch error", "error": type(exc).__name__},
        )

    _mount_frontend(app, resolved)
    return app


def _mount_frontend(app: FastAPI, settings: Settings) -> None:
    """Serve a pre-built frontend bundle when one is available.

    In development the Vite dev server serves the UI and proxies ``/api``, so
    nothing is mounted here.
    """
    static_dir = settings.resolved_static_dir
    if static_dir is None:
        return
    index = static_dir / "index.html"
    if not index.is_file():
        logger.warning("Static directory %s has no index.html; frontend not served", static_dir)
        return

    assets = static_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        """Serve static files, falling back to index.html for client routes."""
        candidate: Path = static_dir / full_path
        if full_path and candidate.is_file() and static_dir in candidate.resolve().parents:
            return FileResponse(candidate)
        return FileResponse(index)

    logger.info("Serving pre-built frontend from %s", static_dir)


app = create_app()
