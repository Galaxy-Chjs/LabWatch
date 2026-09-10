import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, resolveTheme, useTheme } from '../useTheme'

/** Install a matchMedia stub that reports a fixed OS preference. */
function stubMatchMedia(prefersLight: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: prefersLight,
    media: '(prefers-color-scheme: light)',
    onchange: null,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => false,
  }
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(query),
  })
  return { query, listeners }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readStoredTheme', () => {
  it('defaults to system when nothing is stored', () => {
    expect(readStoredTheme()).toBe('system')
  })

  it('reads a stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(readStoredTheme()).toBe('light')
  })

  it('ignores an invalid stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    expect(readStoredTheme()).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('passes through explicit choices', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('follows the OS preference for system', () => {
    stubMatchMedia(true)
    expect(resolveTheme('system')).toBe('light')

    stubMatchMedia(false)
    expect(resolveTheme('system')).toBe('dark')
  })

  it('falls back to dark when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: undefined })
    expect(resolveTheme('system')).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('sets the data-theme attribute', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

describe('useTheme', () => {
  it('starts from the OS preference', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('system')
    expect(result.current.resolved).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('persists an explicit choice and applies it', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useTheme())

    act(() => result.current.setPreference('dark'))

    expect(result.current.resolved).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('removes the stored key when returning to system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    act(() => result.current.setPreference('system'))

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
