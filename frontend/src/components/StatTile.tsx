/**
 * Small layout primitives shared by the tiles and cards.
 *
 * `Tile` is a card with a label header (and an optional right-aligned reading),
 * `KeyValue` is a dense label/value row for secondary facts, and `Stat` is a
 * compact label-over-value block used in the GPU secondary row.
 *
 * All three keep numbers aligned (`lw-num`) and pass a `title` through so the
 * full value is available when the layout truncates.
 */

import type { ReactNode } from 'react'

/* -------------------------------------------------------------------------- */
/* Tile                                                                       */
/* -------------------------------------------------------------------------- */

export interface TileProps {
  label: string
  /** Reading shown at the right edge of the header row. */
  right?: ReactNode
  children?: ReactNode
  className?: string
}

export function Tile({ label, right, children, className }: TileProps) {
  return (
    <section className={`lw-card flex flex-col p-3.5 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="lw-label">{label}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* KeyValue                                                                   */
/* -------------------------------------------------------------------------- */

export interface KeyValueProps {
  label: string
  value: ReactNode
  /** Tooltip for a truncated value. */
  title?: string
  /** Set false for word values such as "Enabled". Defaults to true. */
  mono?: boolean
  className?: string
}

export function KeyValue({ label, value, title, mono = true, className }: KeyValueProps) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-xs ${className ?? ''}`}>
      <dt className="shrink-0 text-faint">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-muted ${mono ? 'lw-num' : ''}`} title={title}>
        {value}
      </dd>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Stat                                                                       */
/* -------------------------------------------------------------------------- */

export interface StatProps {
  label: string
  value: ReactNode
  /** Muted suffix or qualifier, e.g. the power limit. */
  hint?: ReactNode
  /** Colour class for the value, e.g. `text-warn`. */
  valueClassName?: string
  className?: string
}

export function Stat({ label, value, hint, valueClassName, className }: StatProps) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className ?? ''}`}>
      <span className="lw-label">{label}</span>
      <span className={`lw-num truncate text-sm text-ink ${valueClassName ?? ''}`}>{value}</span>
      {hint ? <span className="lw-num truncate text-[11px] text-faint">{hint}</span> : null}
    </div>
  )
}
