import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useGpuHistory, useSystemHistory } from '../../hooks/useMetrics'
import { HistorySection } from '../HistorySection'
import {
  FIXTURE_NOW,
  makeGpuHistory,
  makeGpuHistoryPoint,
  makeGpuHistorySeries,
  makeSystemHistory,
  makeSystemHistoryPoint,
} from './fixtures'

vi.mock('../../hooks/useMetrics', () => ({
  useSystemHistory: vi.fn(),
  useGpuHistory: vi.fn(),
}))

const EMPTY_MESSAGE = 'No history yet — samples are recorded every 10 seconds.'

function mockHistory(system = makeSystemHistory(), gpus = makeGpuHistory()) {
  vi.mocked(useSystemHistory).mockReturnValue({
    data: system,
    error: undefined,
    isLoading: false,
    refresh: vi.fn(),
  })
  vi.mocked(useGpuHistory).mockReturnValue({
    data: gpus,
    error: undefined,
    isLoading: false,
    refresh: vi.fn(),
  })
}

describe('HistorySection', () => {
  beforeEach(() => {
    mockHistory()
  })

  it('renders the range control and an empty state per chart when there are no points', () => {
    render(<HistorySection pollInterval={2} />)

    expect(screen.getByTestId('history-section')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'History range' })).toBeInTheDocument()
    expect(screen.getByTestId('range-1h')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('range-6h')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('range-24h')).toHaveAttribute('aria-pressed', 'false')

    // host, GPU utilisation, GPU memory, GPU temperature
    expect(screen.getAllByText(EMPTY_MESSAGE)).toHaveLength(4)
  })

  it('re-queries both hooks when the range changes', async () => {
    const user = userEvent.setup()
    render(<HistorySection pollInterval={2} />)

    expect(vi.mocked(useSystemHistory)).toHaveBeenCalledWith('1h', 2)

    await user.click(screen.getByTestId('range-6h'))

    expect(screen.getByTestId('range-6h')).toHaveAttribute('aria-pressed', 'true')
    expect(vi.mocked(useSystemHistory)).toHaveBeenLastCalledWith('6h', 2)
    expect(vi.mocked(useGpuHistory)).toHaveBeenLastCalledWith('6h', 2)
  })

  it('replaces the empty state with a chart once samples exist', () => {
    mockHistory(
      makeSystemHistory({
        points: [
          makeSystemHistoryPoint({ timestamp: FIXTURE_NOW - 20, cpu_percent: 10 }),
          makeSystemHistoryPoint({ timestamp: FIXTURE_NOW - 10, cpu_percent: 20 }),
        ],
      }),
      makeGpuHistory({
        series: [
          makeGpuHistorySeries({
            points: [
              makeGpuHistoryPoint({ timestamp: FIXTURE_NOW - 20, utilization: 30 }),
              makeGpuHistoryPoint({ timestamp: FIXTURE_NOW - 10, utilization: 90 }),
            ],
          }),
        ],
      }),
    )

    render(<HistorySection pollInterval={2} />)

    expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument()
    expect(screen.getByText('Host utilisation')).toBeInTheDocument()
    expect(screen.getByText('GPU utilisation')).toBeInTheDocument()
    expect(screen.getByText('GPU memory')).toBeInTheDocument()
    expect(screen.getByText('GPU temperature')).toBeInTheDocument()
  })

  it('surfaces a load failure with a retry action', async () => {
    const user = userEvent.setup()
    const refresh = vi.fn()
    vi.mocked(useSystemHistory).mockReturnValue({
      data: undefined,
      error: new Error('history endpoint timed out'),
      isLoading: false,
      refresh,
    })

    render(<HistorySection pollInterval={2} />)

    expect(screen.getAllByText('history endpoint timed out')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
