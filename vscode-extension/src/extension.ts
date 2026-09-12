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
 *
 * The collector is a Python program, which is the one thing the Marketplace's
 * usual "install and it runs" expectation does not cover. So the extension
 * resolves it, and when it is missing it offers to build a private environment
 * inside its own storage - no global installs, no PATH edits.
 */

import * as path from 'node:path'

import * as vscode from 'vscode'

import { parseStatus, statusBarText, statusBarTooltip, type LabwatchStatus } from './format'
import { GpuNode, GpuTreeProvider } from './gpuTree'
import {
  connectionGuide,
  connectionGuideZh,
  guidanceFor,
  MANUAL_COMMAND_TEXT,
  type Guidance,
  type SetupState,
} from './guidance'
import {
  diagnose,
  looksUninstalled,
  runCliCommand,
  tidyError,
  type CliCache,
  type CliTrouble,
} from './labwatchCli'
import { setupManagedEnvironment, type SetupOutcome } from './pythonEnv'

const cache: CliCache = { command: null }
const ASKED_KEY = 'labwatch.setup.asked'

let statusBar: vscode.StatusBarItem
let treeProvider: GpuTreeProvider
let output: vscode.OutputChannel
let contextRef: vscode.ExtensionContext
let timer: NodeJS.Timeout | undefined
let lastStatus: LabwatchStatus | null = null
let lastProblem = ''
let setupState: SetupState = 'ready'
let setupInFlight = false

export function activate(context: vscode.ExtensionContext): void {
  contextRef = context
  output = vscode.window.createOutputChannel('LabWatch')
  context.subscriptions.push(output)

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
    vscode.commands.registerCommand('labwatch.setup', () => setupCollector()),
    vscode.commands.registerCommand('labwatch.showManualSteps', () => showManualSteps()),
    vscode.commands.registerCommand('labwatch.showGuide', () => showGuide()),
    vscode.commands.registerCommand('labwatch.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'labwatch'),
    ),
  )

  configureRefresh()

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('labwatch.refreshInterval') ||
        event.affectsConfiguration('labwatch.pythonPath') ||
        event.affectsConfiguration('labwatch.pipIndexUrl') ||
        event.affectsConfiguration('labwatch.statusBar')
      ) {
        resetResolution()
        configureRefresh()
      }
    }),
  )

  void refresh({ silent: true }).then(() => maybeOfferSetup())

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

function resetResolution(): void {
  cache.command = null
  cache.managedPython = undefined
}

/** Read the setup state without letting the compiler narrow it across awaits. */
function stateNow(): SetupState {
  return setupState
}

/** The private environment lives inside the extension's own storage folder. */
function venvDir(): string {
  return path.join(contextRef.globalStorageUri.fsPath, 'venv')
}

function configureRefresh(): void {
  if (timer) clearInterval(timer)
  const seconds = Math.max(1, config().get<number>('refreshInterval', 5))
  timer = setInterval(() => void refresh({ silent: true }), seconds * 1000)
  if (statusBar && setupState === 'ready') {
    statusBar.tooltip = `LabWatch — refreshing every ${seconds}s`
  }
}

interface RefreshOptions {
  silent?: boolean
}

const TROUBLE_TO_STATE: Record<CliTrouble, SetupState> = {
  ok: 'ready',
  'needs-setup': 'installable',
  'needs-repair': 'repair',
  'no-python': 'no-python',
  unavailable: 'failed',
}

async function refresh(options: RefreshOptions = {}): Promise<void> {
  const result = await diagnose({
    preferred: config().get<string>('pythonPath', ''),
    venvDir: venvDir(),
    cache,
  })

  if (result.command === null) {
    // No usable collector: the sidebar explains which state it is in and offers
    // the action that resolves it.
    lastStatus = null
    lastProblem = result.detail
    setupState = setupInFlight ? 'provisioning' : TROUBLE_TO_STATE[result.trouble]
    render()
    if (setupState === 'failed' && !options.silent && lastProblem !== '') {
      void vscode.window.showWarningMessage(`LabWatch: ${lastProblem}`)
    }
    return
  }

  // A collector exists, so anything that goes wrong from here concerns the running
  // instance rather than the installation. Reporting these as "setup needs
  // attention" was the bug that told a working environment it was broken.
  const statusResult = await readStatus()
  lastStatus = statusResult.status
  setupState = 'ready'
  lastProblem = statusResult.ok ? '' : (statusResult.error ?? 'labwatch status failed')

  if (lastProblem !== '') {
    output.appendLine(`[refresh] ${lastProblem}`)
    if (statusResult.stderr) output.appendLine(statusResult.stderr)
  }

  render()

  if (!statusResult.ok && !options.silent && lastProblem !== '') {
    void vscode.window.showWarningMessage(`LabWatch: ${lastProblem}`)
  }
}

async function readStatus(): Promise<{
  ok: boolean
  status: LabwatchStatus | null
  error?: string
  stderr?: string
}> {
  const port = config().get<number>('dashboardPort', 8123)
  const result = await runCliCommand({
    preferredPython: config().get<string>('pythonPath', ''),
    port,
    cache,
    venvDir: venvDir(),
    args: ['status'],
    timeoutMs: 15_000,
  })
  // `labwatch status` exits 3 when the collector is simply not running, and still
  // prints valid JSON, so a non-zero exit is not by itself a problem.
  const parsed = result.stdout.trim() ? parseStatus(result.stdout) : null
  if (parsed !== null) return { ok: true, status: parsed }
  const stderr = result.stderr.trim()
  const error = looksUninstalled(`${stderr}\n${result.error ?? ''}`)
    ? 'The collector is installed but not importable; repairing the environment fixes it.'
    : tidyError(stderr || result.error || 'labwatch status failed')
  return { ok: false, status: null, error, stderr }
}

function render(): void {
  const guidance: Guidance = guidanceFor(setupState, lastProblem)

  if (config().get<boolean>('statusBar', true)) {
    if (setupState === 'ready') {
      statusBar.text = statusBarText(lastStatus, false)
      statusBar.tooltip = statusBarTooltip(lastStatus)
      // Clicking is the obvious next step: open the dashboard when there is one,
      // start the collector when there is not.
      statusBar.command = lastStatus?.running ? 'labwatch.openDashboard' : 'labwatch.start'
    } else {
      statusBar.text = guidance.statusBar
      statusBar.tooltip = guidance.tooltip
      statusBar.command =
        setupState === 'installable' || setupState === 'repair' ? 'labwatch.setup' : 'labwatch.showGuide'
    }
    statusBar.show()
  } else {
    statusBar.hide()
  }

  treeProvider.update({ status: lastStatus, problem: lastProblem, setup: setupState })
}

/**
 * Offer to build the private environment, at most once per install unless the
 * user asks again. Installing into someone's home directory without asking would
 * be rude; asking every activation would be worse.
 */
async function maybeOfferSetup(): Promise<void> {
  if (setupState !== 'installable' && setupState !== 'repair') return
  if (!config().get<boolean>('autoSetup', true)) return
  if (contextRef.globalState.get<boolean>(ASKED_KEY, false)) return
  await contextRef.globalState.update(ASKED_KEY, true)
  await offerSetup(setupState === 'repair' ? 'repair' : 'setup')
}

async function offerSetup(kind: 'setup' | 'repair'): Promise<void> {
  const guidance = guidanceFor(kind === 'repair' ? 'repair' : 'installable')
  const choice = await vscode.window.showInformationMessage(
    `${guidance.headline} ${guidance.steps[guidance.steps.length - 1]}`,
    ...guidance.actions,
  )
  if (choice === guidance.actions[0]) await setupCollector()
  else if (choice === 'Install manually') await showManualSteps()
}

async function setupCollector(): Promise<void> {
  if (setupInFlight) return
  setupInFlight = true
  setupState = 'provisioning'
  render()

  let outcome: SetupOutcome | undefined
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'LabWatch: setting up the collector',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'looking for Python 3.10+…' })
      outcome = await setupManagedEnvironment({
        venvDir: venvDir(),
        indexUrl: config().get<string>('pipIndexUrl', '') || undefined,
        // Wheels shipped inside the VSIX: the route that works on a server with no
        // outbound access.
        bundledWheelsDir: path.join(contextRef.extensionUri.fsPath, 'wheels'),
      })
      for (const line of outcome.log) output.appendLine(line)
    },
  )

  setupInFlight = false
  resetResolution()

  if (outcome === undefined) {
    setupState = 'failed'
    lastProblem = 'setup produced no result'
    render()
    return
  }

  if (outcome.ok) {
    output.appendLine(`collector ready at ${outcome.python}`)
    const settled = await refresh({ silent: true })
    void settled
    if (stateNow() === 'ready') {
      void vscode.window.showInformationMessage(
        'LabWatch collector installed. Start it with the status bar, or run LabWatch: Start in Background. · 采集器已装好，点状态栏即可启动。',
      )
    }
    return
  }

  setupState = outcome.reason === 'no-python' || outcome.reason === 'python-too-old' ? 'no-python' : 'failed'
  lastProblem = outcome.detail
  render()

  const choice = await vscode.window.showErrorMessage(`LabWatch: ${outcome.detail}`, 'How to connect', 'Copy install command')
  if (choice === 'How to connect') await showGuide()
  if (choice === 'Copy install command') {
    await vscode.env.clipboard.writeText(MANUAL_COMMAND_TEXT)
    void vscode.window.showInformationMessage('Install commands copied.')
  }
}

async function showManualSteps(): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    'Install the collector yourself, then reload the window. · 自行安装采集器后重新加载窗口。',
    { modal: true, detail: MANUAL_COMMAND_TEXT },
    'Copy commands',
    'How to connect',
  )
  if (choice === 'Copy commands') {
    await vscode.env.clipboard.writeText(MANUAL_COMMAND_TEXT)
    void vscode.window.showInformationMessage('Install commands copied to the clipboard.')
  }
  if (choice === 'How to connect') await showGuide()
}

async function showGuide(): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: `${connectionGuide()}\n\n${connectionGuideZh()}`,
    language: 'markdown',
  })
  await vscode.window.showTextDocument(document, { preview: true })
}

async function openDashboard(): Promise<void> {
  const port = config().get<number>('dashboardPort', 8123)

  if (lastStatus === null || !lastStatus.running) {
    const choice = await vscode.window.showInformationMessage(
      'LabWatch is not running yet. · LabWatch 尚未运行。',
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
        venvDir: venvDir(),
        args: ['start', '--host', '127.0.0.1'],
      })
      if (!result.ok) {
        const detail = result.stderr || result.error || 'unknown error'
        const action = await vscode.window.showErrorMessage(
          `LabWatch failed to start: ${detail} · 启动失败`,
          'Run Doctor',
          'How to connect',
        )
        if (action === 'Run Doctor') await runDoctor()
        if (action === 'How to connect') await showGuide()
        return
      }
      await refresh({ silent: true })
      void vscode.window.showInformationMessage('LabWatch started. · 已启动')
    },
  )
}

async function stopInstance(): Promise<void> {
  const port = config().get<number>('dashboardPort', 8123)
  const result = await runCliCommand({
    preferredPython: config().get<string>('pythonPath', ''),
    port,
    cache,
    venvDir: venvDir(),
    args: ['stop'],
  })
  await refresh({ silent: true })
  if (result.ok) void vscode.window.showInformationMessage('LabWatch stopped. · 已停止')
  else void vscode.window.showWarningMessage(result.stderr || result.error || 'Could not stop LabWatch.')
}

async function runDoctor(): Promise<void> {
  const port = config().get<number>('dashboardPort', 8123)
  const result = await runCliCommand({
    preferredPython: config().get<string>('pythonPath', ''),
    port,
    cache,
    venvDir: venvDir(),
    args: ['doctor'],
    timeoutMs: 60_000,
  })
  const output_ = result.stdout || result.stderr || result.error || 'no output'
  const document = await vscode.workspace.openTextDocument({ content: output_, language: 'text' })
  await vscode.window.showTextDocument(document, { preview: true })
}

async function showSummary(): Promise<void> {
  if (lastStatus === null || !lastStatus.running) {
    const guidance = guidanceFor(setupState, lastProblem)
    void vscode.window.showInformationMessage(
      `${guidance.headline} ${guidance.steps[0] ?? ''}`.trim(),
      ...guidance.actions,
    )
    return
  }
  await vscode.window.showInformationMessage(GpuNode.describe(lastStatus), { modal: true })
}

async function maybeAutoStart(): Promise<void> {
  if (setupState !== 'ready') return
  if (lastStatus !== null && lastStatus.running) return
  await startInstance()
}
