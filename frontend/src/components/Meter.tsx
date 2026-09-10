/**
 * Thin utilisation meter.
 *
 * The numeric value is always rendered as text next to the meter, so the bar is
 * decorative (`aria-hidden`). A missing value renders an empty track rather than
 * an implied zero.
 */

import { bgColorForLevel, levelForPercent } from '../lib/format'
import type { StatusLevel } from '../lib/format'

export interface MeterProps {
  /** 0–100. Anything else (null/NaN) renders an empty track. */
  percent: number | null | undefined
  /** Override the derived status level (e.g. temperatures use their own scale). */
  level?: StatusLevel
  className?: string
}

export function Meter({ percent, level, className }: MeterProps) {
  const known = percent !== null && percent !== undefined && Number.isFinite(percent)
  const width = known ? Math.max(0, Math.min(100, percent)) : 0
  const resolved = level ?? levelForPercent(percent)

  return (
    <div
      aria-hidden="true"
      data-testid="meter-track"
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-3 ${className ?? ''}`}
    >
      <div
        data-testid="meter-fill"
        className={`h-full rounded-full ${known ? bgColorForLevel(resolved) : 'bg-transparent'}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
