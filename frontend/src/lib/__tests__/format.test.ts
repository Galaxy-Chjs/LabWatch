import { describe, expect, it } from 'vitest'

import {
  NA,
  bgColorForLevel,
  cssColorForLevel,
  formatAgo,
  formatBytes,
  formatBytesPair,
  formatClock,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRuntime,
  formatTemperature,
  formatWatts,
  levelForPercent,
  levelForTemperature,
  textColorForLevel,
  truncate,
} from '../format'

describe('formatBytes', () => {
  it('uses binary units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
    expect(formatBytes(1024 ** 4)).toBe('1.0 TB')
  })

  it('formats a realistic VRAM value', () => {
    expect(formatBytes(38.2 * 1024 ** 3)).toBe('38.2 GB')
    expect(formatBytes(48 * 1024 ** 3)).toBe('48.0 GB')
  })

  it('returns N/A for missing or invalid values', () => {
    expect(formatBytes(null)).toBe(NA)
    expect(formatBytes(undefined)).toBe(NA)
    expect(formatBytes(Number.NaN)).toBe(NA)
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe(NA)
  })
})

describe('formatBytesPair', () => {
  it('joins used and total', () => {
    expect(formatBytesPair(38.2 * 1024 ** 3, 48 * 1024 ** 3)).toBe('38.2 GB / 48.0 GB')
  })

  it('degrades gracefully', () => {
    expect(formatBytesPair(null, null)).toBe(NA)
    expect(formatBytesPair(1024, null)).toBe('1.0 KB / N/A')
  })
})

describe('formatPercent', () => {
  it('adds a percent sign', () => {
    expect(formatPercent(82.44)).toBe('82.4%')
    expect(formatPercent(0)).toBe('0.0%')
    expect(formatPercent(100)).toBe('100.0%')
  })

  it('returns N/A for missing values', () => {
    expect(formatPercent(null)).toBe(NA)
    expect(formatPercent(undefined)).toBe(NA)
  })
})

describe('formatTemperature and formatWatts', () => {
  it('formats hardware readings', () => {
    expect(formatTemperature(69.4)).toBe('69°C')
    expect(formatTemperature(69.6)).toBe('70°C')
    expect(formatWatts(392.14)).toBe('392.1 W')
  })

  it('returns N/A when unsupported', () => {
    expect(formatTemperature(null)).toBe(NA)
    expect(formatWatts(null)).toBe(NA)
  })
})

describe('formatDuration', () => {
  it('uses the coarsest useful unit', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(90)).toBe('1m 30s')
    expect(formatDuration(3_660)).toBe('1h 1m')
    expect(formatDuration(5 * 86_400 + 14 * 3_600)).toBe('5d 14h 0m')
  })

  it('returns N/A without a value', () => {
    expect(formatDuration(null)).toBe(NA)
    expect(formatDuration(-5)).toBe('0s')
  })
})

describe('formatRuntime', () => {
  it('renders a clock', () => {
    expect(formatRuntime(0)).toBe('00:00:00')
    expect(formatRuntime(3_600)).toBe('01:00:00')
    expect(formatRuntime(13_338)).toBe('03:42:18')
  })

  it('prefixes days for long runs', () => {
    expect(formatRuntime(86_400 + 3_661)).toBe('1d 01:01:01')
  })

  it('returns N/A without a value', () => {
    expect(formatRuntime(null)).toBe(NA)
  })
})

describe('time formatting', () => {
  it('formats a clock time', () => {
    const timestamp = new Date(2024, 0, 15, 13, 5, 9).getTime() / 1000
    expect(formatClock(timestamp)).toBe('13:05:09')
  })

  it('returns N/A for missing timestamps', () => {
    expect(formatClock(null)).toBe(NA)
    expect(formatDateTime(undefined)).toBe(NA)
  })

  it('describes relative time', () => {
    const now = 1_000_000
    expect(formatAgo(now, now)).toBe('just now')
    expect(formatAgo(now - 8, now)).toBe('8s ago')
    expect(formatAgo(now - 120, now)).toBe('2m ago')
    expect(formatAgo(now - 7_200, now)).toBe('2h ago')
    expect(formatAgo(now - 172_800, now)).toBe('2d ago')
    expect(formatAgo(null, now)).toBe(NA)
  })
})

describe('status levels', () => {
  it('maps percentages to levels', () => {
    expect(levelForPercent(0)).toBe('idle')
    expect(levelForPercent(12)).toBe('ok')
    expect(levelForPercent(80)).toBe('warn')
    expect(levelForPercent(95)).toBe('crit')
    expect(levelForPercent(null)).toBe('idle')
  })

  it('maps temperatures to levels', () => {
    expect(levelForTemperature(45)).toBe('ok')
    expect(levelForTemperature(75)).toBe('warn')
    expect(levelForTemperature(90)).toBe('crit')
    expect(levelForTemperature(null)).toBe('idle')
  })

  it('provides classes and colours for every level', () => {
    for (const level of ['ok', 'warn', 'crit', 'idle'] as const) {
      expect(textColorForLevel(level)).toMatch(/^text-/)
      expect(bgColorForLevel(level)).toMatch(/^bg-/)
      expect(cssColorForLevel(level)).toBe(`var(--lw-${level})`)
    }
  })
})

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('python train.py')).toBe('python train.py')
  })

  it('shortens long text with an ellipsis', () => {
    const result = truncate('a'.repeat(100), 20)
    expect(result).toHaveLength(20)
    expect(result.endsWith('…')).toBe(true)
  })

  it('returns N/A for empty values', () => {
    expect(truncate(null)).toBe(NA)
    expect(truncate('')).toBe(NA)
  })
})
