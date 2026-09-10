/**
 * Formatting helpers.
 *
 * Every helper accepts `null` and returns "N/A", because a monitoring UI must
 * never imply a value it does not have.
 */

export const NA = 'N/A'

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/** Format a byte count using binary units, e.g. `38.2 GB`. */
export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return NA
  if (bytes === 0) return '0 B'
  const negative = bytes < 0
  let value = Math.abs(bytes)
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const precision = unit === 0 ? 0 : digits
  return `${negative ? '-' : ''}${value.toFixed(precision)} ${BYTE_UNITS[unit]}`
}

/** Format a percentage, e.g. `82.4%`. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  return `${value.toFixed(digits)}%`
}

/** Format a temperature, e.g. `69°C`. */
export function formatTemperature(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  return `${Math.round(value)}°C`
}

/** Format a power reading, e.g. `392 W`. */
export function formatWatts(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  return `${value.toFixed(digits)} W`
}

/** Format `used / total` for memory-like pairs, e.g. `38.2 / 48.0 GB`. */
export function formatBytesPair(
  used: number | null | undefined,
  total: number | null | undefined,
  digits = 1,
): string {
  const usedText = formatBytes(used, digits)
  const totalText = formatBytes(total, digits)
  if (usedText === NA && totalText === NA) return NA
  return `${usedText} / ${totalText}`
}

/** Format a duration in seconds compactly, e.g. `5d 14h` or `03:42:18`. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return NA
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const secs = total % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

/** Format a runtime as a clock, e.g. `03:42:18`. */
export function formatRuntime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return NA
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const secs = total % 60
  const clock = [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':')
  return days > 0 ? `${days}d ${clock}` : clock
}

/** Format a wall-clock time as `HH:MM:SS`. */
export function formatClock(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return NA
  return new Date(timestamp * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** Format a timestamp as a short axis label appropriate for the range width. */
export function formatAxisTime(timestamp: number, range: string): string {
  const date = new Date(timestamp * 1000)
  if (range === '24h') {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** Format an absolute timestamp for tooltips. */
export function formatDateTime(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return NA
  return new Date(timestamp * 1000).toLocaleString(undefined, { hour12: false })
}

/** Relative "x ago" description, e.g. `8s ago`. */
export function formatAgo(timestamp: number | null | undefined, now = Date.now() / 1000): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return NA
  const delta = Math.max(0, now - timestamp)
  if (delta < 1) return 'just now'
  if (delta < 60) return `${Math.floor(delta)}s ago`
  if (delta < 3_600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86_400) return `${Math.floor(delta / 3_600)}h ago`
  return `${Math.floor(delta / 86_400)}d ago`
}

/* -------------------------------------------------------------------------- */
/* Status levels                                                              */
/* -------------------------------------------------------------------------- */

export type StatusLevel = 'ok' | 'warn' | 'crit' | 'idle'

/**
 * Map a utilisation-style percentage to a status level.
 *
 * Thresholds are deliberately conservative: a GPU sitting at 90% VRAM is about
 * to OOM, and a disk at 90% needs attention.
 */
export function levelForPercent(
  value: number | null | undefined,
  warn = 80,
  crit = 92,
): StatusLevel {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'idle'
  if (value >= crit) return 'crit'
  if (value >= warn) return 'warn'
  if (value <= 0) return 'idle'
  return 'ok'
}

/** Map a temperature in Celsius to a status level. */
export function levelForTemperature(value: number | null | undefined): StatusLevel {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'idle'
  if (value >= 85) return 'crit'
  if (value >= 75) return 'warn'
  return 'ok'
}

/** Tailwind text colour class for a status level. */
export function textColorForLevel(level: StatusLevel): string {
  switch (level) {
    case 'ok':
      return 'text-ok'
    case 'warn':
      return 'text-warn'
    case 'crit':
      return 'text-crit'
    default:
      return 'text-muted'
  }
}

/** Raw CSS colour for a status level, for chart strokes. */
export function cssColorForLevel(level: StatusLevel): string {
  return `var(--lw-${level})`
}

/** Tailwind background class for a status level. */
export function bgColorForLevel(level: StatusLevel): string {
  switch (level) {
    case 'ok':
      return 'bg-ok'
    case 'warn':
      return 'bg-warn'
    case 'crit':
      return 'bg-crit'
    default:
      return 'bg-idle'
  }
}

/** Truncate a long command line for table display. */
export function truncate(text: string | null | undefined, max = 64): string {
  if (!text) return NA
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
