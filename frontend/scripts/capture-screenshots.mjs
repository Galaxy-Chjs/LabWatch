/**
 * Capture documentation screenshots from a running LabWatch instance.
 *
 * Writes PNGs into `docs/images/`. Run it with the frontend served (dev server
 * or the production build) after starting a backend, so history charts are
 * populated:
 *
 *   # terminal 1 - backend (demo data or real hardware)
 *   cd backend && LABWATCH_DEMO_MODE=true uvicorn app.main:app --port 8012
 *   # terminal 2 - dev server proxying to it
 *   cd frontend && LABWATCH_API_TARGET=http://127.0.0.1:8012 node scripts/dev-server.mjs --port 5300
 *   # terminal 3 - capture
 *   cd frontend && node scripts/capture-screenshots.mjs --url http://127.0.0.1:5300
 *
 * Flags:
 *   --url <base>      dashboard URL (default http://127.0.0.1:5300)
 *   --out <dir>       output directory (default ../docs/images)
 *   --suffix <text>   appended to every file name, e.g. "-real"
 *   --only <names>    comma separated subset, e.g. hero,gpu-cards
 */

import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))

function flag(name, fallback) {
  const args = process.argv.slice(2)
  const index = args.indexOf(`--${name}`)
  if (index !== -1 && args[index + 1]) return args[index + 1]
  const inline = args.find((arg) => arg.startsWith(`--${name}=`))
  return inline ? inline.slice(name.length + 3) : fallback
}

const url = flag('url', 'http://127.0.0.1:5300')
// This script lives in <repo>/frontend/scripts, so the repository root is two
// levels up from it. Both the default and a caller-supplied relative path are
// resolved against the repository root, never the current working directory.
const repoRoot = resolve(here, '..', '..')
const outDir = resolve(repoRoot, flag('out', join('docs', 'images')))
const suffix = flag('suffix', '')
const only = flag('only', '')

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1680, height: 1050 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()

/** Wait until live data has replaced the loading skeleton. */
async function openDashboard() {
  await page.goto(url, { waitUntil: 'networkidle' })
  // Use the section test id, not a heading matcher: chart titles such as
  // "Host utilisation" also match a loose /host/i pattern.
  await page.getByTestId('host-section').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('gpu-section').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1_500)
}

async function viewport(name) {
  if (only && !only.split(',').includes(name)) return
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  const file = join(outDir, `${name}${suffix}.png`)
  await page.screenshot({ path: file })
  console.log(`captured ${file}`)
}

async function section(name, selector) {
  if (only && !only.split(',').includes(name)) return
  const element = page.locator(selector)
  await element.scrollIntoViewIfNeeded()
  // Park the pointer off any chart before capturing, otherwise a hover tooltip
  // is burned into the image.
  await page.mouse.move(4, 4)
  await page.waitForTimeout(500)
  const file = join(outDir, `${name}${suffix}.png`)
  await element.screenshot({ path: file })
  console.log(`captured ${file}`)
}

/** Report anything the browser complained about; a dark screenshot is not proof of health. */
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))

await openDashboard()
await viewport('hero')
await section('host-overview', '[data-testid="host-section"]')
await section('gpu-cards', '[data-testid="gpu-section"]')
await section('process-table', '[data-testid="process-section"]')

for (const [label, name] of [
  ['1H', 'history-1h'],
  ['6H', 'history-6h'],
  ['24H', 'history-24h'],
]) {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(1_000)
  await section(name, '[data-testid="history-section"]')
}

// Light theme.
await page.getByRole('button', { name: /light/i }).click()
await page.waitForTimeout(700)
await viewport('hero-light')
await section('gpu-cards-light', '[data-testid="gpu-section"]')

// Sanity checks that make the capture trustworthy.
const gpuCards = await page.locator('[data-testid^="gpu-card-"]').count()
const processRows = await page.locator('[data-testid="process-row"]').count()
const charts = await page.locator('[data-testid="history-section"] svg.recharts-surface').count()
const skeleton = await page.getByRole('status').count()
const alerts = await page.getByRole('alert').count()

console.log('--- capture summary ---')
console.log(`gpu cards:        ${gpuCards}`)
console.log(`process rows:     ${processRows}`)
console.log(`history charts:   ${charts}`)
console.log(`loading states:   ${skeleton}`)
console.log(`error banners:    ${alerts}`)
console.log(`console errors:   ${consoleErrors.length}`)
for (const error of consoleErrors.slice(0, 10)) console.log(`  ! ${error}`)

await browser.close()

if (consoleErrors.length > 0 || alerts > 0) {
  process.exitCode = 1
}
