"""FastAPI dependency wiring.

A single :class:`AppContext` lives on ``app.state`` and is handed to route
handlers through the functions below, which keeps routers free of globals and
makes them straightforward to override in tests.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from ..config import Settings
from ..services import HistoryService, MonitoringService
from ..services.collector import BackgroundCollector


@dataclass
class AppContext:
    """Everything the API layer needs, created during application startup."""

    settings: Settings
    monitoring: MonitoringService
    history: HistoryService
    started_at: float
    collector: BackgroundCollector | None = field(default=None, repr=False)
    collector_task: object | None = field(default=None, repr=False)
    last_history_write: float | None = None


def get_context(request: Request) -> AppContext:
    """Return the application context attached to ``app.state``."""
    context = getattr(request.app.state, "context", None)
    if context is None:  # pragma: no cover - only during a broken startup
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LabWatch application context is not initialised",
        )
    return context


def get_settings_dep(request: Request) -> Settings:
    """Return the active settings object."""
    return get_context(request).settings


def get_monitoring(request: Request) -> MonitoringService:
    """Return the live monitoring service."""
    return get_context(request).monitoring


def get_history(request: Request) -> HistoryService:
    """Return the history service."""
    return get_context(request).history


ContextDep = Annotated[AppContext, Depends(get_context)]
MonitoringDep = Annotated[MonitoringService, Depends(get_monitoring)]
HistoryDep = Annotated[HistoryService, Depends(get_history)]
