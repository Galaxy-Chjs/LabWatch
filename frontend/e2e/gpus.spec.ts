import { expect, test } from '@playwright/test'

import { waitForDashboard } from './helpers'

test.describe('GPU information', () => {
  test('shows a card per demo GPU with live metrics', async ({ page }) => {
    await waitForDashboard(page)

    // Demo mode advertises three GPUs (two RTX 4090 and one A100).
    const cards = page.locator('[data-testid^="gpu-card-"]')
    await expect(cards).toHaveCount(3)

    const firstCard = page.getByTestId('gpu-card-0')
    await expect(firstCard).toContainText(/4090/i)
    await expect(firstCard).toContainText(/utilization/i)
    await expect(firstCard).toContainText(/vram/i)
    await expect(firstCard).toContainText(/temperature/i)
    await expect(firstCard).toContainText(/power/i)

    // Values are formatted, never raw nulls.
    await expect(firstCard).toContainText(/%/)
    await expect(firstCard).not.toContainText('NaN')
    await expect(firstCard).not.toContainText('undefined')
  })

  test('the GPU values refresh over time', async ({ page }) => {
    await waitForDashboard(page)

    const card = page.getByTestId('gpu-card-0')
    const firstReading = await card.innerText()

    // Demo metrics move smoothly with wall-clock time.
    await expect
      .poll(async () => card.innerText(), { timeout: 30_000, intervals: [1000] })
      .not.toBe(firstReading)
  })

  test('the process table lists GPU processes and supports search', async ({ page }) => {
    await waitForDashboard(page)

    const table = page.getByTestId('process-table')
    await expect(table).toBeVisible()

    const rows = table.getByTestId('process-row')
    await expect(rows).toHaveCount(3)

    // Search narrows the table down to the matching command.
    const search = page.getByLabel('Search processes')
    await search.fill('eval')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(/eval\.py/)

    // Clearing the search restores every row.
    await search.fill('')
    await expect(rows).toHaveCount(3)
  })
})
