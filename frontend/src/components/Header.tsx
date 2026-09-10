/**
 * Sticky dashboard header.
 *
 * Left: product mark and a dense row of host facts (hostname, OS, uptime, GPU
 * count, driver/CUDA). Right: data-source chips, the last-update indicator, the
 * connection state, a refresh action and the theme control.
 *
 * Everything degrades to `N/A` when `overview` has not arrived yet, so the bar
 * never collapses while the first poll is in flight.
 */

import type { ReactNode } from 'react'

import { formatAgo, formatClock, NA } from '../lib/format'
import type { Overview, ThemePreference } from '../types/api'
import { Chip } from './Chip'
import { IconAlert, IconLogo, IconMonitor, IconMoon, IconRefresh, IconSun } from './Icons'

export interface HeaderProps {
  overview: Overview | undefined
  lastUpdated: number | null
  isStale: boolean
  onRefresh: () => void
  themePreference: ThemePreference
  resolvedTheme: 'light' | 'dark'
  onThemeChange: (next: ThemePreference) => void
}

interface FactProps {
  label: string
  value: ReactNode
  title?: string
  /** Numbers and identifiers are mono; prose values (OS) are not. */
  mono?: boolean
}

function Fact({ label, value, title, mono = true }: FactProps) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 xl:border-l xl:border-line xl:pl-4 xl:first:border-l-0 xl:first:pl-0">
      <span className="lw-label">{label}</span>
      <span className={`truncate text-xs text-ink ${mono ? 'lw-num' : ''}`} title={title}>
        {value}
      </span>
    </div>
  )
}

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

export function Header({
  overview,
  lastUpdated,
  isStale,
  onRefresh,
  themePreference,
  resolvedTheme,
  onThemeChange,
}: HeaderProps) {
  const system = overview?.system
  const gpus = overview?.gpus
  const gpuCount = gpus ? gpus.gpus.length : null

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/95">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Identity ------------------------------------------------------- */}
        <div className="flex items-center gap-2">
          <IconLogo className="text-accent" size={20} />
          <span className="text-sm font-semibold tracking-tight text-ink">
            LabWatch<span className="ml-1 font-normal text-faint">Lite</span>
          </span>
        </div>

        <span aria-hidden="true" className="hidden h-6 w-px bg-line sm:block" />

        {/* Host facts ----------------------------------------------------- */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
          <Fact label="Host" value={system?.host.hostname ?? NA} />
          <Fact label="OS" value={system?.host.os ?? NA} title={system?.host.os} mono={false} />
          <Fact label="Uptime" value={system?.uptime_human ?? NA} />
          <Fact label="GPUs" value={gpuCount === null ? NA : String(gpuCount)} />
          {gpus?.driver_version ? (
            <Fact label="Driver" value={gpus.driver_version} title={`NVML ${gpus.nvml_version ?? NA}`} />
          ) : null}
          {gpus?.cuda_version ? <Fact label="CUDA" value={gpus.cuda_version} /> : null}
        </div>

        {/* Status and controls -------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {system?.demo ? (
            <Chip tone="warn" title="Values on this page are simulated">
              Demo Data
            </Chip>
          ) : null}

          {isStale ? (
            <Chip
              tone="warn"
              icon={<IconAlert size={13} />}
              title="The last refresh failed; showing the most recent successful sample"
            >
              Stale
            </Chip>
          ) : null}

          <div className="flex flex-col items-end leading-tight">
            <span className="lw-num text-xs text-ink" title="Time of the most recent sample">
              {formatClock(lastUpdated)}
            </span>
            <span className="text-[11px] text-faint">{formatAgo(lastUpdated)}</span>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh metrics"
            title="Refresh metrics"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:text-ink"
          >
            <IconRefresh size={15} />
          </button>

          <div
            role="group"
            aria-label="Theme"
            title={`Theme: ${themePreference} (currently ${resolvedTheme})`}
            className="inline-flex items-center rounded-md border border-line bg-surface p-0.5"
          >
            {THEME_OPTIONS.map((option) => {
              const pressed = themePreference === option.value
              const icon =
                option.value === 'system' ? (
                  <IconMonitor size={14} />
                ) : option.value === 'light' ? (
                  <IconSun size={14} />
                ) : (
                  <IconMoon size={14} />
                )
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={`${option.label} theme`}
                  onClick={() => onThemeChange(option.value)}
                  className={`inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] transition-colors ${
                    pressed
                      ? 'bg-surface-3 text-ink'
                      : 'text-faint hover:text-muted focus-visible:text-ink'
                  }`}
                >
                  {icon}
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </header>
  )
}
