"""Monitoring service: owns the collectors and produces API payloads."""

from __future__ import annotations

import logging
import time

from ..collectors import DemoCollector, NvmlGpuCollector, SystemCollector
from ..config import Settings
from ..schemas import GpuCollection, Overview, ProcessCollection, SystemStatus

logger = logging.getLogger(__name__)


class MonitoringService:
    """Single entry point for live metrics.

    In demo mode a :class:`~app.collectors.demo.DemoCollector` replaces both
    hardware collectors, so every payload is synthetic and clearly flagged.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.demo_mode = settings.demo_mode
        self.system_collector = SystemCollector()
        self.demo_collector = DemoCollector() if settings.demo_mode else None
        self.gpu_collector = NvmlGpuCollector(
            collect_commands=settings.collect_commands,
            process_limit=settings.process_limit,
            include_graphics_processes=settings.include_graphics_processes,
        )

    # -- host --------------------------------------------------------------
    def system(self, include_all_mounts: bool | None = None) -> SystemStatus:
        """Current host status.

        Args:
            include_all_mounts: overrides ``LABWATCH_INCLUDE_ALL_MOUNTS`` for this
                call; ``None`` uses the configured default.
        """
        if include_all_mounts is None:
            include_all_mounts = self.settings.include_all_mounts
        if self.demo_collector is not None:
            return self.demo_collector.collect_system(include_all_mounts=include_all_mounts)
        return self.system_collector.collect(
            include_all_mounts=include_all_mounts,
            max_mounts=self.settings.max_mounts,
        )

    # -- gpu ---------------------------------------------------------------
    def gpus(self) -> GpuCollection:
        """Current GPU status."""
        if self.demo_collector is not None:
            return self.demo_collector.collect_gpus()
        return self.gpu_collector.collect_gpus()

    def processes(self) -> ProcessCollection:
        """Current GPU processes."""
        if self.demo_collector is not None:
            return self.demo_collector.collect_processes()
        return self.gpu_collector.collect_processes()

    # -- aggregate ---------------------------------------------------------
    def overview(self) -> Overview:
        """Everything the dashboard polls, in one payload."""
        return Overview(
            system=self.system(),
            gpu_collection=self.gpus(),
            process_collection=self.processes(),
            poll_interval=self.settings.poll_interval,
            generated_at=time.time(),
        )

    def shutdown(self) -> None:
        """Release hardware resources."""
        self.gpu_collector.shutdown()
