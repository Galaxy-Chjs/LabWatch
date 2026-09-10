/**
 * GPU process table.
 *
 * Presentational only: filtering and sorting live in `processUtils`, the
 * surrounding controls live in `ProcessSection`. The table is horizontally
 * scrollable so the page layout never breaks on a narrow window.
 */

import { useState } from 'react'

import { formatBytes, formatPercent, formatRuntime, NA, truncate } from '../lib/format'
import type { GpuProcess } from '../types/api'
import { IconArrowDown, IconArrowUp } from './Icons'
import type { ProcessSortKey, SortDirection } from './processUtils'

export interface ProcessTableProps {
  rows: readonly GpuProcess[]
  sortKey: ProcessSortKey
  sortDirection: SortDirection
  onSort: (key: ProcessSortKey) => void
}

interface Column {
  id: string
  label: string
  /** `null` for columns that are not sortable. */
  sortKey: ProcessSortKey | null
  align: 'left' | 'right'
}

const COLUMNS: readonly Column[] = [
  { id: 'pid', label: 'PID', sortKey: 'pid', align: 'left' },
  { id: 'gpu', label: 'GPU', sortKey: 'gpu_index', align: 'left' },
  { id: 'vram', label: 'GPU Memory', sortKey: 'gpu_memory', align: 'right' },
  { id: 'user', label: 'User', sortKey: null, align: 'left' },
  { id: 'process', label: 'Process', sortKey: null, align: 'left' },
  { id: 'command', label: 'Command', sortKey: null, align: 'left' },
  { id: 'cpu', label: 'CPU %', sortKey: 'cpu_percent', align: 'right' },
  { id: 'ram', label: 'RAM', sortKey: 'memory_rss', align: 'right' },
  { id: 'runtime', label: 'Runtime', sortKey: 'runtime_seconds', align: 'right' },
] as const

export function ProcessTable({ rows, sortKey, sortDirection, onSort }: ProcessTableProps) {
  const [expandedPid, setExpandedPid] = useState<number | null>(null)

  return (
    <div className="lw-card overflow-x-auto">
      <table data-testid="process-table" className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {COLUMNS.map((column) => {
              const sortable = column.sortKey
              const isActive = sortable !== null && sortable === sortKey
              const ariaSort =
                sortable === null
                  ? undefined
                  : isActive
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={`whitespace-nowrap px-3 py-2.5 ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {sortable === null ? (
                    <span className="lw-label">{column.label}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSort(sortable)}
                      className={`lw-label inline-flex items-center gap-1 transition-colors hover:text-muted ${
                        isActive ? 'text-muted' : ''
                      }`}
                    >
                      {column.label}
                      {isActive ? (
                        sortDirection === 'asc' ? (
                          <IconArrowUp size={12} />
                        ) : (
                          <IconArrowDown size={12} />
                        )
                      ) : null}
                    </button>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-xs text-faint">
                No processes match the current filter.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const expanded = expandedPid === row.pid
              return (
                <tr
                  key={row.pid}
                  data-testid="process-row"
                  className="border-b border-line last:border-b-0 hover:bg-surface-2"
                >
                  <td className="lw-num whitespace-nowrap px-3 py-2 text-ink">{row.pid}</td>
                  <td className="px-3 py-2">
                    <span className="lw-num rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                      GPU {row.gpu_index}
                    </span>
                  </td>
                  <td className="lw-num whitespace-nowrap px-3 py-2 text-right text-ink">
                    {formatBytes(row.gpu_memory)}
                  </td>
                  <td className="px-3 py-2 text-muted">{row.username ?? NA}</td>
                  <td className="px-3 py-2 text-ink">{row.name ?? NA}</td>
                  <td className="max-w-[26rem] px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setExpandedPid(expanded ? null : row.pid)}
                      aria-expanded={expanded}
                      aria-label={`Command for PID ${row.pid}`}
                      title={row.command ?? undefined}
                      className={`w-full font-mono text-xs text-muted transition-colors hover:text-ink ${
                        expanded ? 'whitespace-pre-wrap break-all text-left' : 'truncate text-left'
                      }`}
                    >
                      {expanded ? (row.command ?? NA) : truncate(row.command, 56)}
                    </button>
                  </td>
                  <td className="lw-num whitespace-nowrap px-3 py-2 text-right text-muted">
                    {formatPercent(row.cpu_percent)}
                  </td>
                  <td className="lw-num whitespace-nowrap px-3 py-2 text-right text-muted">
                    {formatBytes(row.memory_rss)}
                  </td>
                  <td
                    className="lw-num whitespace-nowrap px-3 py-2 text-right text-muted"
                    title={row.runtime_human ?? undefined}
                  >
                    {formatRuntime(row.runtime_seconds)}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
