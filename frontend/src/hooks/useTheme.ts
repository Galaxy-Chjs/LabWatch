/**
 * Theme preference handling.
 *
 * The choice is persisted in localStorage and applied to `<html data-theme>`
 * before first paint (see the inline script in index.html) so there is no
 * flash of the wrong theme.
 */

import { useCallback, useEffect, useState } from 'react'

import type { ThemePreference } from '../types/api'

export const THEME_STORAGE_KEY = 'labwatch.theme'

/** Read the stored preference, defaulting to following the OS. */
export function readStoredTheme(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

/** Resolve a preference to the concrete theme that should be displayed. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Apply a concrete theme to the document element. */
export function applyTheme(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

export interface ThemeController {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference: (next: ThemePreference) => void
}

/** Manage the theme preference and keep the DOM in sync. */
export function useTheme(): ThemeController {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredTheme())
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(readStoredTheme()))

  useEffect(() => {
    const next = resolveTheme(preference)
    setResolved(next)
    applyTheme(next)
    if (preference === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference)
    }
  }, [preference])

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (preference !== 'system') return
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      const next = query.matches ? 'light' : 'dark'
      setResolved(next)
      applyTheme(next)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  return {
    preference,
    resolved,
    setPreference: useCallback((next: ThemePreference) => setPreferenceState(next), []),
  }
}
