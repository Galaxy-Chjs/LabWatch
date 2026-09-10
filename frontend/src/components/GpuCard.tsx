/**
 * A single GPU, rendered as the densest useful summary of the device.
 *
 * Layout, top to bottom:
 *   - identity: index badge, model name, UUID
 *   - headline metrics: utilisation, VRAM, temperature, power (2×2 grid)
 *   - secondary row: fan, clocks, processes, persistence
 *
 * Colour carries state only: temperature is coloured by its own thresholds,
 * capacity meters take their level from `levelForPercent`.
 */

import {
  formatBytesPair,
  formatPercent,
  formatTemperature,
  formatWatts,
  levelForTemperature,
  NA,
  textColorForLevel,
} from '../lib/format'
import type { GpuStatus } from '../types/api'
import { Meter } from './Meter'
import { Stat } from './StatTile'

export interface GpuCardProps {
  gpu: GpuStatus
}

function mhz(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  return `${Math.round(value)} MHz`
}

function count(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  return String(value)
}

function persistence(value: boolean | null): string {
  if (value === null) return NA
  return value ? 'Enabled' : 'Disabled'
}

export function GpuCard({ gpu }: GpuCardProps) {
  const utilization = gpu.utilization_percent
  const memoryPercent = gpu.memory_percent ?? null
  const temperatureLevel = levelForTemperature(gpu.temperature_c)

  return (
    <article
      data-testid={`gpu-card-${gpu.index}`}
      className="lw-card flex flex-col gap-3 p-3.5"
    >
      {/* Identity --------------------------------------------------------- */}
      <div className="flex flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="lw-num shrink-0 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] leading-4 text-muted">
            GPU {gpu.index}
          </span>
          <h3 className="min-w-0 truncate text-sm font-semibold text-ink" title={gpu.name ?? undefined}>
            {gpu.name ?? NA}
          </h3>
        </div>
        <p
          className="truncate font-mono text-[11px] leading-4 text-faint"
          title={gpu.uuid ?? undefined}
        >
          {gpu.uuid ?? NA}
        </p>
      </div>

      {/* Headline metrics ------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="lw-label">Utilization</span>
          <span className="lw-num text-2xl leading-none text-ink">
            {formatPercent(utilization)}
          </span>
          <Meter percent={utilization} className="mt-1" />
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="lw-label">VRAM</span>
          <span className="lw-num truncate text-sm leading-none text-ink" title="used / total">
            {formatBytesPair(gpu.memory_used, gpu.memory_total)}
          </span>
          <span className="lw-num text-[11px] leading-none text-faint">
            {formatPercent(memoryPercent)}
          </span>
          <Meter percent={memoryPercent} className="mt-1" />
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="lw-label">Temperature</span>
          <span
            className={`lw-num text-2xl leading-none ${textColorForLevel(temperatureLevel)}`}
          >
            {formatTemperature(gpu.temperature_c)}
          </span>
          <span className="text-[11px] leading-4 text-faint">
            {temperatureLevel === 'crit'
              ? 'over threshold'
              : temperatureLevel === 'warn'
                ? 'approaching limit'
                : temperatureLevel === 'idle'
                  ? 'not reported'
                  : 'nominal'}
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="lw-label">Power</span>
          <span className="lw-num text-2xl leading-none text-ink">{formatWatts(gpu.power_watts)}</span>
          <span className="lw-num text-[11px] leading-4 text-faint">
            limit {formatWatts(gpu.power_limit_watts)}
          </span>
          <Meter percent={gpu.power_percent} className="mt-1" />
        </div>
      </div>

      {/* Secondary row ---------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-line pt-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Fan" value={formatPercent(gpu.fan_percent, 0)} />
        <Stat label="SM clock" value={mhz(gpu.clocks_sm_mhz)} />
        <Stat label="Mem clock" value={mhz(gpu.clocks_mem_mhz)} />
        <Stat label="Processes" value={count(gpu.process_count)} />
        <Stat label="Persistence" value={persistence(gpu.persistence_mode)} />
      </div>
    </article>
  )
}
