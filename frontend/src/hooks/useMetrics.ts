/**
 * Data hooks.
 *
 * Live metrics are polled with SWR. Polling pauses while the browser tab is
 * hidden so a forgotten dashboard does not keep hammering the server, and it
 * resumes with an immediate refresh when the tab becomes visible again.
 */

import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'

import { fetchGpuHistory, fetchHealth, fetchOverview, fetchSystemHistory } from '../services/api'
import type { GpuHistory, HealthStatus, HistoryRange, Overview, SystemHistory } from '../types/api'

/** Whether the document is currently visible. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  )

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return visible
}

export interface LiveMetrics {
  overview: Overview | undefined
  error: Error | undefined
  isLoading: boolean
  /** True only for the very first load, so a refresh never blanks the page. */
  isInitialLoading: boolean
  lastUpdated: number | null
  refresh: () => void
  isStale: boolean
}

/**
 * Poll `/api/overview`.
 *
 * @param intervalSeconds seconds between polls; the backend advertises its own
 *   interval and the dashboard follows it.
 */
export function useLiveMetrics(intervalSeconds: number): LiveMetrics {
  const visible = useDocumentVisible()
  const intervalMs = Math.max(1, intervalSeconds) * 1000

  const { data, error, isLoading, mutate } = useSWR<Overview, Error>(
    visible ? 'overview' : null,
    () => fetchOverview(),
    {
      refreshInterval: intervalMs,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      shouldRetryOnError: true,
      errorRetryInterval: Math.min(intervalMs, 5000),
      errorRetryCount: 5,
    },
  )

  const refresh = useCallback(() => {
    void mutate()
  }, [mutate])

  return {
    overview: data,
    error: error ?? undefined,
    isLoading,
    isInitialLoading: isLoading && data === undefined,
    lastUpdated: data?.generated_at ?? null,
    refresh,
    isStale: Boolean(error) && data !== undefined,
  }
}

export interface HistoryState<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  refresh: () => void
}

/** Poll host history for a selected range. */
export function useSystemHistory(range: HistoryRange, intervalSeconds: number): HistoryState<SystemHistory> {
  const visible = useDocumentVisible()
  const { data, error, isLoading, mutate } = useSWR<SystemHistory, Error>(
    visible ? ['history-system', range] : null,
    () => fetchSystemHistory(range),
    {
      // History changes slowly; refresh at most once a minute.
      refreshInterval: Math.max(30_000, intervalSeconds * 1000),
      keepPreviousData: true,
      revalidateOnFocus: true,
    },
  )

  return {
    data,
    error: error ?? undefined,
    isLoading,
    refresh: useCallback(() => void mutate(), [mutate]),
  }
}

/** Poll GPU history for a selected range. */
export function useGpuHistory(range: HistoryRange, intervalSeconds: number): HistoryState<GpuHistory> {
  const visible = useDocumentVisible()
  const { data, error, isLoading, mutate } = useSWR<GpuHistory, Error>(
    visible ? ['history-gpu', range] : null,
    () => fetchGpuHistory(range),
    {
      refreshInterval: Math.max(30_000, intervalSeconds * 1000),
      keepPreviousData: true,
      revalidateOnFocus: true,
    },
  )

  return {
    data,
    error: error ?? undefined,
    isLoading,
    refresh: useCallback(() => void mutate(), [mutate]),
  }
}

/** Poll the health endpoint; slower than the dashboard itself. */
export function useHealth(intervalSeconds = 30): HistoryState<HealthStatus> {
  const visible = useDocumentVisible()
  const { data, error, isLoading, mutate } = useSWR<HealthStatus, Error>(
    visible ? 'health' : null,
    () => fetchHealth(),
    {
      refreshInterval: Math.max(15_000, intervalSeconds * 1000),
      keepPreviousData: true,
    },
  )

  return {
    data,
    error: error ?? undefined,
    isLoading,
    refresh: useCallback(() => void mutate(), [mutate]),
  }
}
