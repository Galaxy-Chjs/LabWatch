import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Header } from '../Header'
import type { HeaderProps } from '../Header'
import { FIXTURE_NOW, makeOverview, makeSystemStatus } from './fixtures'

function renderHeader(overrides: Partial<HeaderProps> = {}) {
  const props: HeaderProps = {
    overview: makeOverview(),
    lastUpdated: FIXTURE_NOW,
    isStale: false,
    onRefresh: vi.fn(),
    themePreference: 'system',
    resolvedTheme: 'dark',
    onThemeChange: vi.fn(),
    ...overrides,
  }
  return { ...render(<Header {...props} />), props }
}

describe('Header', () => {
  it('shows the product mark, hostname, uptime and driver facts', () => {
    renderHeader()

    expect(screen.getByText('Lite')).toBeInTheDocument()
    expect(screen.getByText('lab-gpu-01')).toBeInTheDocument()
    expect(screen.getByText('4d 7h 30m')).toBeInTheDocument()
    expect(screen.getByText('Ubuntu 24.04.1 LTS')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // GPU count
    expect(screen.getByText('560.94')).toBeInTheDocument()
    expect(screen.getByText('12.4')).toBeInTheDocument()
    expect(screen.queryByText('Demo Data')).not.toBeInTheDocument()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
  })

  it('degrades to N/A before the first payload arrives', () => {
    renderHeader({ overview: undefined, lastUpdated: null })

    expect(screen.getAllByText('N/A').length).toBeGreaterThan(2)
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
  })

  it('flags demo data and stale polling', () => {
    renderHeader({
      overview: makeOverview({ system: makeSystemStatus({ demo: true }) }),
      isStale: true,
    })

    expect(screen.getByText('Demo Data')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()
  })

  it('reports the chosen theme preference', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()
    renderHeader({ onThemeChange })

    expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Light theme' }))
    expect(onThemeChange).toHaveBeenCalledWith('light')
  })

  it('refreshes on demand', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    renderHeader({ onRefresh })

    await user.click(screen.getByRole('button', { name: 'Refresh metrics' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
