"""Host level metrics endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..schemas import SystemStatus
from .deps import MonitoringDep

router = APIRouter(tags=["system"])


@router.get("/system", response_model=SystemStatus, summary="Host CPU, memory, disk and uptime")
def get_system(
    monitoring: MonitoringDep,
    all_mounts: bool = Query(False, description="Include every mounted filesystem, not just the primary disk."),
) -> SystemStatus:
    """Return the current host sample."""
    return monitoring.system(include_all_mounts=all_mounts)
