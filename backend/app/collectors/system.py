"""Host level collection built on :mod:`psutil`.

Every field degrades to ``None`` (rendered as ``N/A`` by the dashboard) when
the platform or the current user cannot report it, instead of raising.
"""

from __future__ import annotations

import logging
import os
import platform
import socket
import time
from dataclasses import dataclass

import psutil

from ..schemas import CpuInfo, DiskInfo, HostInfo, MemoryInfo, SystemStatus

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _Mount:
    """A mount point candidate for the disk overview."""

    device: str
    mountpoint: str
    fstype: str | None


#: Filesystems that do not represent a real disk that a user cares about.
_PSEUDO_FILESYSTEMS = frozenset(
    {
        "autofs",
        "binfmt_misc",
        "bpf",
        "cgroup",
        "cgroup2",
        "configfs",
        "debugfs",
        "devpts",
        "devtmpfs",
        "efivarfs",
        "fusectl",
        "hugetlbfs",
        "mqueue",
        "nsfs",
        "overlay",
        "proc",
        "pstore",
        "ramfs",
        "securityfs",
        "squashfs",
        "sysfs",
        "tmpfs",
        "tracefs",
    }
)

#: Single files that container runtimes bind into the filesystem. Reporting
#: `/etc/resolv.conf` as "the disk" is never useful.
_CONTAINER_FILE_MOUNTS = frozenset(
    {
        "/etc/hostname",
        "/etc/hosts",
        "/etc/resolv.conf",
    }
)


def _is_real_filesystem(mountpoint: str, fstype: str) -> bool:
    """Whether a mount point is a real disk rather than a runtime artifact."""
    if mountpoint in _CONTAINER_FILE_MOUNTS:
        return False
    if mountpoint.startswith("/dev/"):
        return False
    # Windows reports filesystem names as NTFS, FAT32, ... which never collide.
    return fstype.lower() not in _PSEUDO_FILESYSTEMS


def _safe(call, default=None, label: str = ""):
    """Run ``call`` and return ``default`` when it raises."""
    try:
        return call()
    except (psutil.Error, OSError, ValueError, RuntimeError) as exc:  # pragma: no cover - host specific
        logger.debug("psutil call %s failed: %s", label or getattr(call, "__name__", "?"), exc)
        return default


class SystemCollector:
    """Collects and caches host information.

    ``psutil.cpu_percent`` needs two calls separated in time to produce a
    meaningful value, so the collector primes itself on construction and
    remembers the primary mount point it reports on.
    """

    def __init__(self, skip_first_cpu_percent: bool = False) -> None:
        self._mount: _Mount | None = None
        self._host_info: HostInfo | None = None
        if not skip_first_cpu_percent:
            # Prime the internal baseline so the very first real sample is valid.
            _safe(psutil.cpu_percent, 0.0, "cpu_percent prime")
            _safe(lambda: psutil.cpu_percent(percpu=True), [], "cpu_percent percpu prime")

    # -- host -------------------------------------------------------------
    def host_info(self) -> HostInfo:
        """Static host identification, computed once per process."""
        if self._host_info is None:
            uname = platform.uname()
            boot = _safe(psutil.boot_time, None, "boot_time")
            self._host_info = HostInfo(
                hostname=socket.gethostname() or "unknown",
                os=f"{uname.system} {uname.release}",
                kernel=uname.version,
                platform=platform.platform(),
                boot_time=float(boot) if boot else None,
            )
        return self._host_info

    # -- cpu / memory ------------------------------------------------------
    def cpu_info(self) -> CpuInfo:
        """Current CPU utilisation, topology and load average."""
        usage = _safe(lambda: psutil.cpu_percent(interval=None), None, "cpu_percent")
        per_core = _safe(lambda: psutil.cpu_percent(interval=None, percpu=True), [], "cpu_percent percpu")
        load = None
        # getloadavg exists on POSIX; on Windows it raises, and some stripped
        # builds expose the attribute as None.
        try:
            load = tuple(round(float(v), 2) for v in os.getloadavg())
        except (OSError, AttributeError, TypeError):
            load = None

        freq_mhz = None
        try:
            freq = psutil.cpu_freq()
            if freq is not None:
                freq_mhz = round(float(freq.current), 1)
        except (psutil.Error, OSError, NotImplementedError):
            freq_mhz = None

        return CpuInfo(
            usage_percent=round(float(usage), 1) if usage is not None else None,
            physical_cores=_safe(lambda: psutil.cpu_count(logical=False), None, "cpu_count physical"),
            logical_cores=_safe(lambda: psutil.cpu_count(logical=True), None, "cpu_count logical"),
            frequency_mhz=freq_mhz,
            load_average=load,  # type: ignore[arg-type]
            per_core_percent=[round(float(v), 1) for v in (per_core or [])],
        )

    def memory_info(self) -> MemoryInfo:
        """Host memory usage in bytes."""
        vm = _safe(psutil.virtual_memory, None, "virtual_memory")
        if vm is None:
            return MemoryInfo()
        return MemoryInfo(
            total=int(vm.total),
            used=int(vm.used),
            available=int(vm.available),
            percent=round(float(vm.percent), 1),
        )

    # -- disk --------------------------------------------------------------
    def primary_mount(self) -> _Mount | None:
        """Pick the mount point LabWatch reports as the primary disk.

        Preference order:

        1. the root filesystem (``/``, or the system drive on Windows), because
           that is what an operator means by "the disk";
        2. otherwise the shortest usable path, i.e. the mount closest to the
           root of the tree.

        Only real filesystems are considered. Containers bind single files such
        as ``/etc/resolv.conf`` and ``/etc/hostname`` into the filesystem, and
        Docker Desktop's WSL2 backend reports those as ext4 mounts; picking the
        longest matching mount point would then report a config file as the
        primary disk. Pseudo filesystems (overlay, tmpfs, proc, ...) are skipped
        for the same reason.
        """
        if self._mount is not None:
            return self._mount

        anchor = "C:\\" if os.name == "nt" else "/"
        candidate = _Mount(device=anchor, mountpoint=anchor, fstype=None)
        parts = _safe(psutil.disk_partitions, [], "disk_partitions") or []

        candidates: list[_Mount] = []
        for part in parts:
            mountpoint = part.mountpoint or ""
            if not mountpoint or not _is_real_filesystem(mountpoint, part.fstype or ""):
                continue
            if os.name == "nt":
                drive = mountpoint.rstrip("\\").upper()
                if len(drive) == 2 and drive[1] == ":":
                    drive = f"{drive}\\"
                if drive == anchor.upper():
                    candidates.append(_Mount(part.device, mountpoint, part.fstype or None))
                continue
            candidates.append(_Mount(part.device, mountpoint, part.fstype or None))

        self._mount = min(candidates, key=lambda m: len(m.mountpoint)) if candidates else candidate
        return self._mount

    def _disk_entry(self, mount: _Mount, is_primary: bool) -> DiskInfo:
        usage = _safe(lambda: psutil.disk_usage(mount.mountpoint), None, "disk_usage")
        if usage is None:
            return DiskInfo(
                device=mount.device,
                mountpoint=mount.mountpoint,
                fstype=mount.fstype,
                is_primary=is_primary,
            )
        return DiskInfo(
            device=mount.device,
            mountpoint=mount.mountpoint,
            fstype=mount.fstype,
            total=int(usage.total),
            used=int(usage.used),
            free=int(usage.free),
            percent=round(float(usage.percent), 1),
            is_primary=is_primary,
        )

    def disk_info(self, include_all_mounts: bool = False, max_mounts: int = 6) -> list[DiskInfo]:
        """Disk usage, primary mount first.

        Args:
            include_all_mounts: also report other physical, mounted filesystems.
            max_mounts: safety cap on the number of reported mounts.
        """
        primary = self.primary_mount()
        disks: list[DiskInfo] = []
        if primary is not None:
            disks.append(self._disk_entry(primary, is_primary=True))

        if include_all_mounts:
            seen = {d.mountpoint for d in disks}
            for part in _safe(psutil.disk_partitions, [], "disk_partitions") or []:
                if len(disks) >= max_mounts:
                    break
                mountpoint = part.mountpoint
                fstype = part.fstype or ""
                if not mountpoint or mountpoint in seen:
                    continue
                if not _is_real_filesystem(mountpoint, fstype):
                    continue
                if os.name == "nt" and "cdrom" in (part.opts or ""):
                    continue
                seen.add(mountpoint)
                disks.append(
                    self._disk_entry(
                        _Mount(device=part.device, mountpoint=mountpoint, fstype=fstype or None),
                        is_primary=False,
                    )
                )
        return disks

    # -- aggregate ---------------------------------------------------------
    def collect(self, include_all_mounts: bool = False) -> SystemStatus:
        """Collect one full host sample."""
        now = time.time()
        host = self.host_info()
        uptime = None
        if host.boot_time:
            uptime = max(0.0, now - host.boot_time)
        return SystemStatus(
            host=host,
            uptime_seconds=uptime,
            cpu=self.cpu_info(),
            memory=self.memory_info(),
            disks=self.disk_info(include_all_mounts=include_all_mounts),
            collected_at=now,
        )
