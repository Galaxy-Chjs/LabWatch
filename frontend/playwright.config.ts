import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end configuration.
 *
 * The suite starts a real LabWatch server in demo mode plus the Vite dev server,
 * so `npm run e2e` works on any machine — no NVIDIA GPU and no pre-built bundle.
 *
 * The server is started through the public CLI (`python -m labwatch serve
 * --demo`), the same entry point a user gets, rather than importing the app
 * directly. That way the E2E run also exercises argument parsing and the
 * environment plumbing the CLI sets up.
 */

const BACKEND_PORT = Number(process.env.LABWATCH_E2E_BACKEND_PORT ?? 8010)
const FRONTEND_PORT = Number(process.env.LABWATCH_E2E_FRONTEND_PORT ?? 5273)

// Prefer the repository's own virtualenv when it exists, but fall back to
// whatever `python3`/`python` is on PATH so CI needs no special setup.
const PYTHON =
  process.env.LABWATCH_E2E_PYTHON ?? (process.platform === 'win32' ? '.venv-test\\Scripts\\python.exe' : 'python3')

const DATA_DIR = process.env.LABWATCH_E2E_DATA_DIR ?? '.e2e-data'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],

  webServer: [
    {
      command: `${PYTHON} -m labwatch serve --demo --no-browser --host 127.0.0.1 --port ${BACKEND_PORT} --data-dir ${DATA_DIR}`,
      cwd: '..',
      url: `http://127.0.0.1:${BACKEND_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        LABWATCH_DEMO_MODE: 'true',
        LABWATCH_HISTORY_INTERVAL: '2',
        LABWATCH_POLL_INTERVAL: '1',
        LABWATCH_LOG_LEVEL: 'WARNING',
      },
    },
    {
      // The dev server is launched through a small script rather than the Vite
      // CLI: Vite rejects unknown flags, and the proxy target has to travel via
      // the environment to work identically on Windows and POSIX.
      command: `node scripts/dev-server.mjs --port ${FRONTEND_PORT}`,
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        LABWATCH_API_TARGET: `http://127.0.0.1:${BACKEND_PORT}`,
      },
    },
  ],
})
