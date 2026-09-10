import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ErrorBanner } from '../ErrorBanner'

describe('ErrorBanner', () => {
  it('renders the title and message, and retries on demand', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <ErrorBanner
        title="Cannot load live metrics"
        message="Cannot reach the LabWatch backend. Is it running?"
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Cannot load live metrics')).toBeInTheDocument()
    expect(
      screen.getByText('Cannot reach the LabWatch backend. Is it running?'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('omits the retry button when no handler is given', () => {
    render(<ErrorBanner title="Something failed" message="Try again later." />)

    expect(screen.getByText('Something failed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })
})
