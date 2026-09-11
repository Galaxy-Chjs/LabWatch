/**
 * LabWatch for VS Code.
 *
 * A thin view onto a LabWatch instance: the status bar and sidebar read
 * `labwatch status --json`, and the full dashboard is opened in a browser. The
 * GPU collector is never reimplemented here.
 *
 * Remote-SSH is the interesting case. The extension host runs on the *remote*
 * machine, so:
 *   - the CLI it invokes describes the remote GPUs, not the laptop's;
 *   - `vscode.env.asExternalUri` asks the editor to forward the dashboard port,
 *     which is what makes the browser link work when the server is on the far
 *     side of a tunnel.
 */

import * as vscode from 'vscode'

import { statusBarText, statusBarTooltip, type LabwatchStatus } from './format'
import { GpuNode, GpuTreeProvider } from './gpuTree'
import { fetchStatus, runCliCommand, type CliCache } from './labwatchCli'

const cache: CliCache = { command: null }

let statusBar: vscode.StatusBarItem
let treeProvider: GpuTreeProvider
let timer: NodeJS.Timeout | undefined
let lastStatus: LabwatchStatus | null = null
let lastProblem: string | null = null

export function activate(context: vscode.ExtensionContext): void {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90)
  statusBar.command = 'labwatch.openDashboard'
  statusBar.show()

  treeProvider = new GpuTreeProvider()
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('labwatch.gpus', treeProvider),
    statusBar,
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('labwatch.refresh', () => refresh({ silent: true })),
    vscode.commands.registerCommand('labwatch.openDashboard', () => openDashboard()),
    vscode.commands.registerCommand('labwatch.start', () => startInstance()),
    vscode.commands.registerCommand('labwatch.stop', () => stopInstance()),
    vscode.commands.registerCommand('labwatch.doctor', () => runDoctor()),
    vscode.commands.registerCommand('labwatch.showStatus', () => showSummary()),
  )

  configureRefresh()

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('labwatch.refreshInterval') ||
        event.affectsConfiguration('labwatch.pythonPath') ||
        event.affectsConfiguration('labwatch.statusBar')
      ) {
        cache.command = null
        configureRefresh()
      }
    }),
  )

  void refresh({ silent: true })

  if (config().get<boolean>('autoStart', false)) {
    void maybeAutoStart()
  }
}

export function deactivate(): void {
  if (timer) clearInterval(timer)
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('labwatch')
}

function configureRefresh(): void {
  if (timer) clearInterval(timer)
  const seconds = Math.max(1, config().get<number>('refreshInterval', 5))
  timer = setInterval(() => void refresh({ silent: true }), seconds * 1000)
  if (statusBar) {
    statusBar.tooltip = `LabWatch — refreshing every ${seconds}s`
  }
}

interface RefreshOptions {
  silent?: boolean
}

async function refresh(options: RefreshOptions = {}): Promise<void> {
  const optionsForCli = {
    preferredPython: config().get<string>('pythonPath', ''),
    port: config().get<number>('dashboardPort', 8123),
    cache,
    timeoutMs: 15_000,
  }

  const result = await fetchStatus(optionsForCli)
  lastStatus = result.status
  lastProblem = result.ok ? null : result.error

  if (config().get<boolean>('statusBar', true)) {
    statusBar.text = statusBarText(lastStatus, false)
    statusBar.tooltip = statusBarTooltip(lastStatus)
    if (lastProblem !== null) {
      statusBar.text = '$(warning) LabWatch: CLI not found'
      statusBar.tooltip = lastProblem
    }
    statusBar.show()
  } else {
    statusBar.hide()
  }

  treeProvider.update(lastStatus, lastProblem)

  if (!result.ok && !options.silent) {
    void vscode.window.showWarningMessage(`LabWatch: ${result.error}`)
  }
}

async function openDashboard(): Promise<void> {
  const port = config().get<number>('dashboardPort', 8123)

  if (lastStatus === null || !lastStatus.running) {
    const choice = await vscode.window.showInformationMessage(
      'LabWatch is not running.',
      'Start in background',
      'Open anyway',
    )
    if (choice === 'Start in background') return startInstance()
    if (choice !== 'Open anyway') return
  }

  const localUrl = lastStatus?.url ?? `http://127.0.0.1:${port}`
  try {
    // In a Remote-SSH window this asks the editor to forward the port and returns
    // a URL the local browser can actually reach.
    const external = await vscode.env.asExternalUri(vscode.Uri.parse(localUrl))
    await vscode.env.openExternal(external)
  } catch (error) {
    // Fall back to handing over the URL rather than failing silently.
    const message = error instanceof Error ? error.message : String(error)
    const action = await vscode.window.showWarningMessage(
      `Could not open ${localUrl}: ${message}`,
      'Copy URL',
    )
    if (action === 'Copy URL') await vscode.env.clipboard.writeText(localUrl)
  }
}

async function startInstance(): Promise<void> {
  const port = config().get<number>('dashboardPort', 8123)
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Starting LabWatch…' },
    async () => {
      const result = await runCliCommand({
        preferredPython: config().get<string>('pythonPath', ''),
        port,
        cache,
        args: ['start', '--host', '127.0.0.1'],
      })
      if (!result.ok) {
        const detail = result.stderr || result.error || 'unknown error'
        const action = await vscode.window.showErrorMessage(`LabWatch failed to start: ${detail}`, 'Run Doctor')
        if (action === 'Run Doctor') await runDoctor()
        return
      }
      await refresh({ silent: true })
      void vscode.window.showInformationMessage('LabWatch started.')
    },
  )
}

async function stopInstance(): Promise<void> {
  const port = config().get<number>('dashboardPort', 8123)
  const result = await runCliCommand({
    preferredPython: config().get<string>('pythonPath', ''),
    port,
    cache,
    args: ['stop'],
  })
  await refresh({ silent: true })
  if (result.ok) void vscode.window.showInformationMessage('LabWatch stopped.')
  else void vscode.window.showWarningMessage(result.stderr || result.error || 'Could not stop LabWatch.')
}

async function runDoctor(): Promise<void> {
  const port = config().get<number>('dashboardPort', 8123)
  const result = await runCliCommand({
    preferredPython: config().get<string>('pythonPath', ''),
    port,
    cache,
    args: ['doctor'],
    timeoutMs: 60_000,
  })
  const output = result.stdout || result.stderr || result.error || 'no output'
  const document = await vscode.workspace.openTextDocument({ content: output, language: 'text' })
  await vscode.window.showTextDocument(document, { preview: true })
}

async function showSummary(): Promise<void> {
  if (lastStatus === null || !lastStatus.running) {
    void vscode.window.showInformationMessage('LabWatch is not running.')
    return
  }
  await vscode.window.showInformationMessage(GpuNode.describe(lastStatus), { modal: true })
}

async function maybeAutoStart(): Promise<void> {
  if (lastStatus !== null && lastStatus.running) return
  if (lastProblem !== null) return
  await startInstance()
}
