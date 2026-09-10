/**
 * Process-table filtering and sorting.
 *
 * Kept out of the component so the ordering rules are trivial to reason about:
 *   - descending first for "how much is it using" columns, ascending for identity
 *   - rows with a missing value always sort last, in both directions
 *   - PID is the tie-breaker, which keeps the order stable between polls
 */

import type { GpuProcess } from '../types/api'

export type ProcessSortKey =
  | 'pid'
  | 'gpu_index'
  | 'gpu_memory'
  | 'cpu_percent'
  | 'memory_rss'
  | 'runtime_seconds'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: ProcessSortKey
  direction: SortDirection
}

/** The default view: the largest VRAM consumer first. */
export const DEFAULT_SORT: SortState = { key: 'gpu_memory', direction: 'desc' }

const DESCENDING_FIRST: ReadonlySet<ProcessSortKey> = new Set<ProcessSortKey>([
  'gpu_memory',
  'cpu_percent',
  'memory_rss',
  'runtime_seconds',
])

/** The direction a column uses the first time it is selected. */
export function defaultDirection(key: ProcessSortKey): SortDirection {
  return DESCENDING_FIRST.has(key) ? 'desc' : 'asc'
}

/** Clicking the active column reverses it; a new column starts at its default. */
export function nextSort(current: SortState, key: ProcessSortKey): SortState {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { key, direction: defaultDirection(key) }
}

function numeric(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : value
}

export function sortProcesses(
  rows: readonly GpuProcess[],
  key: ProcessSortKey,
  direction: SortDirection,
): GpuProcess[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = numeric(a[key])
    const right = numeric(b[key])
    if (left === null && right === null) return a.pid - b.pid
    if (left === null) return 1
    if (right === null) return -1
    if (left === right) return a.pid - b.pid
    return left < right ? -factor : factor
  })
}

/** Case-insensitive match over PID, process name, command line and user. */
export function matchesQuery(row: GpuProcess, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const haystack = [String(row.pid), row.name, row.command, row.username]
  return haystack.some((value) => (value ?? '').toLowerCase().includes(needle))
}

export function filterProcesses(
  rows: readonly GpuProcess[],
  query: string,
  gpuFilter: number | 'all',
): GpuProcess[] {
  return rows.filter(
    (row) => (gpuFilter === 'all' || row.gpu_index === gpuFilter) && matchesQuery(row, query),
  )
}

/** Distinct GPU indexes present in the data, ascending. */
export function gpuIndexes(rows: readonly GpuProcess[]): number[] {
  return [...new Set(rows.map((row) => row.gpu_index))].sort((a, b) => a - b)
}
