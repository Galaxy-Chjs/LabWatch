"""Host level metrics endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..schemas import SystemStatus
from .deps import MonitoringDep

router = APIRouter(tags=["system"])


@router.get("/system", response_model=SystemStatus, summary="Host CPU, memory, disk and uptime")
def get_system(
    monitoring: MonitoringDep,
    all_mounts: bool | None = Query(
        None,
        description=(
            "Report every real mounted filesystem. Defaults to "
            "LABWATCH_INCLUDE_ALL_MOUNTS (true), because the disk that fills up on a "
            "lab server is usually a data volume rather than the root filesystem."
        ),
    ),
) -> SystemStatus:
    """Return the current host sample.

    ``all_mounts=false`` restricts the response to the primary filesystem.
    """
    return monitoring.system(include_all_mounts=all_mounts)
