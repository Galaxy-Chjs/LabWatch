"""Historical metric endpoints (SQLite backed)."""

from __future__ import annotations

import time

from fastapi import APIRouter, Path, Query

from ..collectors.demo import DemoCollector
from ..schemas import GpuHistory, GpuHistorySeries, HistoryRange, SystemHistory
from .deps import ContextDep, HistoryDep

router = APIRouter(tags=["history"], prefix="/history")


@router.get("/system", response_model=SystemHistory, summary="Host metric history")
def get_system_history(
    history: HistoryDep,
    context: ContextDep,
    range: HistoryRange = Query("1h", description="Time window: 1h, 6h or 24h."),
) -> SystemHistory:
    """Return CPU, memory and disk history for the requested window.

    In demo mode a synthetic series is generated so charts are populated even
    on a machine that has never collected anything.
    """
    demo = context.monitoring.demo_collector
    if demo is not None:
        return _demo_system_history(context, demo, range)
    return history.system_history(range)


@router.get("/gpus", response_model=GpuHistory, summary="GPU metric history for every GPU")
def get_gpu_history_all(
    history: HistoryDep,
    context: ContextDep,
    range: HistoryRange = Query("1h", description="Time window: 1h, 6h or 24h."),
) -> GpuHistory:
    """Return GPU history for all GPUs in one payload."""
    demo = context.monitoring.demo_collector
    if demo is not None:
        return _demo_gpu_history(context, demo, range)
    return history.gpu_history(range)


@router.get("/gpus/{gpu_index}", response_model=GpuHistory, summary="GPU metric history for one GPU")
def get_gpu_history(
    history: HistoryDep,
    context: ContextDep,
    gpu_index: int = Path(ge=0, description="GPU index as reported by NVML."),
    range: HistoryRange = Query("1h", description="Time window: 1h, 6h or 24h."),
) -> GpuHistory:
    """Return the utilisation, memory, temperature and power history of one GPU."""
    demo = context.monitoring.demo_collector
    if demo is not None:
        return _demo_gpu_history(context, demo, range, gpu_index=gpu_index)
    return history.gpu_history(range, gpu_index=gpu_index)


# --------------------------------------------------------------------------- #
# Demo helpers
# --------------------------------------------------------------------------- #
def _demo_window(context: ContextDep, range_key: str) -> tuple[float, float, float]:
    """Return ``(start, end, interval)`` for a synthetic history window."""
    end = time.time()
    start = end - {"1h": 3600, "6h": 21600, "24h": 86400}[range_key]
    interval = max(context.settings.history_interval, 10.0)
    return start, end, interval


def _demo_system_history(context: ContextDep, demo: DemoCollector, range_key: str) -> SystemHistory:
    """Synthetic host history for demo mode."""
    start, end, interval = _demo_window(context, range_key)
    return SystemHistory(
        range=range_key,  # type: ignore[arg-type]
        start=start,
        end=end,
        interval_seconds=interval,
        points=demo.system_history_points(start, end, interval),
        demo=True,
    )


def _demo_gpu_history(
    context: ContextDep,
    demo: DemoCollector,
    range_key: str,
    gpu_index: int | None = None,
) -> GpuHistory:
    """Synthetic GPU history for demo mode."""
    start, end, interval = _demo_window(context, range_key)
    points = demo.gpu_history_points(start, end, interval)
    if gpu_index is not None:
        points = [p for p in points if p.gpu_index == gpu_index]
    grouped: dict[int, list] = {}
    for point in points:
        grouped.setdefault(point.gpu_index, []).append(point)
    names = DemoCollector.gpu_names()
    series = [
        GpuHistorySeries(gpu_index=index, gpu_name=names.get(index), points=items)
        for index, items in sorted(grouped.items())
    ]
    return GpuHistory(
        range=range_key,  # type: ignore[arg-type]
        start=start,
        end=end,
        interval_seconds=interval,
        series=series,
        demo=True,
    )
