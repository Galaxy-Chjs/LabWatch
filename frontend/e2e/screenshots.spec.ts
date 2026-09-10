import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

/**
 * Screenshot automation for the README, release notes and project report.
 *
 * Start an instance first, then point the script at it:
 *
 *   # demo data (or real hardware)
 *   cd backend && LABWATCH_DEMO_MODE=true uvicorn app.main:app --port 8012
 *   cd frontend && LABWATCH_URL=http://127.0.0.1:8012 npx playwright test e2e/screenshots.spec.ts
 *
 * Output lands in ../docs/images. Use LABWATCH_SHOT_SUFFIX to keep the demo and
 * real-hardware captures apart (e.g. `-real`).
 */

const TARGET_URL = process.env.LABWATCH_URL
const OUTPUT_DIR = process.env.LABWATCH_SHOT_DIR ?? join(process.cwd(), '..', 'docs', 'images')
const SUFFIX = process.env.LABWATCH_SHOT_SUFFIX ?? ''

// Screenshots are an explicit, manually triggered job: they must not run during
// the normal E2E pass, because they need a pre-populated history database.
test.skip(!TARGET_URL, 'Set LABWATCH_URL to capture screenshots from a running instance')

test.use({ viewport: { width: 1680, height: 1050 } })

/** Wait for live data, not the loading skeleton. */
async function openDashboard(page: Page): Promise<void> {
  await page.goto(TARGET_URL as string)
  await expect(page.getByTestId('host-section')).toBeVisible()
  await expect(page.getByTestId('gpu-section')).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
  // Let the charts finish laying out.
  await page.waitForTimeout(1_500)
}

async function fullPageShot(page: Page, name: string): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const file = join(OUTPUT_DIR, `${name}${SUFFIX}.png`)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await page.screenshot({ path: file })
  console.log(`captured ${file}`)
}

async function sectionShot(page: Page, name: string, selector: string): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const file = join(OUTPUT_DIR, `${name}${SUFFIX}.png`)
  const element = page.locator(selector)
  await element.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await element.screenshot({ path: file })
  console.log(`captured ${file}`)
}

test.describe('documentation screenshots', () => {
  test('hero and section captures', async ({ page }) => {
    await openDashboard(page)

    // Hero: the top of the page - header, host tiles and the GPU cards.
    await fullPageShot(page, 'hero')

    await sectionShot(page, 'host-overview', '[data-testid="host-section"]')
    await sectionShot(page, 'gpu-cards', '[data-testid="gpu-section"]')
    await sectionShot(page, 'process-table', '[data-testid="process-section"]')
    await sectionShot(page, 'history', '[data-testid="history-section"]')
  })

  test('history range captures', async ({ page }) => {
    await openDashboard(page)
    for (const [label, name] of [
      ['1H', 'history-1h'],
      ['6H', 'history-6h'],
      ['24H', 'history-24h'],
    ] as const) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.waitForTimeout(1_000)
      await sectionShot(page, name, '[data-testid="history-section"]')
    }
  })

  test('light theme capture', async ({ page }) => {
    await openDashboard(page)
    await page.getByRole('button', { name: /light/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.waitForTimeout(700)
    await fullPageShot(page, 'hero-light')
    await sectionShot(page, 'gpu-cards-light', '[data-testid="gpu-section"]')
    // Leave the instance in its default state for subsequent runs.
    await page.getByRole('button', { name: /dark/i }).click()
  })
})
