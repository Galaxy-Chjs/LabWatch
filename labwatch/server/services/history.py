"""History persistence and querying on top of SQLite."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterable

from sqlalchemy import delete, func, select

from ..database import Database, GpuSample, HostSample
from ..schemas import (
    RANGE_SECONDS,
    GpuHistory,
    GpuHistoryPoint,
    GpuHistorySeries,
    GpuStatus,
    SystemHistory,
    SystemHistoryPoint,
    SystemStatus,
)

logger = logging.getLogger(__name__)

#: Never return more points than this per series; samples are averaged down.
MAX_POINTS_PER_SERIES = 720


class HistoryService:
    """Writes samples to SQLite and reads them back as chart-ready series."""

    def __init__(
        self,
        database: Database,
        retention_hours: float = 24.0,
        max_rows: int = 200_000,
    ) -> None:
        self.database = database
        self.retention_hours = retention_hours
        self.max_rows = max_rows
        self.last_write: float | None = None

    # -- writes ------------------------------------------------------------
    def record_system(self, status: SystemStatus) -> None:
        """Persist one host sample."""
        primary = next((d for d in status.disks if d.is_primary), None)
        if primary is None and status.disks:
            primary = status.disks[0]
        with self.database.session() as session:
            session.add(
                HostSample(
                    timestamp=status.collected_at,
                    cpu_percent=status.cpu.usage_percent,
                    memory_used=status.memory.used,
                    memory_total=status.memory.total,
                    memory_percent=status.memory.percent,
                    disk_used=primary.used if primary else None,
                    disk_total=primary.total if primary else None,
                    disk_percent=primary.percent if primary else None,
                )
            )
        self.last_write = status.collected_at

    def record_gpus(self, gpus: Iterable[GpuStatus]) -> None:
        """Persist one sample per GPU."""
        now = time.time()
        rows = [
            GpuSample(
                timestamp=gpu.collected_at or now,
                gpu_index=gpu.index,
                gpu_uuid=gpu.uuid,
                utilization=gpu.utilization_percent,
                memory_used=gpu.memory_used,
                memory_total=gpu.memory_total,
                memory_percent=gpu.memory_percent,
                temperature=gpu.temperature_c,
                power_usage=gpu.power_watts,
                power_limit=gpu.power_limit_watts,
            )
            for gpu in gpus
        ]
        if not rows:
            return
        with self.database.session() as session:
            session.add_all(rows)
        self.last_write = now

    def prune(self, now: float | None = None) -> int:
        """Delete rows older than the retention window.

        Returns:
            Number of deleted rows.
        """
        cutoff = (time.time() if now is None else now) - self.retention_hours * 3600.0
        deleted = 0
        with self.database.session() as session:
            for model in (HostSample, GpuSample):
                result = session.execute(delete(model).where(model.timestamp < cutoff))
                deleted += int(result.rowcount or 0)
            # Hard safety net: also cap total row count per table.
            for model in (HostSample, GpuSample):
                count = session.execute(select(func.count()).select_from(model)).scalar_one()
                if count > self.max_rows:
                    excess = count - self.max_rows
                    stale_ids = session.execute(
                        select(model.id).order_by(model.timestamp.asc()).limit(excess)
                    ).scalars()
                    ids = list(stale_ids)
                    if ids:
                        session.execute(delete(model).where(model.id.in_(ids)))
                        deleted += len(ids)
        return deleted

    # -- reads -------------------------------------------------------------
    @staticmethod
    def _window(range_key: str) -> tuple[float, float]:
        end = time.time()
        start = end - RANGE_SECONDS[range_key]
        return start, end

    def system_history(self, range_key: str) -> SystemHistory:
        """Return host history for a named range."""
        start, end = self._window(range_key)
        with self.database.session() as session:
            rows = (
                session.execute(
                    select(HostSample)
                    .where(HostSample.timestamp >= start, HostSample.timestamp <= end)
                    .order_by(HostSample.timestamp.asc())
                )
                .scalars()
                .all()
            )
        points = [
            SystemHistoryPoint(
                timestamp=row.timestamp,
                cpu_percent=row.cpu_percent,
                memory_used=row.memory_used,
                memory_total=row.memory_total,
                memory_percent=row.memory_percent,
                disk_used=row.disk_used,
                disk_total=row.disk_total,
                disk_percent=row.disk_percent,
            )
            for row in rows
        ]
        return SystemHistory(
            range=range_key,  # type: ignore[arg-type]
            start=start,
            end=end,
            interval_seconds=self._interval(points),
            points=points,
        )

    def gpu_history(self, range_key: str, gpu_index: int | None = None) -> GpuHistory:
        """Return GPU history for a named range, optionally for a single GPU."""
        start, end = self._window(range_key)
        with self.database.session() as session:
            stmt = select(GpuSample).where(GpuSample.timestamp >= start, GpuSample.timestamp <= end)
            if gpu_index is not None:
                stmt = stmt.where(GpuSample.gpu_index == gpu_index)
            rows = session.execute(stmt.order_by(GpuSample.timestamp.asc())).scalars().all()

        grouped: dict[int, list[GpuHistoryPoint]] = {}
        names: dict[int, str] = {}
        for row in rows:
            grouped.setdefault(row.gpu_index, []).append(
                GpuHistoryPoint(
                    timestamp=row.timestamp,
                    gpu_index=row.gpu_index,
                    utilization=row.utilization,
                    memory_used=row.memory_used,
                    memory_total=row.memory_total,
                    memory_percent=row.memory_percent,
                    temperature=row.temperature,
                    power_usage=row.power_usage,
                    power_limit=row.power_limit,
                )
            )
            if row.gpu_uuid:
                names.setdefault(row.gpu_index, row.gpu_uuid)

        series = [
            GpuHistorySeries(gpu_index=index, gpu_name=names.get(index), points=points)
            for index, points in sorted(grouped.items())
        ]
        return GpuHistory(
            range=range_key,  # type: ignore[arg-type]
            start=start,
            end=end,
            interval_seconds=self._interval([p for s in series for p in s.points]),
            series=series,
        )

    @staticmethod
    def _interval(points: list) -> float:
        """Infer the median spacing of a series; falls back to 0."""
        if len(points) < 2:
            return 0.0
        deltas = sorted(
            points[i + 1].timestamp - points[i].timestamp for i in range(min(len(points) - 1, 200))
        )
        mid = deltas[len(deltas) // 2]
        return round(float(mid), 3)
