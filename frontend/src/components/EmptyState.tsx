/**
 * Calm empty / unavailable panel.
 *
 * Used when a subsystem reports "nothing to show" — a driver that is not
 * present, a host with no processes, a collection that has not arrived. It is
 * intentionally neutral: an unavailable GPU is not an error, and a bright red
 * banner would overstate it.
 */

import type { ReactNode } from 'react'

import { IconAlert } from './Icons'

export interface EmptyStateProps {
  title: string
  /** Optional monospace detail (the raw driver message, for example). */
  detail?: string | null
  /** Muted guidance explaining what still works. */
  hint?: ReactNode
  icon?: ReactNode
  className?: string
}

export function EmptyState({ title, detail, hint, icon, className }: EmptyStateProps) {
  return (
    <div
      className={`lw-card flex flex-col items-center gap-2 px-6 py-10 text-center ${className ?? ''}`}
    >
      <span className="text-faint">{icon ?? <IconAlert size={20} />}</span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {detail ? <p className="max-w-xl break-words font-mono text-xs text-faint">{detail}</p> : null}
      {hint ? <p className="max-w-xl text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
