"""Tests for demo mode and the history service."""

from __future__ import annotations

import time

import pytest

from labwatch.server.collectors import DemoCollector
from labwatch.server.services.history import HistoryService
from labwatch.server.services.monitoring import MonitoringService


@pytest.fixture
def demo() -> DemoCollector:
    return DemoCollector()


# --------------------------------------------------------------------------- #
# Demo collector
# --------------------------------------------------------------------------- #
def test_demo_system_is_flagged_and_plausible(demo: DemoCollector):
    status = demo.collect_system()

    assert status.demo is True
    assert status.host.hostname == "gpu-demo-node"
    assert status.cpu.usage_percent is not None and 0 <= status.cpu.usage_percent <= 100
    assert status.memory.used is not None and status.memory.used <= status.memory.total
    assert len(status.disks) == 2
    assert status.disks[0].is_primary is True
    assert status.uptime_seconds and status.uptime_seconds > 0


def test_demo_gpus_are_flagged_and_have_multiple_devices(demo: DemoCollector):
    collection = demo.collect_gpus()

    assert collection.demo is True
    assert collection.available is True
    assert len(collection.gpus) == 3
    assert [g.index for g in collection.gpus] == [0, 1, 2]
    for gpu in collection.gpus:
        assert gpu.name
        assert gpu.memory_used is not None and gpu.memory_used <= gpu.memory_total
        assert gpu.temperature_c is not None
        assert gpu.power_watts is not None


def test_demo_processes_are_flagged(demo: DemoCollector):
    collection = demo.collect_processes()

    assert collection.demo is True
    assert len(collection.processes) == 3
    assert {p.gpu_index for p in collection.processes} == {0, 1}
    for proc in collection.processes:
        assert proc.command
        assert proc.username
        assert proc.runtime_seconds and proc.runtime_seconds > 0
        assert proc.runtime_human


def test_demo_history_covers_the_window(demo: DemoCollector):
    end = time.time()
    start = end - 600
    points = demo.system_history_points(start, end, 10.0)

    assert len(points) == 61
    assert points[0].timestamp == pytest.approx(start)
    assert all(p.cpu_percent is not None for p in points)


def test_demo_gpu_history_has_a_series_per_gpu(demo: DemoCollector):
    end = time.time()
    points = demo.gpu_history_points(end - 60, end, 10.0)
    assert {p.gpu_index for p in points} == {0, 1, 2}
    assert len(points) == 21


def test_demo_noise_is_deterministic_and_bounded():
    """Demo jitter must be reproducible and stay inside its documented range."""
    from labwatch.server.collectors.demo import _noise

    for seed in (0.0, 3.0, 17.5):
        for timestamp in (0.0, 1.0, 1_700_000_000.0, 1_700_000_000.6):
            assert _noise(timestamp, seed) == _noise(timestamp, seed)
            assert -1.0 <= _noise(timestamp, seed) <= 1.0

    # Magnitude is caller controlled.
    assert abs(_noise(1_700_000_000.0, 3, 9.0)) <= 9.0
    assert _noise(1_700_000_000.0, 3, 9.0) == pytest.approx(_noise(1_700_000_000.0, 3) * 9.0)


def test_demo_noise_bucket_follows_the_sampling_interval():
    """Sampling a 1s signal at 10s steps aliases into noise; bucketing prevents it."""
    from labwatch.server.collectors.demo import _noise

    # At a 1 second bucket, neighbouring seconds differ.
    assert _noise(1_700_000_000.0, 3) != _noise(1_700_000_001.0, 3)

    # At a 10 second bucket, samples inside the same bucket are identical, so a
    # 24h chart (10 s samples) shows the trend rather than a solid block.
    assert _noise(1_700_000_000.0, 3, 1.0, 10.0) == _noise(1_700_000_009.0, 3, 1.0, 10.0)
    assert _noise(1_700_000_000.0, 3, 1.0, 10.0) != _noise(1_700_000_010.0, 3, 1.0, 10.0)


def test_demo_load_envelope_varies_over_time():
    """The load envelope exists so demo charts are not flat sinusoids."""
    from labwatch.server.collectors.demo import _load

    values = [_load(1_700_000_000.0 + step * 60) for step in range(120)]
    # Bounded well above zero: a busy host does not idle to 4%.
    assert all(0.4 <= value <= 1.2 for value in values)
    assert max(values) - min(values) > 0.1


def test_demo_history_uses_the_shared_gpu_signal(demo: DemoCollector):
    """Each history point must come from the documented signal function."""
    from labwatch.server.collectors.demo import DEMO_GPUS, _gpu_signals

    interval = 10.0
    start = 1_700_000_000.0
    points = demo.gpu_history_points(start, start + 60, interval)

    for spec in DEMO_GPUS:
        expected = _gpu_signals(spec, start, 60.0, interval)
        point = next(p for p in points if p.gpu_index == spec["index"] and p.timestamp == start)
        assert point.utilization == pytest.approx(expected[0], abs=0.05)
        assert point.memory_used == expected[1]
        assert point.power_usage == pytest.approx(expected[2], abs=0.05)


def test_demo_volatility_scales_with_the_window():
    """A 24h chart must not be a solid block, and a 1h chart must not be flat."""
    from labwatch.server.collectors.demo import _detail_level

    short_amplitude, short_period = _detail_level(3600.0)
    long_amplitude, long_period = _detail_level(86_400.0)

    # Wider windows get a longer fast component and a larger swing...
    assert long_period > short_period
    assert long_amplitude > short_amplitude

    # ...but the swing stays within a sane band for a utilisation percentage.
    assert 4.0 <= short_amplitude <= 16.0
    assert 4.0 <= long_amplitude <= 16.0


@pytest.mark.parametrize("hours", [1, 6, 24])
def test_demo_gpu_history_band_width_is_readable(demo: DemoCollector, hours: int):
    """Regression: a 24h window used to render as an unreadable solid band.

    Asserts the spread of the drawn series stays well below the full 0-100 axis
    for every supported range.
    """
    end = 1_700_000_000.0
    interval = 10.0
    points = demo.gpu_history_points(end - hours * 3600, end, interval)
    values = [p.utilization for p in points if p.gpu_index == 0 and p.utilization is not None]
    assert values
    assert max(values) - min(values) < 88.0


def test_demo_live_sample_is_plausible(demo: DemoCollector):
    """The live payload must stay inside the ranges the UI and schemas assume."""
    live = demo.collect_gpus().gpus[0]
    assert live.utilization_percent is not None
    assert 0.0 <= live.utilization_percent <= 100.0
    assert live.memory_used is not None and live.memory_used <= live.memory_total
    assert live.power_watts is not None and live.power_watts <= live.power_limit_watts


def test_monitoring_service_uses_demo_collector(demo_settings):
    service = MonitoringService(demo_settings)
    try:
        assert service.demo_collector is not None
        assert service.system().demo is True
        overview = service.overview()
        assert overview.gpu_collection.demo is True
        assert overview.gpu_collection.gpus
        assert overview.process_collection.demo is True
    finally:
        service.shutdown()


# --------------------------------------------------------------------------- #
# History service
# --------------------------------------------------------------------------- #
def _host_sample(status, timestamp: float):
    """Clone a system status onto a specific timestamp."""
    return status.model_copy(update={"collected_at": timestamp})


def test_record_and_read_system_history(history: HistoryService, demo: DemoCollector):
    now = time.time()
    for offset in (300, 200, 100, 0):
        history.record_system(_host_sample(demo.collect_system(), now - offset))

    result = history.system_history("1h")
    assert result.range == "1h"
    assert len(result.points) == 4
    timestamps = [p.timestamp for p in result.points]
    assert timestamps == sorted(timestamps)
    assert result.interval_seconds == pytest.approx(100.0)
    assert result.points[-1].cpu_percent is not None


def test_record_and_read_gpu_history(history: HistoryService, demo: DemoCollector):
    now = time.time()
    for offset in (120, 60, 0):
        gpus = [g.model_copy(update={"collected_at": now - offset}) for g in demo.collect_gpus().gpus]
        history.record_gpus(gpus)

    result = history.gpu_history("1h")
    assert {s.gpu_index for s in result.series} == {0, 1, 2}
    for series in result.series:
        assert len(series.points) == 3


def test_gpu_history_can_filter_one_gpu(history: HistoryService, demo: DemoCollector):
    history.record_gpus(demo.collect_gpus().gpus)
    result = history.gpu_history("1h", gpu_index=1)
    assert [s.gpu_index for s in result.series] == [1]


def test_history_range_windows_differ(history: HistoryService, demo: DemoCollector):
    now = time.time()
    history.record_system(_host_sample(demo.collect_system(), now - 7200))  # 2h old

    assert len(history.system_history("1h").points) == 0
    assert len(history.system_history("6h").points) == 1
    assert len(history.system_history("24h").points) == 1


def test_history_is_empty_before_any_sample(history: HistoryService):
    result = history.system_history("24h")
    assert result.points == []
    assert result.interval_seconds == 0.0


def test_recording_no_gpus_is_a_noop(history: HistoryService):
    history.record_gpus([])
    assert history.gpu_history("1h").series == []


def test_prune_removes_old_rows(history: HistoryService, demo: DemoCollector):
    now = time.time()
    history.record_system(_host_sample(demo.collect_system(), now - 48 * 3600))
    history.record_system(_host_sample(demo.collect_system(), now))

    assert len(history.system_history("24h").points) == 1
    deleted = history.prune(now)
    assert deleted >= 1
    assert history.last_write is not None


def test_retention_row_cap_is_enforced(database, demo: DemoCollector):
    service = HistoryService(database=database, retention_hours=24.0, max_rows=5)
    now = time.time()
    for offset in range(10):
        service.record_system(_host_sample(demo.collect_system(), now - offset))

    service.prune(now)
    assert len(service.system_history("24h").points) == 5


def test_last_write_tracks_records(history: HistoryService, demo: DemoCollector):
    assert history.last_write is None
    history.record_system(demo.collect_system())
    assert history.last_write is not None
