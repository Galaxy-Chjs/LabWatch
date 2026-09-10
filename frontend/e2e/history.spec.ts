import { expect, test } from '@playwright/test'

import { waitForDashboard } from './helpers'

test.describe('history charts', () => {
  test('switching the history range updates the charts', async ({ page }) => {
    await waitForDashboard(page)

    // Scroll the charts into view; they live below the process table.
    await page.getByTestId('history-section').scrollIntoViewIfNeeded()

    const oneHour = page.getByRole('button', { name: '1H' })
    const sixHours = page.getByRole('button', { name: '6H' })
    const day = page.getByRole('button', { name: '24H' })

    await expect(oneHour).toHaveAttribute('aria-pressed', 'true')

    await sixHours.click()
    await expect(sixHours).toHaveAttribute('aria-pressed', 'true')
    await expect(oneHour).toHaveAttribute('aria-pressed', 'false')

    await day.click()
    await expect(day).toHaveAttribute('aria-pressed', 'true')

    // Charts render actual SVG series for the selected range.
    await expect
      .poll(async () => page.locator('[data-testid="history-section"] svg.recharts-surface').count(), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
  })

  test('history data persists across a page reload', async ({ page }) => {
    await waitForDashboard(page)
    await page.getByTestId('history-section').scrollIntoViewIfNeeded()

    const chartCount = await page.locator('[data-testid="history-section"] svg.recharts-surface').count()
    expect(chartCount).toBeGreaterThan(0)

    await page.reload()
    await expect(page.getByTestId('history-section')).toBeVisible()

    // The backend keeps history in SQLite, so charts are populated immediately.
    await expect
      .poll(async () => page.locator('[data-testid="history-section"] svg.recharts-surface').count(), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
  })

  test('the theme can be switched and survives a reload', async ({ page }) => {
    await waitForDashboard(page)

    await page.getByRole('button', { name: /light/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})
