/**
 * Static loading placeholder.
 *
 * Deliberately unanimated: a monitoring dashboard is looked at for long
 * stretches, so nothing on the page moves unless the data changed.
 */

export interface LoadingStateProps {
  label?: string
}

export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 px-6 py-10"
    >
      <div aria-hidden="true" className="flex w-full max-w-xs flex-col gap-2">
        <div className="h-2.5 w-3/4 rounded bg-surface-2 animate-none" />
        <div className="h-2.5 w-full rounded bg-surface-2 animate-none" />
        <div className="h-2.5 w-2/3 rounded bg-surface-2 animate-none" />
      </div>
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}
