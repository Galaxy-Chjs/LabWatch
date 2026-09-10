"""Service status endpoint."""

from __future__ import annotations

import time

from fastapi import APIRouter
from sqlalchemy import text

from .. import __version__
from ..schemas import HealthStatus
from .deps import ContextDep

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthStatus, summary="Service health probe")
def health(context: ContextDep) -> HealthStatus:
    """Report whether the API, the database and NVML are usable.

    Always returns HTTP 200 so that container health checks and uptime probes
    can distinguish "reachable but degraded" from "unreachable".
    """
    database: str = "ok"
    database_error: str | None = None
    try:
        with context.history.database.session() as session:
            session.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - health must never raise
        database = "error"
        database_error = f"{type(exc).__name__}: {exc}"

    gpu_available = False
    gpu_error: str | None = None
    gpu_count = 0
    try:
        collection = context.monitoring.gpus()
        gpu_available = collection.available
        gpu_count = len(collection.gpus)
        gpu_error = collection.error
    except Exception as exc:  # noqa: BLE001
        gpu_error = f"{type(exc).__name__}: {exc}"

    collector_task = context.collector_task
    collector_running = bool(collector_task is not None and not getattr(collector_task, "done", lambda: True)())
    collector = context.collector

    history_points = None
    try:
        history_points = len(context.history.system_history("24h").points)
    except Exception:  # noqa: BLE001 - a broken history table must not break health
        history_points = None

    return HealthStatus(
        status="ok" if database == "ok" else "degraded",
        version=__version__,
        uptime_seconds=max(0.0, time.time() - context.started_at),
        database=database,  # type: ignore[arg-type]
        database_error=database_error,
        gpu_available=gpu_available,
        gpu_error=gpu_error,
        gpu_count=gpu_count,
        demo_mode=context.settings.demo_mode,
        collector_running=collector_running,
        collector_interval_seconds=getattr(collector, "interval_seconds", None),
        collector_writes=int(getattr(collector, "writes", 0)),
        collector_errors=int(getattr(collector, "errors", 0)),
        # Read the live value from the history service, not the snapshot taken at
        # shutdown: otherwise a running server always reported ``null``.
        last_history_write=context.history.last_write or context.last_history_write,
        history_points=history_points,
    )
