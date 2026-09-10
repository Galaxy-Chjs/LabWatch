/**
 * Shared chart styling.
 *
 * Charts are the noisiest element on a monitoring page, so everything here is
 * deliberately quiet: hairline dashes for the grid, no axis lines, no animation,
 * 11px faint ticks. Colour is reserved for series identity, drawn from a small
 * fixed palette so six GPUs stay distinguishable without becoming a rainbow.
 */

import type { CSSProperties } from 'react'

import { formatAxisTime } from '../../lib/format'
import type { HistoryRange } from '../../types/api'

/** Fixed plot height, in pixels. */
export const CHART_HEIGHT = 190

export const CHART_MARGIN = { top: 6, right: 14, bottom: 2, left: 0 }

export const AXIS_TICK = { fill: 'var(--lw-text-faint)', fontSize: 11 }

export const LEGEND_STYLE: CSSProperties = { fontSize: 11, color: 'var(--lw-text-muted)' }

export const TOOLTIP_CURSOR = { stroke: 'var(--lw-line-strong)', strokeWidth: 1 }

/**
 * Series palette, cycled by GPU index: accent, ok, warn, violet, teal, slate.
 * The first three follow the theme so they stay legible in light and dark mode.
 */
export const SERIES_COLORS = [
  'var(--lw-accent)',
  'var(--lw-ok)',
  'var(--lw-warn)',
  '#8b5cf6',
  '#14b8a6',
  '#94a3b8',
] as const

export function colorForGpuIndex(index: number): string {
  const size = SERIES_COLORS.length
  return SERIES_COLORS[((index % size) + size) % size]
}

/** X-axis label for a timestamp, formatted for the width of the range. */
export function axisTimeLabel(timestamp: number, range: HistoryRange): string {
  return formatAxisTime(timestamp, range)
}
