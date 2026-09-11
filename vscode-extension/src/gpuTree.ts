/**
 * The GPU tree shown in the LabWatch sidebar.
 *
 * A single flat list of GPUs plus a host row: the sidebar is for glancing, and
 * the full dashboard is one click away for everything else.
 */

import * as vscode from 'vscode'

import { formatUptime, gpuCardLines, gpuDescription, gpuIcon, type LabwatchStatus } from './format'

export class GpuTreeProvider implements vscode.TreeDataProvider<GpuNode> {
  private readonly emitter = new vscode.EventEmitter<GpuNode | undefined>()
  readonly onDidChangeTreeData = this.emitter.event

  private status: LabwatchStatus | null = null
  private problem: string | null = null

  /** Replace the data shown in the tree. */
  update(status: LabwatchStatus | null, problem: string | null): void {
    this.status = status
    this.problem = problem
    this.emitter.fire(undefined)
  }

  getTreeItem(element: GpuNode): vscode.TreeItem {
    return element
  }

  getChildren(element?: GpuNode): GpuNode[] {
    if (element) return []
    return GpuNode.from(this.status, this.problem)
  }
}

export class GpuNode extends vscode.TreeItem {
  private constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    options: { description?: string; tooltip?: vscode.MarkdownString; icon?: string; context?: string } = {},
  ) {
    super(label, collapsible)
    if (options.description) this.description = options.description
    if (options.tooltip) this.tooltip = options.tooltip
    if (options.icon) this.iconPath = new vscode.ThemeIcon(options.icon)
    if (options.context) this.contextValue = options.context
  }

  /** Build the visible rows for a snapshot. */
  static from(status: LabwatchStatus | null, problem: string | null): GpuNode[] {
    if (problem !== null) {
      return [
        new GpuNode('LabWatch unavailable', vscode.TreeItemCollapsibleState.None, {
          description: 'click for details',
          icon: 'warning',
          context: 'labwatch.problem',
        }),
      ]
    }

    if (status === null || !status.running) {
      return []
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
