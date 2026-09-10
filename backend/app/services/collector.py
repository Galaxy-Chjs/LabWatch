"""Background collector: periodically persists samples into SQLite."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time

from ..config import Settings
from .history import HistoryService
from .monitoring import MonitoringService

logger = logging.getLogger(__name__)

#: How often retention pruning runs, in seconds.
PRUNE_EVERY_SECONDS = 300.0


class BackgroundCollector:
    """Owns the asyncio task that writes history and prunes old rows.

    Sampling runs in a worker thread (``asyncio.to_thread``) because both NVML
    and psutil calls are blocking.
    """

    def __init__(self, settings: Settings, monitoring: MonitoringService, history: HistoryService) -> None:
        self.settings = settings
        self.monitoring = monitoring
        self.history = history
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._last_prune = 0.0
        self.writes = 0
        self.errors = 0

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> asyncio.Task[None]:
        """Start the collector loop."""
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._run(), name="labwatch-collector")
            logger.info("Background collector started (interval=%.1fs)", self.settings.history_interval)
        return self._task

    async def stop(self) -> None:
        """Stop the collector loop and wait for it to finish."""
        self._stop.set()
        task = self._task
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._task = None
        logger.info("Background collector stopped after %d writes", self.writes)

    @property
    def running(self) -> bool:
        """Whether the loop is currently alive."""
        return self._task is not None and not self._task.done()

    @property
    def interval_seconds(self) -> float:
        """Configured seconds between persisted samples.

        Reports the configured value verbatim (mirroring the startup log) rather
        than the clamped value the loop uses, so operators can see a misconfigured
        sub-second interval instead of a silently rounded one.
        """
        return float(self.settings.history_interval)

    @property
    def effective_interval_seconds(self) -> float:
        """The interval the loop actually waits for, never below one second."""
        return max(1.0, self.interval_seconds)

    # -- loop --------------------------------------------------------------
    async def _collect_once(self) -> None:
        """Collect and persist one sample set."""
        try:
            system, gpus = await asyncio.to_thread(self._sample)
        except Exception:  # noqa: BLE001 - a failed sample must not kill the loop
            self.errors += 1
            logger.exception("History sample failed")
            return
        try:
            await asyncio.to_thread(self.history.record_system, system)
            await asyncio.to_thread(self.history.record_gpus, gpus)
        except Exception:  # noqa: BLE001
            self.errors += 1
            logger.exception("Writing history to the database failed")
            return
        self.writes += 1

    def _sample(self):
        """Blocking part of one collection cycle."""
        return self.monitoring.system(), self.monitoring.gpus().gpus

    async def _maybe_prune(self) -> None:
        """Prune rows outside the retention window every few minutes."""
        now = time.time()
        if now - self._last_prune < PRUNE_EVERY_SECONDS:
            return
        self._last_prune = now
        try:
            deleted = await asyncio.to_thread(self.history.prune, now)
            if deleted:
                logger.info("Pruned %d expired history rows", deleted)
        except Exception:  # noqa: BLE001
            logger.exception("Pruning history failed")

    async def _run(self) -> None:
        """Loop until stopped, sampling every ``history_interval`` seconds."""
        interval = self.effective_interval_seconds
        # An immediate first sample means charts have data within seconds.
        await self._collect_once()
        await self._maybe_prune()
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=interval)
                break
            except asyncio.TimeoutError:
                pass
            await self._collect_once()
            await self._maybe_prune()
