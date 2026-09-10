/**
 * Typed fixture factories.
 *
 * Every factory returns a complete object that satisfies `src/types/api.ts`, so
 * a schema change breaks the tests at compile time rather than at runtime.
 */

import type {
  CpuInfo,
  DiskInfo,
  GpuCollection,
  GpuHistory,
  GpuHistoryPoint,
  GpuHistorySeries,
  GpuProcess,
  GpuStatus,
  HostInfo,
  MemoryInfo,
  Overview,
  ProcessCollection,
  SystemHistory,
  SystemHistoryPoint,
  SystemStatus,
} from '../../types/api'

/** 2026-01-01T00:00:00Z — a fixed clock keeps fixtures deterministic. */
export const FIXTURE_NOW = 1_767_225_600

/* -------------------------------------------------------------------------- */
/* Host                                                                       */
/* -------------------------------------------------------------------------- */

export function makeCpuInfo(overrides: Partial<CpuInfo> = {}): CpuInfo {
  return {
    usage_percent: 42.5,
    physical_cores: 16,
    logical_cores: 32,
    frequency_mhz: 3800,
    load_average: [1.25, 1.1, 0.9],
    per_core_percent: [40, 45, 38, 47],
    ...overrides,
  }
}

export function makeMemoryInfo(overrides: Partial<MemoryInfo> = {}): MemoryInfo {
  return {
    total: 274_877_906_944,
    used: 96_207_126_528,
    available: 178_670_780_416,
    percent: 35,
    ...overrides,
  }
}

export function makeDiskInfo(overrides: Partial<DiskInfo> = {}): DiskInfo {
  return {
    device: '/dev/nvme0n1p2',
    mountpoint: '/',
    fstype: 'ext4',
    total: 1_000_204_886_016,
    used: 412_316_860_416,
    free: 587_888_025_600,
    percent: 41.2,
    is_primary: true,
    ...overrides,
  }
}

export function makeHostInfo(overrides: Partial<HostInfo> = {}): HostInfo {
  return {
    hostname: 'lab-gpu-01',
    os: 'Ubuntu 24.04.1 LTS',
    kernel: '6.8.0-45-generic',
    platform: 'Linux-6.8.0-45-generic-x86_64-with-glibc2.39',
    boot_time: FIXTURE_NOW - 372_600,
    ...overrides,
  }
}

type SystemStatusOverrides = Partial<Omit<SystemStatus, 'cpu' | 'memory' | 'host' | 'disks'>> & {
  cpu?: Partial<CpuInfo>
  memory?: Partial<MemoryInfo>
  host?: Partial<HostInfo>
  disks?: DiskInfo[]
}

export function makeSystemStatus(overrides: SystemStatusOverrides = {}): SystemStatus {
  const { cpu, memory, host, disks, ...rest } = overrides
  return {
    host: makeHostInfo(host),
    uptime_seconds: 372_600,
    uptime_human: '4d 7h 30m',
    cpu: makeCpuInfo(cpu),
    memory: makeMemoryInfo(memory),
    disks: disks ?? [
      makeDiskInfo(),
      makeDiskInfo({
        device: '/dev/nvme1n1',
        mountpoint: '/data',
        percent: 62.4,
        used: 2_500_000_000_000,
        total: 4_000_000_000_000,
        is_primary: false,
      }),
    ],
    collected_at: FIXTURE_NOW,
    demo: false,
    ...rest,
  }
}

/** A host that reports nothing but its identity. */
export function makeNullSystemStatus(): SystemStatus {
  return makeSystemStatus({
    uptime_seconds: null,
    uptime_human: null,
    cpu: {
      usage_percent: null,
      physical_cores: null,
      logical_cores: null,
      frequency_mhz: null,
      load_average: null,
      per_core_percent: [],
    },
    memory: { total: null, used: null, available: null, percent: null },
    disks: [makeDiskInfo({ fstype: null, total: null, used: null, free: null, percent: null })],
  })
}

export function makeSystemHistoryPoint(
  overrides: Partial<SystemHistoryPoint> = {},
): SystemHistoryPoint {
  return {
    timestamp: FIXTURE_NOW,
    cpu_percent: 42.5,
    memory_used: 96_207_126_528,
    memory_total: 274_877_906_944,
    memory_percent: 35,
    disk_used: 412_316_860_416,
    disk_total: 1_000_204_886_016,
    disk_percent: 41.2,
    ...overrides,
  }
}

export function makeSystemHistory(overrides: Partial<SystemHistory> = {}): SystemHistory {
  return {
    range: '1h',
    start: FIXTURE_NOW - 3_600,
    end: FIXTURE_NOW,
    interval_seconds: 10,
    points: [],
    demo: false,
    ...overrides,
  }
}

/* -------------------------------------------------------------------------- */
/* GPU                                                                        */
/* -------------------------------------------------------------------------- */

export function makeGpuStatus(overrides: Partial<GpuStatus> = {}): GpuStatus {
  return {
    index: 0,
    uuid: 'GPU-8f2c1d4e-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
    name: 'NVIDIA RTX A6000',
    utilization_percent: 82.4,
    memory_used: 40_000_000_000,
    memory_total: 51_000_000_000,
    memory_percent: 78.4,
    temperature_c: 71,
    power_watts: 245.5,
    power_limit_watts: 300,
    power_percent: 81.8,
    fan_percent: 55,
    clocks_sm_mhz: 1800,
    clocks_mem_mhz: 8001,
    persistence_mode: true,
    process_count: 3,
    collected_at: FIXTURE_NOW,
    ...overrides,
  }
}

/** A GPU whose driver reported the device but none of its metrics. */
export function makeNullGpuStatus(overrides: Partial<GpuStatus> = {}): GpuStatus {
  return makeGpuStatus({
    uuid: null,
    name: null,
    utilization_percent: null,
    memory_used: null,
    memory_total: null,
    memory_percent: null,
    temperature_c: null,
    power_watts: null,
    power_limit_watts: null,
    power_percent: null,
    fan_percent: null,
    clocks_sm_mhz: null,
    clocks_mem_mhz: null,
    persistence_mode: null,
    process_count: null,
    ...overrides,
  })
}

export function makeGpuCollection(overrides: Partial<GpuCollection> = {}): GpuCollection {
  return {
    available: true,
    driver_version: '560.94',
    cuda_version: '12.4',
    nvml_version: '12.560.94',
    error: null,
    gpus: [
      makeGpuStatus(),
      makeGpuStatus({ index: 1, uuid: 'GPU-1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d' }),
    ],
    collected_at: FIXTURE_NOW,
    demo: false,
    ...overrides,
  }
}

export function makeGpuProcess(overrides: Partial<GpuProcess> = {}): GpuProcess {
  return {
    pid: 4821,
    gpu_index: 0,
    gpu_uuid: 'GPU-8f2c1d4e-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
    gpu_memory: 12_884_901_888,
    name: 'python3',
    command: 'python3 /srv/train/train.py --config configs/llama-3-8b.yaml --epochs 3',
    username: 'mlops',
    cpu_percent: 128.4,
    memory_rss: 9_663_676_416,
    status: 'running',
    start_time: FIXTURE_NOW - 5_400,
    runtime_seconds: 5_400,
    runtime_human: '1h 30m',
    type: 'C',
    ...overrides,
  }
}

export function makeProcessCollection(overrides: Partial<ProcessCollection> = {}): ProcessCollection {
  return {
    available: true,
    error: null,
    processes: [
      makeGpuProcess(),
      makeGpuProcess({
        pid: 5120,
        gpu_index: 1,
        gpu_memory: 6_442_450_944,
        name: 'jupyter-lab',
        command: 'jupyter-lab --ip 0.0.0.0 --no-browser',
        username: 'research',
        cpu_percent: 12.5,
        runtime_seconds: 300,
        runtime_human: '5m 0s',
      }),
    ],
    collected_at: FIXTURE_NOW,
    demo: false,
    ...overrides,
  }
}

export function makeGpuHistoryPoint(overrides: Partial<GpuHistoryPoint> = {}): GpuHistoryPoint {
  return {
    timestamp: FIXTURE_NOW,
    gpu_index: 0,
    utilization: 82.4,
    memory_used: 40_000_000_000,
    memory_total: 51_000_000_000,
    memory_percent: 78.4,
    temperature: 71,
    power_usage: 245.5,
    power_limit: 300,
    ...overrides,
  }
}

export function makeGpuHistorySeries(overrides: Partial<GpuHistorySeries> = {}): GpuHistorySeries {
  return {
    gpu_index: 0,
    gpu_name: 'NVIDIA RTX A6000',
    points: [],
    ...overrides,
  }
}

export function makeGpuHistory(overrides: Partial<GpuHistory> = {}): GpuHistory {
  return {
    range: '1h',
    start: FIXTURE_NOW - 3_600,
    end: FIXTURE_NOW,
    interval_seconds: 10,
    series: [],
    demo: false,
    ...overrides,
  }
}

/* -------------------------------------------------------------------------- */
/* Aggregate                                                                  */
/* -------------------------------------------------------------------------- */

export function makeOverview(overrides: Partial<Overview> = {}): Overview {
  return {
    system: makeSystemStatus(),
    gpus: makeGpuCollection(),
    processes: makeProcessCollection(),
    poll_interval: 2,
    generated_at: FIXTURE_NOW,
    ...overrides,
  }
}
