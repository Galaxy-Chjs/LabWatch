import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Resolve the backend address the dev server proxies `/api` to.
 *
 * `LABWATCH_API_TARGET` is set by the Playwright config and the screenshot
 * workflow (see `scripts/dev-server.mjs`); it falls back to the default local
 * backend. Vite's CLI cannot carry extra flags, so the environment is the only
 * channel that behaves the same on Windows and POSIX.
 */
function resolveApiTarget(): string {
  return process.env.LABWATCH_API_TARGET ?? 'http://127.0.0.1:8000'
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: resolveApiTarget(),
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
})
