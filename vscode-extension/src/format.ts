/**
 * Pure formatting and status helpers.
 *
 * Deliberately free of any `vscode` import: everything here runs under plain Node
 * and is unit tested, because a status bar that formats nonsense is worse than no
 * status bar at all.
 */

export interface GpuInfo {
  index: number
  name: string | null
  utilization_percent: number | null
  memory_used: number | null
  memory_total: number | null
  memory_percent: number | null
  temperature_c: number | null
  power_watts: number | null
  process_count: number | null
  busy: boolean
}

export interface LabwatchStatus {
  running: boolean
  url: string | null
  pid: number | null
  uptime_seconds: number | null
  version: string | null
  hostname: string | null
  demo: boolean
  gpu_available: boolean
  gpu_error: string | null
  driver_version: string | null
  cuda_version: string | null
  gpu_count: number
  busy_count: number
  free_count: number
  cpu_percent: number | null
  memory_percent: number | null
  process_count: number
  gpus: GpuInfo[]
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/** Format a byte count using binary units, e.g. `33.0 GB`. */
export function formatBytes(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  if (value === 0) return '0 B'
  let size = Math.abs(value)
  let unit = 0
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : digits)} ${BYTE_UNITS[unit]}`
}

/** Format an optional percentage, e.g. `82.4%`. */
export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  return `${value.toFixed(digits)}%`
}

/** Format a temperature, e.g. `68°C`. */
export function formatTemperature(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  return `${Math.round(value)}°C`
}

/** Format a duration in seconds compactly. */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return 'N/A'
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * The status bar text.
 *
 * Two shapes, chosen by how many GPUs there are: a single GPU fits its own
 * numbers, several are summarised. `$(...)` prefixes are VS Code codicon syntax
 * and are interpreted by the editor, not by us.
 */
export function statusBarText(status: LabwatchStatus | null, stale = false): string {
  if (status === null || !status.running) {
    return '$(server) LabWatch: not running'
  }
  if (status.demo) {
    return `$(beaker) LabWatch: demo · ${status.gpu_count} GPUs`
  }
  if (!status.gpu_available) {
    return '$(warning) LabWatch: no GPU'
  }
  if (status.gpu_count === 0) {
    return '$(server) LabWatch: API up'
  }

  const suffix = stale ? ' (stale)' : ''
  if (status.gpu_count === 1) {
    const gpu = status.gpus[0]
    return `$(pulse) GPU ${formatPercent(gpu.utilization_percent)} · ${formatBytes(gpu.memory_used)}/${formatBytes(gpu.memory_total)}${suffix}`
  }
  return `$(pulse) GPU ${status.busy_count} busy / ${status.gpu_count}${suffix}`
}

/** Tooltip shown when hovering the status bar item; multi-line Markdown. */
export function statusBarTooltip(status: LabwatchStatus | null): string {
  if (status === null || !status.running) {
    return ['**LabWatch** is not running.', '', 'Start it with `labwatch start`, or run the Start command.'].join('\n')
  }

  const lines: string[] = [`**LabWatch ${status.version ?? ''}**`.trim()]
  if (status.hostname) lines.push(`${status.hostname}${status.demo ? '  ·  demo data' : ''}`)
  if (status.driver_version) lines.push(`driver ${status.driver_version}${status.cuda_version ? ` · CUDA ${status.cuda_version}` : ''}`)
  lines.push('')

  if (!status.gpu_available) {
    lines.push(`No NVIDIA GPU: ${status.gpu_error ?? 'unknown reason'}`)
  } else {
    lines.push(`${status.busy_count} busy / ${status.gpu_count} GPUs  ·  ${status.free_count} free`)
    lines.push('')
    for (const gpu of status.gpus) {
      lines.push(
        `GPU ${gpu.index}  ${formatPercent(gpu.utilization_percent)}  ` +
          `${formatBytes(gpu.memory_used)}/${formatBytes(gpu.memory_total)}  ${formatTemperature(gpu.temperature_c)}`,
      )
    }
  }

  if (status.cpu_percent !== null || status.memory_percent !== null) {
    lines.push('')
    lines.push(`CPU ${formatPercent(status.cpu_percent)} · RAM ${formatPercent(status.memory_percent)} · ${status.process_count} processes`)
  }
  if (status.url) {
    lines.push('')
    lines.push(status.url)
  }
  return lines.join('\n')
}

/** One GPU as three sidebar lines: the glanceable subset. */
export function gpuCardLines(gpu: GpuInfo): [string, string, string] {
  return [
    formatPercent(gpu.utilization_percent),
    `${formatBytes(gpu.memory_used)} / ${formatBytes(gpu.memory_total)}`,
    formatTemperature(gpu.temperature_c),
  ]
}

/** One-line description for a GPU tree item. */
export function gpuDescription(gpu: GpuInfo): string {
  const parts = [
    formatPercent(gpu.utilization_percent),
    `${formatBytes(gpu.memory_used)} / ${formatBytes(gpu.memory_total)}`,
    formatTemperature(gpu.temperature_c),
  ]
  return parts.join(' · ')
}

/** Theme icon for a GPU, so state is readable without reading numbers. */
export function gpuIcon(gpu: GpuInfo): string {
  return gpu.busy ? 'flame' : 'circle-outline'
}

/** Parse CLI JSON defensively: a partial payload must not crash the sidebar. */
export function parseStatus(raw: string): LabwatchStatus | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  // An array or a primitive is not a status payload; treating a bare `[]` as a
  // valid snapshot would show "not running" for what is actually a broken call.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>

  const gpus: GpuInfo[] = Array.isArray(record.gpus)
    ? (record.gpus as unknown[]).filter(isRecord).map((entry) => ({
        index: number(entry.index) ?? 0,
        name: text(entry.name),
        utilization_percent: number(entry.utilization_percent),
        memory_used: number(entry.memory_used),
        memory_total: number(entry.memory_total),
        memory_percent: number(entry.memory_percent),
        temperature_c: number(entry.temperature_c),
        power_watts: number(entry.power_watts),
        process_count: number(entry.process_count),
        busy: entry.busy === true,
      }))
    : []

  return {
    running: record.running === true,
    url: text(record.url),
    pid: number(record.pid),
    uptime_seconds: number(record.uptime_seconds),
    version: text(record.version),
    hostname: text(record.hostname),
    demo: record.demo === true,
    gpu_available: record.gpu_available === true,
    gpu_error: text(record.gpu_error),
    driver_version: text(record.driver_version),
    cuda_version: text(record.cuda_version),
    gpu_count: number(record.gpu_count) ?? gpus.length,
    busy_count: number(record.busy_count) ?? gpus.filter((gpu) => gpu.busy).length,
    free_count: number(record.free_count) ?? gpus.filter((gpu) => !gpu.busy).length,
    cpu_percent: number(record.cpu_percent),
    memory_percent: number(record.memory_percent),
    process_count: number(record.process_count) ?? 0,
    gpus,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
