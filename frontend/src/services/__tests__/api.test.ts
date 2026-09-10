import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  fetchGpuHistory,
  fetchGpus,
  fetchHealth,
  fetchOverview,
  fetchProcesses,
  fetchSystem,
  fetchSystemHistory,
} from '../api'

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init))
  vi.stubGlobal('fetch', spy)
  return spy
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api client', () => {
  it('requests the aggregated overview endpoint', async () => {
    const spy = mockFetch(() => jsonResponse({ system: {}, gpus: {}, processes: {} }))

    await fetchOverview()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('/api/overview')
  })

  it('builds the documented URLs', async () => {
    const spy = mockFetch(() => jsonResponse({}))

    await fetchHealth()
    await fetchSystem()
    await fetchGpus()
    await fetchProcesses()
    await fetchSystemHistory('6h')
    await fetchGpuHistory('24h')

    expect(spy.mock.calls.map((call) => call[0])).toEqual([
      '/api/health',
      '/api/system',
      '/api/gpus',
      '/api/processes',
      '/api/history/system?range=6h',
      '/api/history/gpus?range=24h',
    ])
  })

  it('requests JSON', async () => {
    const spy = mockFetch(() => jsonResponse({}))
    await fetchOverview()
    const init = spy.mock.calls[0][1]
    expect((init?.headers as Record<string, string>).Accept).toBe('application/json')
  })

  it('wraps a network failure in a readable ApiError', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch')
    })

    await expect(fetchOverview()).rejects.toBeInstanceOf(ApiError)
    await expect(fetchOverview()).rejects.toThrow(/Cannot reach the LabWatch backend/)
  })

  it('surfaces the FastAPI detail message on an HTTP error', async () => {
    mockFetch(() => jsonResponse({ detail: 'Input should be 1h, 6h or 24h' }, 422))

    const error = await fetchSystemHistory('1h').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).message).toBe('Input should be 1h, 6h or 24h')
  })

  it('falls back to the status text when the body is not JSON', async () => {
    mockFetch(() => new Response('<html>gateway error</html>', { status: 502, statusText: 'Bad Gateway' }))

    const error = (await fetchProcesses().catch((cause: unknown) => cause)) as ApiError
    expect(error.status).toBe(502)
    expect(error.message).toBe('502 Bad Gateway')
  })

  it('parses a successful payload', async () => {
    mockFetch(() => jsonResponse({ status: 'ok', version: '1.0.0' }))
    const health = await fetchHealth()
    expect(health.version).toBe('1.0.0')
  })
})
