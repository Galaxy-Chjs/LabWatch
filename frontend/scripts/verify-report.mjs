/**
 * Verify the bilingual project report in a real browser.
 *
 * Serves nothing itself: point it at a server that hosts `docs/`.
 *
 *   cd docs && python -m http.server 8090
 *   cd frontend && node scripts/verify-report.mjs --url http://127.0.0.1:8090/PROJECT_REPORT.html
 */

import { chromium } from '@playwright/test'

function flag(name, fallback) {
  const args = process.argv.slice(2)
  const index = args.indexOf(`--${name}`)
  if (index !== -1 && args[index + 1]) return args[index + 1]
  const inline = args.find((arg) => arg.startsWith(`--${name}=`))
  return inline ? inline.slice(name.length + 3) : fallback
}

const url = flag('url', 'http://127.0.0.1:8090/PROJECT_REPORT.html')
const shotDir = flag('shots', '')

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } })
const page = await context.newPage()

const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

const failures = []
function check(label, condition) {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}`)
  if (!condition) failures.push(label)
}

await page.goto(url, { waitUntil: 'networkidle' })

const enButton = page.locator('#lang-en')
const zhButton = page.locator('#lang-zh')

// ---- default state: English ------------------------------------------------
check('html starts in English', (await page.locator('html').getAttribute('data-lang')) === 'en')
check('English heading visible', await page.getByText('What was built', { exact: false }).first().isVisible())
check('Chinese heading hidden by default', !(await page.getByText('构建内容', { exact: false }).first().isVisible()))
check('English button pressed', (await enButton.getAttribute('aria-pressed')) === 'true')

// Images must actually load, not just exist on disk.
const brokenImages = await page.evaluate(() =>
  Array.from(document.images)
    .filter((img) => !img.complete || img.naturalWidth === 0)
    .map((img) => img.getAttribute('src')),
)
check(`all ${await page.locator('img').count()} images loaded`, brokenImages.length === 0)
if (brokenImages.length) console.log('       broken:', brokenImages.join(', '))

if (shotDir) {
  await page.screenshot({ path: `${shotDir}/report-en.png`, fullPage: false })
}

// ---- switch to Chinese ----------------------------------------------------
await zhButton.click()
await page.waitForTimeout(300)

check('html switched to Chinese', (await page.locator('html').getAttribute('data-lang')) === 'zh')
check('html lang attribute updated', (await page.locator('html').getAttribute('lang')) === 'zh-CN')
check('Chinese heading visible', await page.getByText('构建内容', { exact: false }).first().isVisible())
check('English heading hidden', !(await page.getByText('What was built', { exact: false }).first().isVisible()))
check('Chinese button pressed', (await zhButton.getAttribute('aria-pressed')) === 'true')
check('English button released', (await enButton.getAttribute('aria-pressed')) === 'false')

// Spot-check translated content in several sections.
for (const snippet of ['单机 · 多卡', '已实现的功能', '发布就绪度', '开发过程中发现并修复的缺陷', '已知限制', '仓库整洁度']) {
  check(`Chinese text present: ${snippet}`, await page.getByText(snippet, { exact: false }).first().isVisible())
}

// Tables must have swapped, not duplicated.
const visibleTables = await page.evaluate(() =>
  Array.from(document.querySelectorAll('table')).filter((t) => t.offsetParent !== null).length,
)
const totalTables = await page.locator('table').count()
check(`only one language of each table renders (${visibleTables} of ${totalTables} visible)`, visibleTables * 2 === totalTables)

if (shotDir) {
  await page.screenshot({ path: `${shotDir}/report-zh.png`, fullPage: false })
}

// ---- persistence across reload -------------------------------------------
await page.reload({ waitUntil: 'networkidle' })
check('language choice survives a reload', (await page.locator('html').getAttribute('data-lang')) === 'zh')
check('no flash: Chinese already active before clicking', await page.getByText('构建内容', { exact: false }).first().isVisible())

check('no console or page errors', errors.length === 0)
if (errors.length) for (const error of errors.slice(0, 5)) console.log(`       ! ${error}`)

await browser.close()

console.log(failures.length === 0 ? '\nREPORT OK' : `\nREPORT FAILED (${failures.length})`)
process.exitCode = failures.length === 0 ? 0 : 1
