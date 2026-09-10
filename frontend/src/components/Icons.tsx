/**
 * Inline SVG icon set.
 *
 * No icon library is installed, and the design language is deliberately thin:
 * 16–20px, `currentColor`, 1.75 stroke, never filled. Every icon is decorative
 * (`aria-hidden`); the accessible name always comes from the surrounding text
 * or a button `aria-label`.
 */

import type { ReactNode } from 'react'

export interface IconProps {
  className?: string
  size?: number
}

function Glyph({ children, className, size = 16 }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

export function IconRefresh(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M20 11a8 8 0 1 0-2.6 5.9" />
      <path d="M20 4.5V11h-6.2" />
    </Glyph>
  )
}

export function IconSun(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3" />
    </Glyph>
  )
}

export function IconMoon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Glyph>
  )
}

export function IconMonitor(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </Glyph>
  )
}

export function IconAlert(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.2M12 17h.01" />
    </Glyph>
  )
}

export function IconServer(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="3.5" width="18" height="7" rx="2" />
      <rect x="3" y="13.5" width="18" height="7" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </Glyph>
  )
}

export function IconCpu(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </Glyph>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </Glyph>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Glyph>
  )
}

export function IconArrowUp(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Glyph>
  )
}

export function IconArrowDown(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 5v14M18 13l-6 6-6-6" />
    </Glyph>
  )
}

/** Product mark: a monitoring trace inside a rounded frame. */
export function IconLogo({ className, size = 20 }: IconProps) {
  return (
    <Glyph className={className} size={size}>
      <rect x="3" y="3" width="18" height="18" rx="4.5" />
      <path d="M6.5 14.2l3-4.4 2.4 5.4 2.1-7.4 3.5 6.4" />
    </Glyph>
  )
}
