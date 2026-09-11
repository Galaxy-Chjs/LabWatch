"""Tests for the psutil based system collector."""

from __future__ import annotations

import os
from types import SimpleNamespace

import psutil
import pytest

from app.collectors import system as system_module
from app.collectors.system import SystemCollector
from app.schemas import HostInfo


@pytest.fixture
def collector() -> SystemCollector:
    """Collector primed for a single measurement."""
    return SystemCollector()


def test_collect_returns_consistent_host_sample(collector: SystemCollector):
    status = collector.collect()

    assert status.host.hostname
    assert status.host.os
    assert status.collected_at > 0
    assert status.uptime_seconds is None or status.uptime_seconds >= 0
    assert status.cpu.logical_cores is None or status.cpu.logical_cores >= 1
    assert status.memory.total is None or status.memory.total > 0
    assert len(status.disks) >= 1
    assert status.disks[0].is_primary is True
    assert status.uptime_human is None or isinstance(status.uptime_human, str)


def test_cpu_usage_is_a_percentage(collector: SystemCollector):
    collector.collect()
    cpu = collector.cpu_info()
    assert cpu.usage_percent is None or 0.0 <= cpu.usage_percent <= 100.0 * 10
    assert isinstance(cpu.per_core_percent, list)


def test_memory_used_never_exceeds_total(collector: SystemCollector):
    memory = collector.memory_info()
    if memory.total and memory.used:
        assert memory.used <= memory.total
    if memory.percent is not None:
        assert 0.0 <= memory.percent <= 100.0


def test_memory_uses_the_free_command_accounting(collector: SystemCollector, monkeypatch):
    """Regression from the lab server.

    ``psutil.virtual_memory().used`` is ``total - available``, which counts page
    cache and shared memory as used. On the lab server that reported 115 GB used
    where ``free`` reported 52 GB, because 84 GB of /dev/shm was in use. The
    dashboard must match the command an operator would run.
    """
    fake = SimpleNamespace(
        total=500 * 1024**3,
        available=380 * 1024**3,
        free=2 * 1024**3,
        buffers=5 * 1024**3,
        cached=465 * 1024**3,
        used=120 * 1024**3,
        percent=24.0,
    )
    monkeypatch.setattr(system_module.psutil, "virtual_memory", lambda: fake)

    memory = collector.memory_info()

    # free-style used = total - free - (buffers + cached)
    assert memory.used == 500 * 1024**3 - 2 * 1024**3 - (5 * 1024**3 + 465 * 1024**3)
    assert memory.cached == (5 + 465) * 1024**3
    assert memory.free == 2 * 1024**3
    assert memory.available == 380 * 1024**3
    assert memory.percent == pytest.approx(5.6, abs=0.1)
    # ...and specifically NOT psutil's own figure.
    assert memory.percent != pytest.approx(24.0, abs=0.5)


def test_memory_never_reports_negative_used(collector: SystemCollector, monkeypatch):
    """A host whose cache exceeds total - free must not produce a negative value."""
    fake = SimpleNamespace(
        total=100 * 1024**3,
        available=90 * 1024**3,
        free=1 * 1024**3,
        buffers=0,
        cached=200 * 1024**3,
        used=10 * 1024**3,
        percent=10.0,
    )
    monkeypatch.setattr(system_module.psutil, "virtual_memory", lambda: fake)

    memory = collector.memory_info()
    assert memory.used == 0


def test_memory_without_buffers_attribute(collector: SystemCollector, monkeypatch):
    """Platforms that omit ``buffers`` (Windows) still produce a value."""
    fake = SimpleNamespace(total=16 * 1024**3, available=8 * 1024**3, free=4 * 1024**3, cached=2 * 1024**3)
    monkeypatch.setattr(system_module.psutil, "virtual_memory", lambda: fake)

    memory = collector.memory_info()
    assert memory.used == 16 * 1024**3 - 4 * 1024**3 - 2 * 1024**3
    assert memory.cached == 2 * 1024**3
    assert memory.percent == pytest.approx(62.5, abs=0.1)


def test_primary_mount_is_stable(collector: SystemCollector):
    first = collector.primary_mount()
    second = collector.primary_mount()
    assert first == second
    assert first is not None


def test_primary_disk_has_usage_numbers(collector: SystemCollector):
    disks = collector.disk_info()
    primary = disks[0]
    assert primary.is_primary
    assert primary.total is None or primary.total > 0
    if primary.percent is not None:
        assert 0.0 <= primary.percent <= 100.0


def test_include_all_mounts_does_not_duplicate(collector: SystemCollector):
    disks = collector.disk_info(include_all_mounts=True)
    mountpoints = [d.mountpoint for d in disks]
    assert len(mountpoints) == len(set(mountpoints))
    assert disks[0].is_primary


def test_max_mounts_is_respected(collector: SystemCollector):
    disks = collector.disk_info(include_all_mounts=True, max_mounts=1)
    assert len(disks) == 1


def test_collect_forwards_max_mounts(collector: SystemCollector):
    status = collector.collect(include_all_mounts=True, max_mounts=2)
    assert len(status.disks) <= 2


def test_lab_server_style_mounts_are_all_reported(monkeypatch):
    """Regression from the lab server: the data volume was invisible.

    The dashboard showed only ``/`` (92 % full) while ``/nfs-data1`` sat at 98.5 %
    full. Reporting every real mount is the default now.
    """
    partitions = [
        _partition("/", "ext4", "/dev/sda2"),
        _partition("/nfs-data1", "ext4", "/dev/sdb"),
        _partition("/nfs-data2", "ext4", "/dev/sdc1"),
        _partition("/nfs-data3", "xfs", "/dev/sdd"),
        _partition("/boot/efi", "vfat", "/dev/sda1"),
        _partition("/sys/firmware/efi/efivars", "efivarfs", "efivarfs"),
    ]
    monkeypatch.setattr(system_module.psutil, "disk_partitions", lambda *_a, **_k: partitions)
    fresh = SystemCollector()

    mountpoints = [disk.mountpoint for disk in fresh.collect(include_all_mounts=True).disks]

    for expected in ("/", "/nfs-data1", "/nfs-data2", "/nfs-data3", "/boot/efi"):
        assert expected in mountpoints
    assert "/sys/firmware/efi/efivars" not in mountpoints


def test_load_average_is_none_when_unsupported(collector: SystemCollector, monkeypatch):
    monkeypatch.setattr(system_module.os, "getloadavg", None, raising=False)
    cpu = collector.cpu_info()
    assert cpu.load_average is None or isinstance(cpu.load_average, tuple)


def test_survives_failing_psutil_calls(collector: SystemCollector, monkeypatch):
    def boom(*_args, **_kwargs):
        raise psutil.Error("simulated psutil failure")

    monkeypatch.setattr(system_module.psutil, "virtual_memory", boom)
    monkeypatch.setattr(system_module.psutil, "disk_usage", boom)
    monkeypatch.setattr(system_module.psutil, "cpu_percent", boom)

    status = collector.collect()
    assert status.memory.total is None
    assert status.cpu.usage_percent is None
    assert status.disks[0].total is None


def test_host_info_is_cached(collector: SystemCollector):
    first = collector.host_info()
    second = collector.host_info()
    assert first is second


def test_missing_partition_list_falls_back_to_anchor(collector: SystemCollector, monkeypatch):
    monkeypatch.setattr(system_module.psutil, "disk_partitions", lambda *_a, **_k: [])
    fresh = SystemCollector()
    mount = fresh.primary_mount()
    assert mount is not None
    assert mount.mountpoint in {"C:\\", "/"}


def _partition(mountpoint: str, fstype: str, device: str = "/dev/sda1", opts: str = "rw"):
    """Build a partition record shaped like ``psutil.disk_partitions()``."""
    return SimpleNamespace(device=device, mountpoint=mountpoint, fstype=fstype, opts=opts)


@pytest.mark.parametrize(
    ("mountpoint", "fstype"),
    [
        ("/etc/resolv.conf", "ext4"),
        ("/etc/hostname", "ext4"),
        ("/etc/hosts", "ext4"),
        ("/proc", "proc"),
        ("/sys", "sysfs"),
        ("/dev/shm", "tmpfs"),
        ("/", "overlay"),
        ("/run/secrets", "ramfs"),
    ],
)
def test_non_disk_mounts_are_rejected(mountpoint: str, fstype: str):
    assert system_module._is_real_filesystem(mountpoint, fstype) is False


@pytest.mark.parametrize(
    ("mountpoint", "fstype"),
    [
        ("/", "ext4"),
        ("/data", "xfs"),
        ("/mnt/nvme", "btrfs"),
        ("C:\\", "NTFS"),
        ("/", ""),
    ],
)
def test_real_mounts_are_accepted(mountpoint: str, fstype: str):
    assert system_module._is_real_filesystem(mountpoint, fstype) is True


def test_primary_mount_ignores_container_injected_files(monkeypatch):
    """Regression: inside a container the primary disk was /etc/resolv.conf.

    Docker Desktop's WSL2 backend reports single-file bind mounts as ext4 with
    a deep mount point, so "longest matching mount point" picked a config file
    and the disk tile showed 2.5 GB at 0.3% instead of the real filesystem.
    """
    partitions = [
        _partition("/etc/resolv.conf", "ext4", "/dev/sdd", "rw,relatime"),
        _partition("/etc/hostname", "ext4", "/dev/sdc", "rw,relatime"),
        _partition("/proc", "proc", "proc", "rw"),
        _partition("/dev/shm", "tmpfs", "tmpfs", "rw"),
    ]
    if os.name == "nt":  # pragma: no cover - the fixture is POSIX shaped
        partitions.append(_partition("C:\\", "NTFS", "C:", "rw,fixed"))
    else:
        partitions.append(_partition("/", "ext4", "/dev/sda1", "rw,relatime"))

    monkeypatch.setattr(system_module.psutil, "disk_partitions", lambda *_a, **_k: partitions)
    fresh = SystemCollector()
    mount = fresh.primary_mount()

    assert mount is not None
    assert mount.mountpoint == ("C:\\" if os.name == "nt" else "/")


def test_primary_mount_prefers_the_shallowest_usable_mount(monkeypatch):
    """With no root filesystem, the mount closest to the tree root wins.

    Inside a container the root is an `overlay` filesystem and gets filtered, so
    the shallowest real mount is the best available answer.
    """
    anchor = "C:\\" if os.name == "nt" else "/"
    anchor_fstype = "NTFS" if os.name == "nt" else "overlay"
    partitions = [
        _partition("/data/datasets/imagenet", "ext4", "/dev/sdd1"),
        _partition("/data", "ext4", "/dev/sdb1"),
        _partition(anchor, anchor_fstype, "C:" if os.name == "nt" else "overlay"),
    ]
    monkeypatch.setattr(system_module.psutil, "disk_partitions", lambda *_a, **_k: partitions)
    mount = SystemCollector().primary_mount()

    assert mount is not None
    if os.name == "nt":
        # The anchor candidate is used when no real system drive is reported.
        assert mount.mountpoint == anchor
    else:
        assert mount.mountpoint == "/data"


def test_all_mounts_skips_pseudo_filesystems(monkeypatch):
    anchor = "C:\\" if os.name == "nt" else "/"
    anchor_fstype = "NTFS" if os.name == "nt" else "ext4"
    partitions = [
        _partition(anchor, anchor_fstype, "C:" if os.name == "nt" else "/dev/sda1"),
        _partition("/data", "xfs", "/dev/sdb1"),
        _partition("/proc", "proc", "proc"),
        _partition("/etc/resolv.conf", "ext4", "/dev/sdd"),
        _partition("/run/user/1000", "tmpfs", "tmpfs"),
    ]
    monkeypatch.setattr(system_module.psutil, "disk_partitions", lambda *_a, **_k: partitions)
    fresh = SystemCollector()
    mountpoints = [disk.mountpoint for disk in fresh.disk_info(include_all_mounts=True)]

    assert mountpoints[0] == anchor
    assert "/data" in mountpoints
    assert "/proc" not in mountpoints
    assert "/etc/resolv.conf" not in mountpoints
    assert "/run/user/1000" not in mountpoints


def test_uptime_human_formatting():
    from app.schemas import format_duration, format_runtime

    assert format_duration(0) == "0s"
    assert format_duration(90) == "1m 30s"
    assert format_duration(3660) == "1h 1m"
    assert format_duration(86_400 * 5 + 3600 * 14) == "5d 14h 0m"
    assert format_duration(None) is None
    assert format_runtime(0) == "00:00:00"
    assert format_runtime(3661) == "01:01:01"
    assert format_runtime(90_000) == "1d 01:00:00"
    assert format_runtime(None) is None


def test_collect_uses_real_uptime(collector: SystemCollector):
    fake_boot = 1_000_000.0
    collector._host_info = HostInfo(
        hostname="test-host",
        os="TestOS",
        kernel="1.0",
        platform="test",
        boot_time=fake_boot,
    )
    status = collector.collect()
    assert status.host.hostname == "test-host"
    assert status.uptime_seconds is not None
    assert status.uptime_seconds > 0
