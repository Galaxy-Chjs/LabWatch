/**
 * Host overview: CPU / RAM / Disk / System.
 *
 * Every tile is rendered from the same layout whether or not `system` has
 * arrived, so the page never reflows and a missing metric is always an explicit
 * `N/A` rather than an implied zero.
 */

import {
  formatBytes,
  formatBytesPair,
  formatClock,
  formatPercent,
  levelForPercent,
  NA,
  textColorForLevel,
  truncate,
} from '../lib/format'
import type { DiskInfo, SystemStatus } from '../types/api'
import { Meter } from './Meter'
import { SectionHeader } from './SectionHeader'
import { KeyValue, Tile } from './StatTile'

export interface HostSectionProps {
  system: SystemStatus | undefined
}

function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  return value.toFixed(digits)
}

function mhz(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  return `${Math.round(value)} MHz`
}

/** `physical / logical`, or `N/A` when the host reports neither. */
function cores(physical: number | null | undefined, logical: number | null | undefined): string {
  const hasPhysical = physical !== null && physical !== undefined && Number.isFinite(physical)
  const hasLogical = logical !== null && logical !== undefined && Number.isFinite(logical)
  if (!hasPhysical && !hasLogical) return NA
  return `${num(physical)} / ${num(logical)}`
}

function loadAverage(load: [number, number, number] | null | undefined): string {
  if (!load) return NA
  return load.map((value) => value.toFixed(2)).join(' / ')
}

function PercentReading({ percent }: { percent: number | null | undefined }) {
  return (
    <span className={`lw-num text-lg leading-none ${textColorForLevel(levelForPercent(percent))}`}>
      {formatPercent(percent)}
    </span>
  )
}

/**
 * Every reported filesystem, most at-risk first.
 *
 * Ordering by usage descending means a nearly-full data volume is the first row
 * rather than something hidden behind the primary disk - which is exactly the
 * case that matters on a lab server.
 */
function filesystemsByRisk(disks: DiskInfo[], primary: DiskInfo | undefined): DiskInfo[] {
  return [...disks.filter((disk) => disk !== primary)].sort(
    (a, b) => (b.percent ?? -1) - (a.percent ?? -1),
  )
}

function FilesystemRow({ disk }: { disk: DiskInfo }) {
  const level = levelForPercent(disk.percent)
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 sm:flex-nowrap"
      title={disk.device}
    >
      <span className="lw-num w-full shrink-0 truncate text-xs text-ink sm:w-56">{disk.mountpoint}</span>
      <span className="min-w-[80px] flex-1">
        <Meter percent={disk.percent} />
      </span>
      <span className="lw-num w-14 shrink-0 text-right text-xs text-muted">
        {formatBytes(disk.free)} free
      </span>
      <span className="lw-num w-20 shrink-0 text-right text-xs text-faint">
        {formatBytesPair(disk.used, disk.total, 0)}
      </span>
      <span className={`lw-num w-14 shrink-0 text-right text-xs ${textColorForLevel(level)}`}>
        {formatPercent(disk.percent)}
      </span>
    </div>
  )
}

export function HostSection({ system }: HostSectionProps) {
  const cpu = system?.cpu
  const memory = system?.memory
  const host = system?.host
  const disks = system?.disks ?? []
  const primary = disks.find((disk) => disk.is_primary) ?? disks[0]

  return (
    <section data-testid="host-section" className="flex flex-col gap-3">
      <SectionHeader
        title="HOST"
        meta={
          system
            ? `sampled ${formatClock(system.collected_at)}`
            : 'waiting for the first sample'
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* CPU ------------------------------------------------------------ */}
        <Tile label="CPU" right={<PercentReading percent={cpu?.usage_percent} />}>
          <Meter percent={cpu?.usage_percent} className="mt-2.5" />
          <dl className="mt-3 flex flex-1 flex-col gap-1.5">
            <KeyValue label="Cores" value={cores(cpu?.physical_cores, cpu?.logical_cores)} title="physical / logical" />
            <KeyValue label="Speed" value={mhz(cpu?.frequency_mhz)} />
            <KeyValue label="Load avg" value={loadAverage(cpu?.load_average)} title="1m / 5m / 15m" />
          </dl>
        </Tile>

        {/* RAM ------------------------------------------------------------ */}
        <Tile label="RAM" right={<PercentReading percent={memory?.percent} />}>
          <p className="mt-2.5 truncate text-sm text-ink lw-num" title="used / total">
            {formatBytesPair(memory?.used, memory?.total)}
          </p>
          <Meter percent={memory?.percent} className="mt-2" />
          <dl className="mt-3 flex flex-1 flex-col gap-1.5">
            <KeyValue label="Free" value={formatBytes(memory?.free)} />
            <KeyValue label="Cache" value={formatBytes(memory?.cached)} title="page cache, buffers, reclaimable slab" />
            <KeyValue label="Available" value={formatBytes(memory?.available)} />
            <KeyValue label="Total" value={formatBytes(memory?.total)} />
          </dl>
        </Tile>

        {/* Disk ----------------------------------------------------------- */}
        <Tile label="Disk" right={<PercentReading percent={primary?.percent} />}>
          <p className="mt-2.5 truncate text-sm text-ink lw-num" title={primary?.device}>
            {primary?.mountpoint ?? NA}
          </p>
          <p className="mt-1 truncate text-xs text-muted lw-num">
            {formatBytesPair(primary?.used, primary?.total)}
          </p>
          <Meter percent={primary?.percent} className="mt-2" />
          <dl className="mt-3 flex flex-1 flex-col gap-1.5">
            <KeyValue label="Type" value={primary?.fstype ?? NA} />
            <KeyValue label="Free" value={formatBytes(primary?.free)} />
            <KeyValue
              label="Mounts"
              value={String(disks.length)}
              title="every filesystem is listed below"
            />
          </dl>
        </Tile>

        {/* System --------------------------------------------------------- */}
        <Tile label="System">
          <p className="mt-2.5 truncate text-sm text-ink lw-num" title={host?.hostname}>
            {host?.hostname ?? NA}
          </p>
          <dl className="mt-3 flex flex-1 flex-col gap-1.5">
            <KeyValue label="OS" value={host?.os ?? NA} mono={false} title={host?.os} />
            <KeyValue label="Kernel" value={truncate(host?.kernel, 24)} title={host?.kernel} />
            <KeyValue label="Uptime" value={system?.uptime_human ?? NA} />
          </dl>
        </Tile>
      </div>

      {/* Filesystems ------------------------------------------------------
          Every reported mount gets a row, worst first. The disk tile above can
          only show the primary filesystem, which on a lab server is usually not
          the one about to fill up. */}
      {system ? (
        <div className="lw-card px-3.5 py-3" data-testid="filesystems">
          <div className="flex items-baseline justify-between gap-3">
            <span className="lw-label">Filesystems</span>
            <span className="lw-num text-xs text-faint">
              {disks.length === 1 ? '1 mount' : `${disks.length} mounts`}
            </span>
          </div>
          <div className="mt-1.5 flex flex-col divide-y divide-line">
            {[primary, ...filesystemsByRisk(disks, primary)]
              .filter((disk): disk is DiskInfo => Boolean(disk))
              .map((disk) => (
                <FilesystemRow key={`${disk.device}:${disk.mountpoint}`} disk={disk} />
              ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
