import { expect, type Page } from '@playwright/test'

/** Shared helpers for the LabWatch end-to-end suite. */

/** Wait until the dashboard has rendered live data (not the loading state). */
export async function waitForDashboard(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('banner')).toBeVisible()
  // Target the section containers by test id: loose heading patterns such as
  // /gpus/i also match chart titles like "GPU utilisation" and trip Playwright's
  // strict mode.
  await expect(page.getByTestId('host-section')).toBeVisible()
  await expect(page.getByTestId('gpu-section')).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
}

/** Collect console errors, ignoring unrelated browser noise. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // React DevTools notices and favicon 404s are not application errors.
    if (/favicon|React DevTools|Download the React DevTools/i.test(text)) return
    errors.push(text)
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  return errors
}
