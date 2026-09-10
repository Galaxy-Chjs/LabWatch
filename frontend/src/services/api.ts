/**
 * Typed fetch wrapper around the LabWatch REST API.
 *
 * Every call surfaces a readable message on failure so the dashboard can show a
 * useful error banner instead of an empty screen.
 */

import type {
  GpuCollection,
  GpuHistory,
  HealthStatus,
  HistoryRange,
  Overview,
  ProcessCollection,
  SystemHistory,
  SystemStatus,
} from '../types/api'

export class ApiError extends Error {
  readonly status: number
  readonly url: string

  constructor(message: string, status: number, url: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
  }
}

/** Base URL for API calls. Empty means same-origin (the production setup). */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError('Cannot reach the LabWatch backend. Is it running?', 0, url)
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* response body was not JSON; keep the status text */
    }
    throw new ApiError(detail, response.status, url)
  }

  return (await response.json()) as T
}

/** Fetch the aggregated dashboard payload. */
export function fetchOverview(signal?: AbortSignal): Promise<Overview> {
  return request<Overview>('/api/overview', { signal })
}

/** Fetch the service health probe. */
export function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return request<HealthStatus>('/api/health', { signal })
}

/** Fetch host metrics only. */
export function fetchSystem(signal?: AbortSignal): Promise<SystemStatus> {
  return request<SystemStatus>('/api/system', { signal })
}

/** Fetch GPU metrics only. */
export function fetchGpus(signal?: AbortSignal): Promise<GpuCollection> {
  return request<GpuCollection>('/api/gpus', { signal })
}

/** Fetch GPU processes only. */
export function fetchProcesses(signal?: AbortSignal): Promise<ProcessCollection> {
  return request<ProcessCollection>('/api/processes', { signal })
}

/** Fetch host history for a range. */
export function fetchSystemHistory(range: HistoryRange, signal?: AbortSignal): Promise<SystemHistory> {
  return request<SystemHistory>(`/api/history/system?range=${encodeURIComponent(range)}`, { signal })
}

/** Fetch GPU history for every GPU in a range. */
export function fetchGpuHistory(range: HistoryRange, signal?: AbortSignal): Promise<GpuHistory> {
  return request<GpuHistory>(`/api/history/gpus?range=${encodeURIComponent(range)}`, { signal })
}
