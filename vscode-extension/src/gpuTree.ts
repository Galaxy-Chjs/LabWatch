/**
 * The LabWatch sidebar.
 *
 * Reading order is deliberate: one headline (what is happening), then the rows
 * that matter (GPUs), then a single way out (the dashboard). Nothing is repeated
 * that the label already says, and long machine output never lands here - it goes
 * to the LabWatch output channel, because a sidebar is for glancing.
 */

import * as vscode from 'vscode'

import { formatUptime, gpuCardLines, gpuDescription, gpuIcon, type LabwatchStatus } from './format'
import type { SetupState } from './guidance'
import { actionsFor, NOT_RUNNING_ACTIONS, type StateAction } from './stateActions'

export interface TreeState {
  status: LabwatchStatus | null
  /** Why there is no data, when there is none. Empty string means no problem. */
  problem: string
  setup: SetupState
}

export class GpuTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>()
  readonly onDidChangeTreeData = this.emitter.event

  private state: TreeState = { status: null, problem: '', setup: 'ready' }

  update(state: TreeState): void {
    this.state = state
    this.emitter.fire(undefined)
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element instanceof StateNode) return element.children
    if (element) return []
    return buildRows(this.state)
  }
}

/** A headline row that owns the actions resolving its state. */
export class StateNode extends vscode.TreeItem {
  readonly children: ActionNode[]

  constructor(options: {
    label: string
    description?: string
    icon: string
    state: SetupState | 'stopped'
    problem?: string
    actions: StateAction[]
  }) {
    super(
      options.label,
      options.actions.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    )
    if (options.description) this.description = options.description
    this.iconPath = new vscode.ThemeIcon(options.icon)
    this.contextValue = `labwatch.state.${options.state}`
    // The headline is what the user reads; the reason lives in the tooltip, so a
    // long machine message never stretches the sidebar.
    this.tooltip = new vscode.MarkdownString(
      options.problem
        ? `**${options.label}**\n\n${options.problem}\n\nFull output: the **LabWatch** output channel.`
        : `**${options.label}**`,
    )
    this.children = options.actions.map((action) => new ActionNode(action))
  }
}

/** A clickable row that runs a command. */
export class ActionNode extends vscode.TreeItem {
  constructor(action: StateAction) {
    super(action.label, vscode.TreeItemCollapsibleState.None)
    if (action.description) this.description = action.description
    this.iconPath = new vscode.ThemeIcon(action.icon)
    this.contextValue = 'labwatch.action'
    this.tooltip = action.description ? `${action.label} — ${action.description}` : action.label
    this.command = { command: action.command, title: action.label }
  }
}

export class GpuNode extends vscode.TreeItem {
  /** Prefer `GpuNode.host` / `GpuNode.gpu`; this is public only so rows for
   *  unusual states can be built in the same file. */
  constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    options: {
      description?: string
      tooltip?: vscode.MarkdownString
      icon?: string
      context?: string
      command?: vscode.Command
    } = {},
  ) {
    super(label, collapsible)
    if (options.description) this.description = options.description
    if (options.tooltip) this.tooltip = options.tooltip
    if (options.icon) this.iconPath = new vscode.ThemeIcon(options.icon)
    if (options.context) this.contextValue = options.context
    if (options.command) this.command = options.command
  }

  static host(status: LabwatchStatus): GpuNode {
    const bits: string[] = []
    if (status.driver_version) bits.push(`driver ${status.driver_version}`)
    if (status.uptime_seconds !== null) bits.push(`up ${formatUptime(status.uptime_seconds)}`)
    return new GpuNode(status.hostname ?? 'this host', vscode.TreeItemCollapsibleState.None, {
      description: bits.join('  ·  ') || undefined,
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
    })
  }

  static gpu(status: LabwatchStatus, index: number): GpuNode {
    const gpu = status.gpus[index]
    const [utilization, memory, temperature] = gpuCardLines(gpu)
    return new GpuNode(utilization, vscode.TreeItemCollapsibleState.None, {
      description: `${memory}  ·  ${temperature}`,
      tooltip: new vscode.MarkdownString(
        [
          `**GPU ${gpu.index}** — ${gpu.name ?? 'NVIDIA GPU'}`,
          '',
          `Utilisation: ${utilization}`,
          `VRAM: ${memory}`,
          `Temperature: ${temperature}`,
          gpu.power_watts !== null ? `Power: ${gpu.power_watts.toFixed(0)} W` : '',
          gpu.process_count !== null ? `Processes: ${gpu.process_count}` : '',
          '',
          gpu.busy ? 'Looks busy.' : 'Looks free.',
        ]
          .filter((line) => line !== '')
          .join('  \n'),
      ),
      icon: gpuIcon(gpu),
      context: gpu.busy ? 'labwatch.gpu.busy' : 'labwatch.gpu.free',
    })
  }

  /** Human-readable summary used by the "Show GPU Summary" command. */
  static describe(status: LabwatchStatus): string {
    if (!status.gpu_available) return `No NVIDIA GPU: ${status.gpu_error ?? 'unknown reason'}`
    if (status.gpus.length === 0) return 'No GPUs reported.'
    const lines = status.gpus.map((gpu) => `GPU ${gpu.index}  ${gpuDescription(gpu)}`)
    return [`${status.busy_count} busy / ${status.gpu_count} GPUs`, '', ...lines].join('\n')
  }
}

/** Headline text per state: short enough to read at a glance. */
const HEADLINE: Record<Exclude<SetupState, 'ready'>, string> = {
  provisioning: 'Setting up…',
  installable: 'Collector not installed',
  repair: 'Collector needs repair',
  'no-python': 'Python 3.10+ not found',
  failed: 'Collector problem',
}

function buildRows(state: TreeState): vscode.TreeItem[] {
  const { status, problem, setup } = state

  if (setup !== 'ready') {
    const icon =
      setup === 'provisioning'
        ? 'sync~spin'
        : setup === 'no-python'
          ? 'circle-slash'
          : setup === 'installable'
            ? 'cloud-download'
            : 'warning'
    const built = new StateNode({
      label: HEADLINE[setup],
      icon,
      state: setup,
      problem,
      actions: actionsFor(setup),
    })
    // A single headline that expands into its actions: with the reason in the
    // tooltip, the collapsed form is one clean line.
    if (setup === 'provisioning') built.collapsibleState = vscode.TreeItemCollapsibleState.None
    return [built]
  }

  if (status === null || !status.running) {
    return [
      new StateNode({
        label: 'Collector is not running',
        description: 'click to start',
        icon: 'debug-start',
        state: 'stopped',
        problem: problem === '' ? 'The collector is installed but no instance is running.' : problem,
        actions: NOT_RUNNING_ACTIONS,
      }),
    ]
  }

  const rows: vscode.TreeItem[] = [GpuNode.host(status)]

  if (!status.gpu_available) {
    rows.push(
      new GpuNode('NVIDIA GPU unavailable', vscode.TreeItemCollapsibleState.None, {
        description: status.gpu_error ?? 'unknown reason',
        icon: 'circle-slash',
      }),
    )
    return rows
  }

  for (let index = 0; index < status.gpus.length; index += 1) {
    rows.push(GpuNode.gpu(status, index))
  }

  rows.push(
    new GpuNode('Open Full Dashboard', vscode.TreeItemCollapsibleState.None, {
      description: 'history, processes, charts',
      icon: 'link-external',
      context: 'labwatch.open',
      command: { command: 'labwatch.openDashboard', title: 'Open Full Dashboard' },
    }),
  )

  return rows
}
