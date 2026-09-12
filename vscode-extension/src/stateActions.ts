/**
 * The actions offered for each setup state.
 *
 * Separate from `gpuTree.ts` so it carries no `vscode` import and can be unit
 * tested under plain Node. Only the action that resolves a state is described as
 * such; the rest are alternatives for people who would rather do it themselves.
 */

import type { SetupState } from './guidance'

export interface StateAction {
  label: string
  description?: string
  icon: string
  command: string
}

export function actionsFor(state: SetupState): StateAction[] {
  switch (state) {
    case 'installable':
      return [
        {
          label: 'Set up LabWatch',
          description: 'one click, nothing global',
          icon: 'cloud-download',
          command: 'labwatch.setup',
        },
        { label: 'Install it myself', icon: 'terminal', command: 'labwatch.showManualSteps' },
        { label: 'How to connect', icon: 'book', command: 'labwatch.showGuide' },
      ]
    case 'repair':
      return [
        {
          label: 'Repair the environment',
          description: 'rebuilds only this extension’s folder',
          icon: 'tools',
          command: 'labwatch.setup',
        },
        { label: 'Install it myself', icon: 'terminal', command: 'labwatch.showManualSteps' },
        { label: 'How to connect', icon: 'book', command: 'labwatch.showGuide' },
      ]
    case 'no-python':
      return [
        {
          label: 'How to connect',
          description: 'Python 3.10+ is required',
          icon: 'book',
          command: 'labwatch.showGuide',
        },
        {
          label: 'Open settings',
          description: 'point labwatch.pythonPath at a collector',
          icon: 'settings-gear',
          command: 'labwatch.openSettings',
        },
      ]
    case 'failed':
      return [
        { label: 'Run Doctor', icon: 'heart', command: 'labwatch.doctor' },
        { label: 'How to connect', icon: 'book', command: 'labwatch.showGuide' },
        { label: 'Install it myself', icon: 'terminal', command: 'labwatch.showManualSteps' },
      ]
    default:
      return []
  }
}

/** The actions shown when a collector exists but nothing is running. */
export const NOT_RUNNING_ACTIONS: StateAction[] = [
  { label: 'Start the collector', icon: 'play', command: 'labwatch.start' },
  { label: 'Open the dashboard anyway', icon: 'link-external', command: 'labwatch.openDashboard' },
]
