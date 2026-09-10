import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ProcessSection } from '../ProcessSection'
import { makeGpuProcess, makeProcessCollection } from './fixtures'

const ROWS = [
  makeGpuProcess({
    pid: 111,
    gpu_index: 0,
    gpu_memory: 2_147_483_648, // 2 GiB
    name: 'alpha',
    username: 'ana',
    command: 'python /srv/alpha.py',
  }),
  makeGpuProcess({
    pid: 222,
    gpu_index: 1,
    gpu_memory: 8_589_934_592, // 8 GiB
    name: 'beta',
    username: 'bob',
    command: 'python /srv/beta.py',
  }),
  makeGpuProcess({
    pid: 333,
    gpu_index: 0,
    gpu_memory: null,
    name: 'gamma',
    username: 'cara',
    command: 'python /srv/gamma.py',
  }),
]

const COLLECTION = makeProcessCollection({ processes: ROWS })

/** PID column values, in render order. */
function renderedPids(): string[] {
  return screen
    .getAllByTestId('process-row')
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '')
}

describe('ProcessSection', () => {
  it('renders a row per process, largest GPU memory first and nulls last', () => {
    render(<ProcessSection collection={COLLECTION} />)

    expect(screen.getByRole('heading', { name: 'GPU PROCESSES' })).toBeInTheDocument()
    expect(screen.getByTestId('process-table')).toBeInTheDocument()
    expect(screen.getAllByTestId('process-row')).toHaveLength(3)
    expect(renderedPids()).toEqual(['222', '111', '333'])
    expect(screen.getByText('3 processes')).toBeInTheDocument()
  })

  it('filters rows with the search box', async () => {
    const user = userEvent.setup()
    render(<ProcessSection collection={COLLECTION} />)

    await user.type(screen.getByLabelText('Search processes'), 'beta')

    expect(renderedPids()).toEqual(['222'])
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(renderedPids()).toEqual(['222', '111', '333'])
  })

  it('filters rows with the per-GPU chips', async () => {
    const user = userEvent.setup()
    render(<ProcessSection collection={COLLECTION} />)

    const gpu0 = screen.getByRole('button', { name: /^gpu 0/i })
    expect(gpu0).toHaveAttribute('aria-pressed', 'false')
    await user.click(gpu0)

    expect(gpu0).toHaveAttribute('aria-pressed', 'true')
    expect(renderedPids()).toEqual(['111', '333'])

    await user.click(screen.getByRole('button', { name: /^all/i }))
    expect(renderedPids()).toEqual(['222', '111', '333'])
  })

  it('sorts by GPU memory and reverses on a second click', async () => {
    const user = userEvent.setup()
    render(<ProcessSection collection={COLLECTION} />)

    const vramHeader = screen.getByRole('columnheader', { name: /gpu memory/i })
    expect(vramHeader).toHaveAttribute('aria-sort', 'descending')

    await user.click(within(vramHeader).getByRole('button'))
    expect(vramHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(renderedPids()).toEqual(['111', '222', '333'])

    await user.click(within(vramHeader).getByRole('button'))
    expect(vramHeader).toHaveAttribute('aria-sort', 'descending')
    expect(renderedPids()).toEqual(['222', '111', '333'])
  })

  it('sorts by PID ascending first', async () => {
    const user = userEvent.setup()
    render(<ProcessSection collection={COLLECTION} />)

    const pidHeader = screen.getByRole('columnheader', { name: /pid/i })
    await user.click(within(pidHeader).getByRole('button'))

    expect(pidHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(renderedPids()).toEqual(['111', '222', '333'])
  })

  it('explains an empty process list', () => {
    render(<ProcessSection collection={makeProcessCollection({ processes: [] })} />)

    expect(
      screen.getByText('No GPU processes are currently holding memory.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('process-table')).not.toBeInTheDocument()
  })

  it('reports an unavailable process list with the backend error', () => {
    render(
      <ProcessSection
        collection={makeProcessCollection({
          available: false,
          error: 'permission denied reading /proc',
          processes: [],
        })}
      />,
    )

    expect(screen.getByText('GPU process list unavailable')).toBeInTheDocument()
    expect(screen.getByText('permission denied reading /proc')).toBeInTheDocument()
  })

  it('shows a Demo Data chip when the payload is simulated', () => {
    render(<ProcessSection collection={makeProcessCollection({ demo: true })} />)

    expect(screen.getByText('Demo Data')).toBeInTheDocument()
  })
})
