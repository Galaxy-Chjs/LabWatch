/**
 * The GPU tree shown in the LabWatch sidebar.
 *
 * A single flat list of GPUs plus a host row: the sidebar is for glancing, and
 * the full dashboard is one click away for everything else.
 *
 * When there is nothing to show, the tree shows why and what to do about it,
 * rather than an empty pane. That first minute is the whole point of the setup
 * work: an empty sidebar tells a new user nothing.
 */

import * as vscode from 'vscode'

import { formatUptime, gpuCardLines, gpuDescription, gpuIcon, type LabwatchStatus } from './format'
import type { SetupState } from './guidance'

export interface TreeState {
  status: LabwatchStatus | null
  /** Why there is no data, when there is none. Empty string means no problem. */
  problem: string
  setup: SetupState
}

export class GpuTreeProvider implements vscode.TreeDataProvider<GpuNode> {
  private readonly emitter = new vscode.EventEmitter<GpuNode | undefined>()
  readonly onDidChangeTreeData = this.emitter.event

  private state: TreeState = { status: null, problem: '', setup: 'ready' }

  /** Replace the data shown in the tree. */
  update(state: TreeState): void {
    this.state = state
    this.emitter.fire(undefined)
  }

  getTreeItem(element: GpuNode): vscode.TreeItem {
    return element
  }

  getChildren(element?: GpuNode): GpuNode[] {
    if (element) return []
    return GpuNode.fromState(this.state)
  }
}

/** Rows offered when the collector is missing, per state. */
const SETUP_ACTIONS: Record<Exclude<SetupState, 'ready'>, { label: string; command: string; icon: string }[]> = {
  provisioning: [],
  installable: [
    { label: 'Set up LabWatch (one click)', command: 'labwatch.setup', icon: 'cloud-download' },
    { label: 'Install it myself', command: 'labwatch.showManualSteps', icon: 'terminal' },
  ],
  repair: [
    { label: 'Repair the private environment', command: 'labwatch.setup', icon: 'tools' },
    { label: 'Install it myself', command: 'labwatch.showManualSteps', icon: 'terminal' },
  ],
  'no-python': [
    { label: 'How to connect', command: 'labwatch.showGuide', icon: 'book' },
    { label: 'Open settings', command: 'labwatch.openSettings', icon: 'settings-gear' },
  ],
  failed: [
    { label: 'Run Doctor', command: 'labwatch.doctor', icon: 'heart' },
    { label: 'How to connect', command: 'labwatch.showGuide', icon: 'book' },
    { label: 'Install it myself', command: 'labwatch.showManualSteps', icon: 'terminal' },
  ],
}

const SETUP_HEADLINE: Record<Exclude<SetupState, 'ready'>, string> = {
  provisioning: 'Setting up LabWatch…',
  installable: 'One step left: install the collector',
  repair: 'The private environment needs repair',
  'no-python': 'Python 3.10+ not found',
  failed: 'Setup needs attention',
}

export class GpuNode extends vscode.TreeItem {
  private constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    options: { description?: string; tooltip?: vscode.MarkdownString; icon?: string; context?: string; command?: vscode.Command } = {},
  ) {
    super(label, collapsible)
    if (options.description) this.description = options.description
    if (options.tooltip) this.tooltip = options.tooltip
    if (options.icon) this.iconPath = new vscode.ThemeIcon(options.icon)
    if (options.context) this.contextValue = options.context
    if (options.command) this.command = options.command
  }

  /** Build the visible rows for a snapshot. */
  static fromState(state: TreeState): GpuNode[] {
    const { status, problem, setup } = state

    if (setup !== 'ready') {
      const nodes: GpuNode[] = [
        new GpuNode(SETUP_HEADLINE[setup], vscode.TreeItemCollapsibleState.None, {
          description: problem || undefined,
          tooltip: new vscode.MarkdownString(problem ? `**${SETUP_HEADLINE[setup]}**\n\n${problem}` : undefined),
          icon: setup === 'no-python' ? 'circle-slash' : setup === 'provisioning' ? 'sync~spin' : 'warning',
          context: `labwatch.setup.${setup}`,
        }),
      ]
      for (const action of SETUP_ACTIONS[setup]) {
        nodes.push(
          new GpuNode(action.label, vscode.TreeItemCollapsibleState.None, {
            icon: action.icon,
            context: 'labwatch.setupAction',
            command: { command: action.command, title: action.label },
          }),
        )
      }
      return nodes
    }

    if (problem !== '') {
      return [
        new GpuNode('LabWatch unavailable', vscode.TreeItemCollapsibleState.None, {
          description: 'click for details',
          icon: 'warning',
          context: 'labwatch.problem',
        }),
      ]
    }

    if (status === null || !status.running) {
      return [
        new GpuNode('LabWatch is not running', vscode.TreeItemCollapsibleState.None, {
          description: 'click to start',
          icon: 'debug-start',
          context: 'labwatch.stopped',
          command: { command: 'labwatch.start', title: 'Start LabWatch' },
        }),
      ]
    }

    const nodes: GpuNode[] = []

    const hostBits = [status.hostname ?? 'unknown host']
    if (status.driver_version) hostBits.push(`driver ${status.driver_version}`)
    if (status.uptime_seconds !== null) hostBits.push(`up ${formatUptime(status.uptime_seconds)}`)
    nodes.push(
      new GpuNode(status.demo ? 'Demo data' : 'Host', vscode.TreeItemCollapsibleState.None, {
        description: hostBits.join('  ·  '),
        tooltip: new vscode.MarkdownString(
          [
            `**${status.hostname ?? 'LabWatch'}**`,
            '',
            status.driver_version ? `driver ${status.driver_version}` : '',
            status.cuda_version ? `CUDA ${status.cuda_version}` : '',
            status.url ? `[${status.url}](${status.url})` : '',
          ]
            .filter(Boolean)
            .join('  \n'),
        ),
        icon: status.demo ? 'beaker' : 'server',
        context: 'labwatch.host',
      }),
    )

    if (!status.gpu_available) {
      nodes.push(
        new GpuNode('NVIDIA GPU unavailable', vscode.TreeItemCollapsibleState.None, {
          description: status.gpu_error ?? 'unknown reason',
          icon: 'circle-slash',
        }),
      )
      return nodes
    }

    for (const gpu of status.gpus) {
      const [utilization, memory, temperature] = gpuCardLines(gpu)
      const tooltip = new vscode.MarkdownString(
        [
          `**GPU ${gpu.index}** — ${gpu.name ?? 'NVIDIA GPU'}`,
          '',
          `Utilization: ${utilization}`,
          `VRAM: ${memory}`,
          `Temperature: ${temperature}`,
          gpu.power_watts !== null ? `Power: ${gpu.power_watts.toFixed(0)} W` : '',
          gpu.process_count !== null ? `Processes: ${gpu.process_count}` : '',
          '',
          gpu.busy ? 'Looks busy.' : 'Looks free.',
        ]
          .filter((line) => line !== '')
          .join('  \n'),
      )
      nodes.push(
        new GpuNode(`GPU ${gpu.index}  ${utilization}`, vscode.TreeItemCollapsibleState.None, {
          description: `${memory}  ·  ${temperature}`,
          tooltip,
          icon: gpuIcon(gpu),
          context: gpu.busy ? 'labwatch.gpu.busy' : 'labwatch.gpu.free',
        }),
      )
    }

    nodes.push(
      new GpuNode('Open Full Dashboard', vscode.TreeItemCollapsibleState.None, {
        description: 'history, processes, charts',
        icon: 'link-external',
        context: 'labwatch.open',
        command: { command: 'labwatch.openDashboard', title: 'Open Full Dashboard' },
      }),
    )

    return nodes
  }

  /** Human-readable summary used by the "Show GPU Summary" command. */
  static describe(status: LabwatchStatus): string {
    if (!status.gpu_available) return `No NVIDIA GPU: ${status.gpu_error ?? 'unknown reason'}`
    if (status.gpus.length === 0) return 'No GPUs reported.'
    const lines = status.gpus.map((gpu) => `GPU ${gpu.index}  ${gpuDescription(gpu)}`)
    return [`${status.busy_count} busy / ${status.gpu_count} GPUs`, '', ...lines].join('\n')
  }
}
