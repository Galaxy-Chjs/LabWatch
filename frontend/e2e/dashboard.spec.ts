import { expect, test } from '@playwright/test'

import { trackConsoleErrors, waitForDashboard } from './helpers'

test.describe('dashboard', () => {
  test('loads and shows host, GPU and process sections without console errors', async ({ page }) => {
    const errors = trackConsoleErrors(page)

    await waitForDashboard(page)

    // The main regions of the page are present. Section headings are matched
    // exactly so they cannot collide with the chart titles beneath them.
    await expect(page.getByRole('heading', { name: 'GPUS', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'GPU PROCESSES', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'HOST', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'HISTORY', exact: true })).toBeVisible()

    // Demo mode is clearly labelled so synthetic data is never mistaken for real.
    await expect(page.getByText(/demo data/i).first()).toBeVisible()

    expect(errors).toEqual([])
  })

  test('exposes the API health endpoint through the dev proxy', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.demo_mode).toBe(true)
    expect(body.database).toBe('ok')
  })
})
