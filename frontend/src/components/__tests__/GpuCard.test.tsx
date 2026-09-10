import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  formatBytesPair,
  formatPercent,
  formatTemperature,
  formatWatts,
} from '../../lib/format'
import { GpuCard } from '../GpuCard'
import { makeGpuStatus, makeNullGpuStatus } from './fixtures'

describe('GpuCard', () => {
  it('renders identity and the four headline metrics', () => {
    const gpu = makeGpuStatus()
    render(<GpuCard gpu={gpu} />)

    expect(screen.getByTestId('gpu-card-0')).toBeInTheDocument()
    expect(screen.getByText('GPU 0')).toBeInTheDocument()
    expect(screen.getByText('NVIDIA RTX A6000')).toBeInTheDocument()
    expect(screen.getByText(gpu.uuid ?? '')).toBeInTheDocument()
    expect(screen.getByText(formatPercent(gpu.utilization_percent))).toBeInTheDocument()
    expect(screen.getByText(formatBytesPair(gpu.memory_used, gpu.memory_total))).toBeInTheDocument()
    expect(screen.getByText(formatTemperature(gpu.temperature_c))).toBeInTheDocument()
    expect(screen.getByText(formatWatts(gpu.power_watts))).toBeInTheDocument()
    expect(screen.getByText(`limit ${formatWatts(gpu.power_limit_watts)}`)).toBeInTheDocument()
  })

  it('renders the secondary row', () => {
    const gpu = makeGpuStatus()
    render(<GpuCard gpu={gpu} />)

    expect(screen.getByText('Fan')).toBeInTheDocument()
    expect(screen.getByText('55%')).toBeInTheDocument()
    expect(screen.getByText('1800 MHz')).toBeInTheDocument()
    expect(screen.getByText('8001 MHz')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  it('renders N/A — never null, undefined or NaN — when every metric is missing', () => {
    const gpu = makeNullGpuStatus()
    const { container } = render(<GpuCard gpu={gpu} />)

    expect(screen.getAllByText('N/A').length).toBeGreaterThan(5)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/undefined/)
    expect(text).not.toMatch(/\bnull\b/)
    expect(text).not.toMatch(/NaN/)
  })
})
