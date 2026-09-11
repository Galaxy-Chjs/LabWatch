"""NVIDIA GPU and GPU process endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..schemas import GpuCollection, ProcessCollection
from .deps import MonitoringDep

router = APIRouter(tags=["gpu"])


@router.get("/gpus", response_model=GpuCollection, summary="Live state of every GPU")
def get_gpus(monitoring: MonitoringDep) -> GpuCollection:
    """Return utilisation, memory, temperature and power for each GPU.

    When NVML is unusable the response still has HTTP 200 with
    ``available: false`` and an ``error`` string, so the dashboard can show a
    friendly message instead of an API failure.
    """
    return monitoring.gpus()


@router.get("/processes", response_model=ProcessCollection, summary="GPU compute processes")
def get_processes(
    monitoring: MonitoringDep,
    gpu_index: int | None = Query(None, ge=0, description="Only return processes on this GPU."),
) -> ProcessCollection:
    """Return GPU processes enriched with user, command, CPU, RAM and runtime."""
    collection = monitoring.processes()
    if gpu_index is not None:
        collection.processes = [p for p in collection.processes if p.gpu_index == gpu_index]
    return collection
