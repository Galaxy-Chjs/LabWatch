import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { formatBytesPair, formatPercent } from '../../lib/format'
import { HostSection } from '../HostSection'
import { makeNullSystemStatus, makeSystemStatus } from './fixtures'

describe('HostSection', () => {
  it('renders the four tiles from the payload', () => {
    const system = makeSystemStatus()
    render(<HostSection system={system} />)

    expect(screen.getByRole('heading', { name: 'HOST' })).toBeInTheDocument()
    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('RAM')).toBeInTheDocument()
    expect(screen.getByText('Disk')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()

    // CPU
    expect(screen.getByText(formatPercent(system.cpu.usage_percent))).toBeInTheDocument()
    expect(screen.getByText('16 / 32')).toBeInTheDocument()
    expect(screen.getByText('3800 MHz')).toBeInTheDocument()
    expect(screen.getByText('1.25 / 1.10 / 0.90')).toBeInTheDocument()

    // RAM
    expect(
      screen.getByText(formatBytesPair(system.memory.used, system.memory.total)),
    ).toBeInTheDocument()

    // Disk
    expect(screen.getByText('/')).toBeInTheDocument()
    expect(screen.getByText('/data')).toBeInTheDocument()

    // System
    expect(screen.getByText('lab-gpu-01')).toBeInTheDocument()
    expect(screen.getByText('Ubuntu 24.04.1 LTS')).toBeInTheDocument()
    expect(screen.getByText('4d 7h 30m')).toBeInTheDocument()
  })

  it('keeps the layout and renders N/A when no payload has arrived', () => {
    const { container } = render(<HostSection system={undefined} />)

    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('RAM')).toBeInTheDocument()
    expect(screen.getByText('Disk')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(5)

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/undefined/)
    expect(text).not.toMatch(/NaN/)
  })

  it('renders N/A for a host that reports no metrics', () => {
    const { container } = render(<HostSection system={makeNullSystemStatus()} />)

    expect(screen.getAllByText('N/A').length).toBeGreaterThan(5)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bnull\b/)
    expect(text).not.toMatch(/undefined/)
    expect(text).not.toMatch(/NaN/)
  })
})
