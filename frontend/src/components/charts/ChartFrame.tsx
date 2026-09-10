/**
 * Chart container: label, optional sample count, and exactly one body state.
 *
 * A chart never renders an empty frame. Loading, failure and "no samples yet"
 * are distinct states with their own copy, and the failure state offers a retry
 * so the operator does not have to reload the page.
 */

import type { ReactNode } from 'react'

import { LoadingState } from '../LoadingState'

export interface ChartFrameProps {
  title: string
  meta?: ReactNode
  isLoading: boolean
  error?: Error
  /** True when the series carries no points. */
  isEmpty: boolean
  onRetry: () => void
  className?: string
  children: ReactNode
}

const BODY_HEIGHT = 'h-[150px]'

export function ChartFrame({
  title,
  meta,
  isLoading,
  error,
  isEmpty,
  onRetry,
  className,
  children,
}: ChartFrameProps) {
  return (
    <section className={`lw-card flex flex-col gap-1.5 p-3.5 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="lw-label">{title}</h3>
        {meta ? <span className="text-[11px] text-faint lw-num">{meta}</span> : null}
      </div>

      {error ? (
        <div className={`${BODY_HEIGHT} flex flex-col items-center justify-center gap-2 text-center`}>
          <p className="max-w-md break-words text-xs text-muted">{error.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className={`${BODY_HEIGHT} flex items-center justify-center`}>
          <LoadingState label="Loading history…" />
        </div>
      ) : isEmpty ? (
        <div className={`${BODY_HEIGHT} flex items-center justify-center px-6`}>
          <p className="text-center text-xs text-faint">
            No history yet — samples are recorded every 10 seconds.
          </p>
        </div>
      ) : (
        children
      )}
    </section>
  )
}
