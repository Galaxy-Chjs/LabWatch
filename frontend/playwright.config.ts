import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end configuration.
 *
 * The suite runs against a real FastAPI backend in demo mode plus the Vite dev
 * server, so `npm run e2e` works on any machine - no NVIDIA GPU and no
 * pre-built bundle required.
 */

const BACKEND_PORT = Number(process.env.LABWATCH_E2E_BACKEND_PORT ?? 8010)
const FRONTEND_PORT = Number(process.env.LABWATCH_E2E_FRONTEND_PORT ?? 5273)
const PYTHON =
  process.env.LABWATCH_E2E_PYTHON ??
  (process.platform === 'win32' ? '..\\backend\\.venv\\Scripts\\python.exe' : 'python3')

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
      command: `${PYTHON} -m uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}`,
      cwd: '../backend',
      url: `http://127.0.0.1:${BACKEND_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        LABWATCH_DEMO_MODE: 'true',
        LABWATCH_HISTORY_INTERVAL: '2',
        LABWATCH_POLL_INTERVAL: '1',
        LABWATCH_LOG_LEVEL: 'WARNING',
        LABWATCH_ENABLE_BACKGROUND_COLLECTOR: 'true',
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
