/**
 * A calm error strip.
 *
 * Monitoring failures are usually transient and rarely the operator's fault, so
 * this stays readable: a restrained critical tint, a small inline icon, the
 * reason, and a retry affordance rather than a wall of red.
 */

import { IconAlert } from './Icons'

export interface ErrorBannerProps {
  title: string
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorBanner({ title, message, onRetry, className }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border border-crit/40 bg-crit/10 px-3.5 py-3 ${
        className ?? ''
      }`}
    >
      <IconAlert size={16} className="mt-0.5 shrink-0 text-crit" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-0.5 break-words text-sm text-muted">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-crit/40 px-2.5 py-1 text-xs font-medium text-crit transition-colors hover:bg-crit/10"
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}
