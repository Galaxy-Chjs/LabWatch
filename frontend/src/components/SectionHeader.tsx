/**
 * Section heading: uppercase micro title, a hairline rule, and an optional
 * right-hand slot for summary metadata or controls.
 */

import type { ReactNode } from 'react'

export interface SectionHeaderProps {
  /** Rendered verbatim; pass it already uppercase (`HOST`, `GPUS`, …). */
  title: string
  /** Muted summary text shown before the controls (driver version, counts…). */
  meta?: ReactNode
  /** Controls, aligned to the right edge. */
  children?: ReactNode
  className?: string
}

export function SectionHeader({ title, meta, children, className }: SectionHeaderProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className ?? ''}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <span aria-hidden="true" className="hidden h-px flex-1 bg-line sm:block" />
      {meta ? <div className="text-xs text-faint">{meta}</div> : null}
      {children}
    </div>
  )
}
