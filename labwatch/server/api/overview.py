"""Aggregated endpoint used by the dashboard polling loop."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import Overview
from .deps import MonitoringDep

router = APIRouter(tags=["overview"])


@router.get("/overview", response_model=Overview, summary="System, GPUs and processes in one call")
def get_overview(monitoring: MonitoringDep) -> Overview:
    """Return everything the dashboard needs for a single refresh.

    The frontend polls this one endpoint so a refresh costs one round trip
    rather than three. ``gpus`` and ``processes`` are returned under those
    names (see :class:`~app.schemas.Overview`).
    """
    return monitoring.overview()
