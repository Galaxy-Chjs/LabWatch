/**
 * Chart row shaping.
 *
 * Recharts wants one flat row per x value, so per-GPU series are merged on
 * timestamp and keyed by `u<index>` / `m<index>` / `t<index>` / `p<index>`.
 */

import type { GpuHistorySeries, SystemHistoryPoint } from '../../types/api'
import { colorForGpuIndex } from './chartTheme'

/** A single x value plus arbitrary numeric series. */
export type ChartRow = { t: number } & Record<string, number | null>

export interface SeriesDef {
  key: string
  name: string
  color: string
}

/** CPU / RAM / disk, as percentages. */
export function toHostRows(points: readonly SystemHistoryPoint[]): ChartRow[] {
  return points.map(
    (point): ChartRow => ({
      t: point.timestamp,
      cpu_percent: point.cpu_percent,
      memory_percent: point.memory_percent,
      disk_percent: point.disk_percent,
    }),
  )
}

/** Merge every GPU's points into one row per timestamp, sorted ascending. */
export function mergeGpuSeries(series: readonly GpuHistorySeries[]): ChartRow[] {
  const byTimestamp = new Map<number, Record<string, number | null>>()

  for (const entry of series) {
    for (const point of entry.points) {
      let row = byTimestamp.get(point.timestamp)
      if (!row) {
        row = {}
        byTimestamp.set(point.timestamp, row)
      }
      row[`u${entry.gpu_index}`] = point.utilization
      row[`m${entry.gpu_index}`] = point.memory_percent
      row[`t${entry.gpu_index}`] = point.temperature
      row[`p${entry.gpu_index}`] = point.power_usage
    }
  }

  return [...byTimestamp.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([timestamp, values]): ChartRow => ({ ...values, t: timestamp }))
}

/** Series keys for one metric across every GPU. */
export function gpuSeriesDefs(
  indexes: readonly number[],
  metric: 'u' | 'm' | 't',
  label: string,
): SeriesDef[] {
  return indexes.map((index) => ({
    key: `${metric}${index}`,
    name: `${label} GPU ${index}`,
    color: colorForGpuIndex(index),
  }))
}
