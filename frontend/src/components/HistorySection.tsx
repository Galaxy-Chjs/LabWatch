/**
 * History section.
 *
 * Owns the selected range, polls host and GPU history through the metrics hooks,
 * and renders four charts. Every chart is independently honest about its state:
 * loading, failed (with retry) or "no samples yet".
 */

import { useMemo, useState } from 'react'

import { useGpuHistory, useSystemHistory } from '../hooks/useMetrics'
import { formatPercent, formatTemperature } from '../lib/format'
import { HISTORY_RANGES } from '../types/api'
import type { HistoryRange } from '../types/api'
import { ChartFrame } from './charts/ChartFrame'
import { TimeSeriesChart } from './charts/TimeSeriesChart'
import { gpuSeriesDefs, mergeGpuSeries, toHostRows } from './charts/seriesData'
import type { SeriesDef } from './charts/seriesData'
import { SectionHeader } from './SectionHeader'

export interface HistorySectionProps {
  pollInterval: number
}

const RANGE_LABELS: Record<HistoryRange, string> = {
  '1h': '1H',
  '6h': '6H',
  '24h': '24H',
}

const HOST_SERIES: readonly SeriesDef[] = [
  { key: 'cpu_percent', name: 'CPU %', color: 'var(--lw-accent)' },
  { key: 'memory_percent', name: 'RAM %', color: 'var(--lw-ok)' },
  { key: 'disk_percent', name: 'Disk %', color: '#8b5cf6' },
]

export function HistorySection({ pollInterval }: HistorySectionProps) {
  const [range, setRange] = useState<HistoryRange>('1h')

  const system = useSystemHistory(range, pollInterval)
  const gpus = useGpuHistory(range, pollInterval)

  const hostRows = useMemo(() => toHostRows(system.data?.points ?? []), [system.data])
  const gpuRows = useMemo(() => mergeGpuSeries(gpus.data?.series ?? []), [gpus.data])

  const gpuIndexes = useMemo(
    () => (gpus.data?.series ?? []).map((entry) => entry.gpu_index),
    [gpus.data],
  )

  const utilSeries = gpuSeriesDefs(gpuIndexes, 'u', 'util')
  const memorySeries = gpuSeriesDefs(gpuIndexes, 'm', 'VRAM')
  const tempSeries = gpuSeriesDefs(gpuIndexes, 't', 'temp')

  const rangeControl = (
    <div
      role="group"
      aria-label="History range"
      className="inline-flex items-center rounded-md border border-line bg-surface p-0.5"
    >
      {HISTORY_RANGES.map((value) => {
        const pressed = value === range
        return (
          <button
            key={value}
            type="button"
            data-testid={`range-${value}`}
            aria-pressed={pressed}
            onClick={() => setRange(value)}
            className={`lw-num rounded px-2 py-1 text-[11px] leading-4 transition-colors ${
              pressed ? 'bg-surface-3 text-ink' : 'text-faint hover:text-muted'
            }`}
          >
            {RANGE_LABELS[value]}
          </button>
        )
      })}
    </div>
  )

  const intervalMeta = system.data ? `samples every ${system.data.interval_seconds}s` : undefined

  return (
    <section data-testid="history-section" className="flex flex-col gap-3">
      <SectionHeader title="HISTORY" meta={intervalMeta}>
        {rangeControl}
      </SectionHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Host utilisation"
          meta={system.data ? `${hostRows.length} points` : undefined}
          isLoading={system.isLoading && system.data === undefined}
          error={system.error}
          isEmpty={hostRows.length === 0}
          onRetry={system.refresh}
          className="lg:col-span-2"
        >
          <TimeSeriesChart
            data={hostRows}
            series={HOST_SERIES}
            range={range}
            formatValue={formatPercent}
          />
        </ChartFrame>

        <ChartFrame
          title="GPU utilisation"
          meta={gpuRows.length > 0 ? `${gpuIndexes.length} devices` : undefined}
          isLoading={gpus.isLoading && gpus.data === undefined}
          error={gpus.error}
          isEmpty={gpuRows.length === 0}
          onRetry={gpus.refresh}
        >
          <TimeSeriesChart
            data={gpuRows}
            series={utilSeries}
            range={range}
            formatValue={formatPercent}
          />
        </ChartFrame>

        <ChartFrame
          title="GPU memory"
          meta={gpuRows.length > 0 ? 'percent of capacity' : undefined}
          isLoading={gpus.isLoading && gpus.data === undefined}
          error={gpus.error}
          isEmpty={gpuRows.length === 0}
          onRetry={gpus.refresh}
        >
          <TimeSeriesChart
            data={gpuRows}
            series={memorySeries}
            range={range}
            formatValue={formatPercent}
          />
        </ChartFrame>

        <ChartFrame
          title="GPU temperature"
          meta={gpuRows.length > 0 ? 'celsius' : undefined}
          isLoading={gpus.isLoading && gpus.data === undefined}
          error={gpus.error}
          isEmpty={gpuRows.length === 0}
          onRetry={gpus.refresh}
          className="lg:col-span-2"
        >
          <TimeSeriesChart
            data={gpuRows}
            series={tempSeries}
            range={range}
            formatValue={formatTemperature}
            yDomain={['auto', 'auto']}
          />
        </ChartFrame>
      </div>
    </section>
  )
}
