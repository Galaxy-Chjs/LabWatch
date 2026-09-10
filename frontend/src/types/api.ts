/**
 * API types.
 *
 * These mirror the Pydantic schemas in `backend/app/schemas.py`. Every metric a
 * host may be unable to report is `number | null` and renders as "N/A".
 */

export type HistoryRange = '1h' | '6h' | '24h'

export const HISTORY_RANGES: readonly HistoryRange[] = ['1h', '6h', '24h'] as const

/* -------------------------------------------------------------------------- */
/* System                                                                     */
/* -------------------------------------------------------------------------- */

export interface CpuInfo {
  usage_percent: number | null
  physical_cores: number | null
  logical_cores: number | null
  frequency_mhz: number | null
  load_average: [number, number, number] | null
  per_core_percent: number[]
}

export interface MemoryInfo {
  total: number | null
  used: number | null
  available: number | null
  percent: number | null
}

export interface DiskInfo {
  device: string
  mountpoint: string
  fstype: string | null
  total: number | null
  used: number | null
  free: number | null
  percent: number | null
  is_primary: boolean
}

export interface HostInfo {
  hostname: string
  os: string
  kernel: string
  platform: string
  boot_time: number | null
}

export interface SystemStatus {
  host: HostInfo
  uptime_seconds: number | null
  uptime_human: string | null
  cpu: CpuInfo
  memory: MemoryInfo
  disks: DiskInfo[]
  collected_at: number
  demo: boolean
}

/* -------------------------------------------------------------------------- */
/* GPU                                                                        */
/* -------------------------------------------------------------------------- */

export interface GpuStatus {
  index: number
  uuid: string | null
  name: string | null
  utilization_percent: number | null
  memory_used: number | null
  memory_total: number | null
  memory_percent: number | null
  temperature_c: number | null
  power_watts: number | null
  power_limit_watts: number | null
  power_percent: number | null
  fan_percent: number | null
  clocks_sm_mhz: number | null
  clocks_mem_mhz: number | null
  persistence_mode: boolean | null
  process_count: number | null
  collected_at: number
}

export interface GpuCollection {
  available: boolean
  driver_version: string | null
  cuda_version: string | null
  nvml_version: string | null
  error: string | null
  gpus: GpuStatus[]
  collected_at: number
  demo: boolean
}

export interface GpuProcess {
  pid: number
  gpu_index: number
  gpu_uuid: string | null
  gpu_memory: number | null
  name: string | null
  command: string | null
  username: string | null
  cpu_percent: number | null
  memory_rss: number | null
  status: string | null
  start_time: number | null
  runtime_seconds: number | null
  runtime_human: string | null
  type: string | null
}

export interface ProcessCollection {
  available: boolean
  error: string | null
  processes: GpuProcess[]
  collected_at: number
  demo: boolean
}

export interface Overview {
  system: SystemStatus
  gpus: GpuCollection
  processes: ProcessCollection
  poll_interval: number
  generated_at: number
}

/* -------------------------------------------------------------------------- */
/* History                                                                    */
/* -------------------------------------------------------------------------- */

export interface SystemHistoryPoint {
  timestamp: number
  cpu_percent: number | null
  memory_used: number | null
  memory_total: number | null
  memory_percent: number | null
  disk_used: number | null
  disk_total: number | null
  disk_percent: number | null
}

export interface GpuHistoryPoint {
  timestamp: number
  gpu_index: number
  utilization: number | null
  memory_used: number | null
  memory_total: number | null
  memory_percent: number | null
  temperature: number | null
  power_usage: number | null
  power_limit: number | null
}

export interface SystemHistory {
  range: HistoryRange
  start: number
  end: number
  interval_seconds: number
  points: SystemHistoryPoint[]
  demo: boolean
}

export interface GpuHistorySeries {
  gpu_index: number
  gpu_name: string | null
  points: GpuHistoryPoint[]
}

export interface GpuHistory {
  range: HistoryRange
  start: number
  end: number
  interval_seconds: number
  series: GpuHistorySeries[]
  demo: boolean
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

export interface HealthStatus {
  status: 'ok' | 'degraded'
  version: string
  uptime_seconds: number
  database: 'ok' | 'error'
  database_error: string | null
  gpu_available: boolean
  gpu_error: string | null
  gpu_count: number
  demo_mode: boolean
  collector_running: boolean
  last_history_write: number | null
}

export type ThemePreference = 'system' | 'light' | 'dark'

/** A chart row with a formatted local time label. */
export interface ChartPoint {
  time: number
  label: string
}
