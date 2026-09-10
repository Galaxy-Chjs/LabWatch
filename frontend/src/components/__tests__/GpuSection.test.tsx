import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GpuSection } from '../GpuSection'
import { makeGpuCollection } from './fixtures'

describe('GpuSection', () => {
  it('shows a calm unavailable state when NVML is missing, without crashing', () => {
    render(
      <GpuSection
        collection={{
          available: false,
          driver_version: null,
          cuda_version: null,
          nvml_version: null,
          error: 'NVML Shared Library Not Found',
          gpus: [],
          collected_at: 1_767_225_600,
          demo: false,
        }}
      />,
    )

    expect(screen.getByText('NVIDIA GPU unavailable')).toBeInTheDocument()
    expect(screen.getByText('NVML Shared Library Not Found')).toBeInTheDocument()
    expect(screen.getByText(/still monitoring CPU, RAM and disk/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'GPUS' })).toBeInTheDocument()
    expect(screen.queryByTestId('gpu-card-0')).not.toBeInTheDocument()
  })

  it('renders one card per device when the driver is available', () => {
    render(<GpuSection collection={makeGpuCollection()} />)

    expect(screen.getByTestId('gpu-card-0')).toBeInTheDocument()
    expect(screen.getByTestId('gpu-card-1')).toBeInTheDocument()
    expect(screen.getByText(/driver 560\.94/)).toBeInTheDocument()
  })

  it('reports an empty device list distinctly from an unavailable driver', () => {
    render(<GpuSection collection={makeGpuCollection({ gpus: [] })} />)

    expect(screen.getByText('No GPUs reported')).toBeInTheDocument()
    expect(screen.queryByText('NVIDIA GPU unavailable')).not.toBeInTheDocument()
  })

  it('renders a skeleton while the first payload is in flight', () => {
    render(<GpuSection collection={undefined} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/loading gpu telemetry/i)).toBeInTheDocument()
  })
})
