/**
 * Custom Recharts tooltip.
 *
 * The default tooltip is a white box that fights the dark theme, so this one is
 * re-styled with the theme tokens. It reads only the fields it needs, which
 * keeps it decoupled from Recharts' internal payload type.
 */

import { formatDateTime, NA } from '../../lib/format'

interface TooltipEntry {
  dataKey?: string | number
  name?: string | number
  value?: number | string | null
  color?: string
  stroke?: string
}

export interface ChartTooltipProps {
  active?: boolean
  payload?: readonly TooltipEntry[]
  label?: string | number
  /** Render one value; defaults to one decimal place. */
  formatValue?: (value: number) => string
}

export function ChartTooltip({ active, payload, label, formatValue }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div
      className="rounded-lg border px-2.5 py-1.5 text-xs"
      style={{ background: 'var(--lw-surface-2)', borderColor: 'var(--lw-line)' }}
    >
      <div className="mb-1 text-[11px] text-faint lw-num">
        {typeof label === 'number' ? formatDateTime(label) : (label ?? NA)}
      </div>
      <ul className="flex flex-col gap-0.5">
        {payload.map((entry) => {
          const value = typeof entry.value === 'number' ? entry.value : Number(entry.value)
          const text = Number.isFinite(value)
            ? (formatValue?.(value) ?? value.toFixed(1))
            : NA
          return (
            <li
              key={String(entry.dataKey ?? entry.name)}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-1.5 text-muted">
                <span
                  aria-hidden="true"
                  className="h-0.5 w-3 rounded-full"
                  style={{ background: entry.color ?? entry.stroke ?? 'var(--lw-text-faint)' }}
                />
                {String(entry.name ?? entry.dataKey ?? NA)}
              </span>
              <span className="text-ink lw-num">{text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
