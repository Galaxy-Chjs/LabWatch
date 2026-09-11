/**
 * Unit tests for the pure formatting layer.
 *
 * These run under plain Node (`node --test out/test/`) with no VS Code host,
 * which is the point of keeping `format.ts` free of editor imports: the numbers
 * the status bar shows are the part most likely to be quietly wrong.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  formatBytes,
  formatPercent,
  formatTemperature,
  formatUptime,
  gpuCardLines,
  gpuDescription,
  gpuIcon,
  parseStatus,
  statusBarText,
  statusBarTooltip,
  type LabwatchStatus,
} from '../format'

function status(overrides: Partial<LabwatchStatus> = {}): LabwatchStatus {
  return {
    running: true,
    url: 'http://127.0.0.1:8123',
    pid: 1234,
    uptime_seconds: 90,
    version: '1.1.0',
    hostname: 'gpu-node-01',
    demo: false,
    gpu_available: true,
    gpu_error: null,
    driver_version: '580.173.02',
    cuda_version: '13.0',
    gpu_count: 1,
    busy_count: 1,
    free_count: 0,
    cpu_percent: 9,
    memory_percent: 9,
    process_count: 8,
    gpus: [
      {
        index: 0,
        name: 'NVIDIA GeForce RTX 4090',
        utilization_percent: 98.4,
        memory_used: 33 * 1024 ** 3,
        memory_total: 48 * 1024 ** 3,
        memory_percent: 68.8,
        temperature_c: 67.2,
        power_watts: 448.2,
        process_count: 1,
        busy: true,
      },
    ],
    ...overrides,
  }
}

test('formatBytes uses binary units and degrades to N/A', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(33 * 1024 ** 3), '33 GB')
  assert.equal(formatBytes(null), 'N/A')
  assert.equal(formatBytes(Number.NaN), 'N/A')
})

test('formatPercent and formatTemperature handle missing values', () => {
  assert.equal(formatPercent(98.4), '98%')
  assert.equal(formatPercent(null), 'N/A')
  assert.equal(formatTemperature(67.2), '67°C')
  assert.equal(formatTemperature(null), 'N/A')
})

test('formatUptime collapses to the useful unit', () => {
  assert.equal(formatUptime(90), '1m')
  assert.equal(formatUptime(3 * 3600 + 600), '3h 10m')
  assert.equal(formatUptime(2 * 86400), '2d 0h')
  assert.equal(formatUptime(null), 'N/A')
})

test('status bar summarises a single GPU with its own numbers', () => {
  const text = statusBarText(status())
  assert.match(text, /GPU 98%/)
  assert.match(text, /33 GB\/48 GB/)
})

test('status bar summarises many GPUs by count', () => {
  const many = status({
    gpu_count: 8,
    busy_count: 3,
    free_count: 5,
    gpus: Array.from({ length: 8 }, (_, index) => ({
      index,
      name: 'NVIDIA GeForce RTX 4090',
      utilization_percent: index < 3 ? 99 : 0,
      memory_used: 1024 ** 3,
      memory_total: 48 * 1024 ** 3,
      memory_percent: 2,
      temperature_c: 30,
      power_watts: 20,
      process_count: index < 3 ? 1 : 0,
      busy: index < 3,
    })),
  })
  assert.match(statusBarText(many), /3 busy \/ 8/)
})

test('status bar reports the states a user will actually hit', () => {
  assert.match(statusBarText(null), /not running/)
  assert.match(statusBarText(status({ demo: true })), /demo/)
  assert.match(statusBarText(status({ gpu_available: false, gpus: [], gpu_count: 0 })), /no GPU/)
  assert.match(statusBarText(status({ gpu_count: 0, gpus: [] })), /API up/)
})

test('tooltip lists every GPU and the host facts', () => {
  const tooltip = statusBarTooltip(status())
  assert.match(tooltip, /LabWatch 1\.1\.0/)
  assert.match(tooltip, /gpu-node-01/)
  assert.match(tooltip, /driver 580\.173\.02/)
  assert.match(tooltip, /GPU 0/)
  assert.match(tooltip, /http:\/\/127\.0\.0\.1:8123/)
})

test('a GPU card shows utilisation, VRAM and temperature', () => {
  const [utilization, memory, temperature] = gpuCardLines(status().gpus[0])
  assert.equal(utilization, '98%')
  assert.equal(memory, '33 GB / 48 GB')
  assert.equal(temperature, '67°C')
})

test('busy GPUs get a distinct icon and description', () => {
  assert.equal(gpuIcon(status().gpus[0]), 'flame')
  const idle = { ...status().gpus[0], busy: false }
  assert.equal(gpuIcon(idle), 'circle-outline')
  assert.match(gpuDescription(status().gpus[0]), /98% · 33 GB \/ 48 GB · 67°C/)
})

test('parseStatus accepts a full payload', () => {
  const parsed = parseStatus(JSON.stringify(status()))
  assert.ok(parsed)
  assert.equal(parsed.running, true)
  assert.equal(parsed.gpus.length, 1)
  assert.equal(parsed.gpus[0].index, 0)
  assert.equal(parsed.gpus[0].busy, true)
})

test('parseStatus tolerates a not-running payload', () => {
  const parsed = parseStatus(
    JSON.stringify({ running: false, url: 'http://127.0.0.1:8123', gpu_count: 0, gpus: [] }),
  )
  assert.ok(parsed)
  assert.equal(parsed.running, false)
  assert.equal(parsed.gpus.length, 0)
  assert.equal(parsed.gpu_count, 0)
})

test('parseStatus rejects junk instead of throwing', () => {
  assert.equal(parseStatus('not json'), null)
  assert.equal(parseStatus('[]'), null)
  assert.equal(parseStatus('null'), null)
})

test('parseStatus survives missing and wrong-typed fields', () => {
  const parsed = parseStatus(
    JSON.stringify({
      running: true,
      gpus: [{ index: '3', utilization_percent: '12.5', busy: 'yes' }, {}],
    }),
  )
  assert.ok(parsed)
  assert.equal(parsed.gpus[0].index, 3)
  assert.equal(parsed.gpus[0].utilization_percent, 12.5)
  // A truthy string is not a boolean; do not claim the GPU is busy on a guess.
  assert.equal(parsed.gpus[0].busy, false)
  assert.equal(parsed.gpus[1].index, 0)
  assert.equal(parsed.gpus[1].utilization_percent, null)
  assert.equal(parsed.gpu_count, 2)
})
