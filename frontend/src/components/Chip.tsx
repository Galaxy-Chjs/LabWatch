/**
 * Small status pill.
 *
 * Tone is the only colour input, and it exists to express state — never
 * decoration. `lw-chip` supplies the base shape so a chip looks the same
 * everywhere it appears.
 */

import type { ReactNode } from 'react'

export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'crit'

export interface ChipProps {
  children: ReactNode
  tone?: ChipTone
  icon?: ReactNode
  title?: string
  className?: string
}

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: 'text-muted',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  ok: 'border-ok/40 bg-ok/10 text-ok',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  crit: 'border-crit/40 bg-crit/10 text-crit',
}

export function Chip({ children, tone = 'neutral', icon, title, className }: ChipProps) {
  return (
    <span title={title} className={`lw-chip ${TONE_CLASS[tone]} ${className ?? ''}`}>
      {icon}
      {children}
    </span>
  )
}
