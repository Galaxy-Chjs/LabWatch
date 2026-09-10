import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { useGpuHistory, useLiveMetrics, useSystemHistory } from '../../hooks/useMetrics'
import {
  FIXTURE_NOW,
  makeGpuHistory,
  makeGpuHistoryPoint,
  makeGpuHistorySeries,
  makeOverview,
  makeSystemHistory,
  makeSystemHistoryPoint,
} from './fixtures'

vi.mock('../../hooks/useMetrics', () => ({
  useLiveMetrics: vi.fn(),
  useSystemHistory: vi.fn(),
  useGpuHistory: vi.fn(),
}))

const HOST_POINTS = [
  makeSystemHistoryPoint({ timestamp: FIXTURE_NOW - 20, cpu_percent: 12, memory_percent: 30 }),
  makeSystemHistoryPoint({ timestamp: FIXTURE_NOW - 10, cpu_percent: 44, memory_percent: 36 }),
]

const GPU_POINTS = [
  makeGpuHistoryPoint({ timestamp: FIXTURE_NOW - 20, utilization: 30, memory_percent: 60, temperature: 64 }),
  makeGpuHistoryPoint({ timestamp: FIXTURE_NOW - 10, utilization: 88, memory_percent: 78, temperature: 71 }),
]

describe('dashboard composition', () => {
  beforeEach(() => {
    vi.mocked(useLiveMetrics).mockReturnValue({
      overview: makeOverview(),
      error: undefined,
      isLoading: false,
      isInitialLoading: false,
      lastUpdated: FIXTURE_NOW,
      refresh: vi.fn(),
      isStale: false,
    })
    vi.mocked(useSystemHistory).mockReturnValue({
      data: makeSystemHistory({ points: HOST_POINTS }),
      error: undefined,
      isLoading: false,
      refresh: vi.fn(),
    })
    vi.mocked(useGpuHistory).mockReturnValue({
      data: makeGpuHistory({ series: [makeGpuHistorySeries({ points: GPU_POINTS })] }),
      error: undefined,
      isLoading: false,
      refresh: vi.fn(),
    })
  })

  it('renders header, host, GPUs, processes and history together', () => {
    render(<App />)

    // header
    expect(screen.getByText('Lite')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh metrics' })).toBeInTheDocument()

    // sections
    expect(screen.getByRole('heading', { name: 'HOST' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'GPUS' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'GPU PROCESSES' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'HISTORY' })).toBeInTheDocument()

    // content
    expect(screen.getByTestId('gpu-card-0')).toBeInTheDocument()
    expect(screen.getByTestId('process-table')).toBeInTheDocument()
    expect(screen.getByTestId('history-section')).toBeInTheDocument()
    expect(screen.getAllByText('lab-gpu-01').length).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
