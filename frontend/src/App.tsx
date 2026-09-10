/**
 * LabWatch dashboard shell.
 *
 * Layout, top-to-bottom:
 *   - header: identity, hostname, uptime, last update, connection state
 *   - host overview: CPU / RAM / Disk / System tiles
 *   - GPUs: one card per device (the visual centre of the page)
 *   - GPU processes: sortable, filterable table
 *   - history: 1h / 6h / 24h charts for host and GPUs
 */

import { ErrorBanner } from './components/ErrorBanner'
import { GpuSection } from './components/GpuSection'
import { HistorySection } from './components/HistorySection'
import { HostSection } from './components/HostSection'
import { ProcessSection } from './components/ProcessSection'
import { Header } from './components/Header'
import { LoadingState } from './components/LoadingState'
import { useLiveMetrics } from './hooks/useMetrics'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const { preference, setPreference, resolved } = useTheme()
  const { overview, error, isInitialLoading, lastUpdated, refresh, isStale } = useLiveMetrics(2)

  const pollInterval = overview?.poll_interval ?? 2

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Header
        overview={overview}
        lastUpdated={lastUpdated}
        isStale={isStale}
        onRefresh={refresh}
        themePreference={preference}
        resolvedTheme={resolved}
        onThemeChange={setPreference}
      />

      <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        {error ? (
          <ErrorBanner
            title="Cannot load live metrics"
            message={error.message}
            onRetry={refresh}
            className="mb-4"
          />
        ) : null}

        {isInitialLoading ? (
          <LoadingState label="Connecting to LabWatch…" />
        ) : (
          <div className="flex flex-col gap-6">
            <HostSection system={overview?.system} />
            <GpuSection collection={overview?.gpus} />
            <ProcessSection collection={overview?.processes} />
            <HistorySection pollInterval={pollInterval} />
          </div>
        )}
      </main>

      <footer className="border-t border-line px-4 py-6 text-center text-xs text-faint sm:px-6 lg:px-8">
        LabWatch Lite · read-only monitoring ·{' '}
        <span className="lw-num">{pollInterval}s</span> refresh
      </footer>
    </div>
  )
}
