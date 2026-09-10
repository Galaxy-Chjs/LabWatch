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

function extraMounts(disks: DiskInfo[], primary: DiskInfo | undefined): DiskInfo[] {
  return disks.filter((disk) => disk !== primary).slice(0, 2)
}

export function HostSection({ system }: HostSectionProps) {
  const cpu = system?.cpu
  const memory = system?.memory
  const host = system?.host
  const disks = system?.disks ?? []
  const primary = disks.find((disk) => disk.is_primary) ?? disks[0]
  const extras = extraMounts(disks, primary)

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
            {extras.map((disk) => (
              <KeyValue
                key={`${disk.device}:${disk.mountpoint}`}
                label={disk.mountpoint}
                value={formatPercent(disk.percent)}
                title={disk.device}
              />
            ))}
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
    </section>
  )
}
