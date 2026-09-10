/**
 * GPU processes: heading, count, search, per-GPU filter and the table.
 *
 * The filter/sort state lives here; `ProcessTable` only renders. A missing or
 * unavailable process list is reported plainly — a host with no compute jobs is
 * normal, not a failure.
 */

import { useCallback, useMemo, useState } from 'react'

import type { GpuProcess, ProcessCollection } from '../types/api'
import { Chip } from './Chip'
import { EmptyState } from './EmptyState'
import { IconAlert, IconClose, IconSearch } from './Icons'
import { LoadingState } from './LoadingState'
import { ProcessTable } from './ProcessTable'
import {
  DEFAULT_SORT,
  filterProcesses,
  gpuIndexes,
  nextSort,
  sortProcesses,
} from './processUtils'
import type { ProcessSortKey, SortState } from './processUtils'
import { SectionHeader } from './SectionHeader'

export interface ProcessSectionProps {
  collection: ProcessCollection | undefined
}

const NO_PROCESSES: GpuProcess[] = []

interface FilterChipProps {
  label: string
  count: number
  pressed: boolean
  onClick: () => void
}

function FilterChip({ label, count, pressed, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-4 transition-colors ${
        pressed
          ? 'border-accent/45 bg-accent/10 text-accent'
          : 'border-line text-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      <span className="lw-num">{label}</span>
      <span className="lw-num text-faint">{count}</span>
    </button>
  )
}

export function ProcessSection({ collection }: ProcessSectionProps) {
  const [query, setQuery] = useState('')
  const [gpuFilter, setGpuFilter] = useState<number | 'all'>('all')
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)

  const processes = collection?.processes ?? NO_PROCESSES
  const indexes = useMemo(() => gpuIndexes(processes), [processes])

  // A GPU can disappear between polls; fall back to "All" rather than showing
  // an empty table with no explanation.
  const activeFilter: number | 'all' =
    gpuFilter !== 'all' && !indexes.includes(gpuFilter) ? 'all' : gpuFilter

  const counts = useMemo(() => {
    const map = new Map<number, number>()
    for (const process of processes) {
      map.set(process.gpu_index, (map.get(process.gpu_index) ?? 0) + 1)
    }
    return map
  }, [processes])

  const visible = useMemo(
    () => sortProcesses(filterProcesses(processes, query, activeFilter), sort.key, sort.direction),
    [processes, query, activeFilter, sort],
  )

  const onSort = useCallback((key: ProcessSortKey) => {
    setSort((previous) => nextSort(previous, key))
  }, [])

  const total = processes.length
  const filtering = query.trim() !== '' || activeFilter !== 'all'

  return (
    <section data-testid="process-section" className="flex flex-col gap-3">
      <SectionHeader
        title="GPU PROCESSES"
        meta={<Chip>{total === 1 ? '1 process' : `${total} processes`}</Chip>}
      >
        {filtering && total > 0 ? (
          <span className="lw-num text-xs text-faint">{visible.length} shown</span>
        ) : null}
        {collection?.demo ? <Chip tone="warn">Demo Data</Chip> : null}
      </SectionHeader>

      {collection === undefined ? (
        <LoadingState label="Loading GPU processes…" />
      ) : collection.available === false ? (
        <EmptyState
          title="GPU process list unavailable"
          detail={collection.error}
          hint="Process details require the NVIDIA driver and sufficient permissions."
          icon={<IconAlert size={20} />}
        />
      ) : total === 0 ? (
        <EmptyState title="No GPU processes are currently holding memory." />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="relative">
              <IconSearch
                size={14}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search processes"
                placeholder="Search PID, name, command, user"
                className="h-8 w-60 rounded-md border border-line bg-surface pl-7 pr-7 text-xs text-ink placeholder:text-faint focus-visible:border-line-strong sm:w-72"
              />
              {query !== '' ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint transition-colors hover:text-ink"
                >
                  <IconClose size={13} />
                </button>
              ) : null}
            </div>

            <div role="group" aria-label="Filter by GPU" className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                label="All"
                count={total}
                pressed={activeFilter === 'all'}
                onClick={() => setGpuFilter('all')}
              />
              {indexes.map((index) => (
                <FilterChip
                  key={index}
                  label={`GPU ${index}`}
                  count={counts.get(index) ?? 0}
                  pressed={activeFilter === index}
                  onClick={() => setGpuFilter(index)}
                />
              ))}
            </div>
          </div>

          <ProcessTable
            rows={visible}
            sortKey={sort.key}
            sortDirection={sort.direction}
            onSort={onSort}
          />
        </div>
      )}
    </section>
  )
}
