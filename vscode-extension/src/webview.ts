/**
 * The dashboard, inside the editor.
 *
 * A webview panel rather than a browser tab: the panel can be widened, maximised or
 * docked like any editor, and it removes the port-forwarding dance that Remote-SSH
 * needs for a browser. The sidebar stays what it is - the glanceable view - and this
 * is the detail view.
 *
 * The panel shows the *same* built dashboard the collector serves. It is not a
 * second implementation, which is why the numbers can never disagree with the
 * browser or the status bar.
 */

import { readFileSync, existsSync } from 'node:fs'
import * as path from 'node:path'

import * as vscode from 'vscode'

import { forwardApiRequest, type ApiRequestMessage } from './apiBridge'
import { buildWebviewShell } from './webviewHtml'

export interface DashboardPanelOptions {
  context: vscode.ExtensionContext
  port: number
  /** Shown in the panel title, so several hosts are distinguishable. */
  hostname?: string
  onBrowserFallback: () => void
  log: (line: string) => void
}

let current: vscode.WebviewPanel | undefined

/** Where the built dashboard lives inside the installed extension. */
export function dashboardDir(context: vscode.ExtensionContext): string {
  return path.join(context.extensionUri.fsPath, 'dashboard')
}

export function dashboardIsBundled(context: vscode.ExtensionContext): boolean {
  return existsSync(path.join(dashboardDir(context), 'index.html'))
}

/**
 * Open (or reveal) the dashboard panel.
 *
 * Revealing rather than spawning a second panel: two panels would poll the collector
 * twice and could show two different moments side by side, which is confusing in a
 * tool whose whole point is answering "what is happening right now".
 */
export function openDashboardPanel(options: DashboardPanelOptions): void {
  const title = options.hostname ? `LabWatch — ${options.hostname}` : 'LabWatch'

  if (current !== undefined) {
    current.title = title
    current.reveal(undefined, false)
    return
  }

  const dir = dashboardDir(options.context)
  const indexFile = path.join(dir, 'index.html')
  if (!existsSync(indexFile)) {
    options.log(`dashboard bundle not found at ${indexFile}`)
    void vscode.window
      .showErrorMessage(
        'This build of the extension has no bundled dashboard. · 这个扩展构建里没有打包面板。',
        'Open in browser',
      )
      .then((choice) => {
        if (choice === 'Open in browser') options.onBrowserFallback()
      })
    return
  }

  const panel = vscode.window.createWebviewPanel(
    'labwatch.dashboard',
    title,
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(dir)],
    },
  )
  current = panel

  panel.webview.html = buildWebviewShell({
    html: readFileSync(indexFile, 'utf8'),
    mapper: panel.webview,
    rootUri: panel.webview.asWebviewUri(vscode.Uri.file(dir)) as unknown as {
      path: string
      with(change: { path: string }): unknown
    },
    webviewCspSource: panel.webview.cspSource,
    port: options.port,
  })

  panel.webview.onDidReceiveMessage(
    async (message: ApiRequestMessage & { type?: string }) => {
      if (message?.type !== 'labwatch:api-request') return
      const response = await forwardApiRequest(message, options.port)
      if (response.error) {
        options.log(`[webview] ${message.method} ${message.path} failed: ${response.error}`)
      }
      void panel.webview.postMessage(response)
    },
    undefined,
    options.context.subscriptions,
  )

  panel.onDidDispose(
    () => {
      current = undefined
    },
    undefined,
    options.context.subscriptions,
  )
}

export function disposeDashboardPanel(): void {
  current?.dispose()
  current = undefined
}
