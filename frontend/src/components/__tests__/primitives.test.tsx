import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Meter } from '../Meter'
import { LoadingState } from '../LoadingState'

describe('LoadingState', () => {
  it('announces itself politely and shows the label', () => {
    render(<LoadingState label="Connecting to LabWatch…" />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Connecting to LabWatch…')).toBeInTheDocument()
  })

  it('falls back to a default label', () => {
    render(<LoadingState />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})

describe('Meter', () => {
  it('scales the fill to the percentage', () => {
    render(<Meter percent={82.4} />)

    expect(screen.getByTestId('meter-fill')).toHaveStyle({ width: '82.4%' })
  })

  it('clamps out-of-range values', () => {
    render(<Meter percent={140} />)

    expect(screen.getByTestId('meter-fill')).toHaveStyle({ width: '100%' })
  })

  it('renders an empty track for a missing value', () => {
    render(<Meter percent={null} />)

    expect(screen.getByTestId('meter-fill')).toHaveStyle({ width: '0%' })
    expect(screen.getByTestId('meter-track').textContent).toBe('')
  })
})
