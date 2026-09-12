/**
 * User-facing text for every state the extension can be in.
 *
 * Kept free of `vscode` imports so it is unit-testable under plain Node, and
 * bilingual because the project ships both languages. The rule is: a message
 * names what happened, what the user can do about it, and which of those actions
 * the extension will take for them.
 */

export type SetupState =
  /** A working CLI was found; nothing to say. */
  | 'ready'
  /** The managed environment is being created right now. */
  | 'provisioning'
  /** No CLI anywhere, but a suitable Python exists - one click fixes it. */
  | 'installable'
  /** No CLI and no usable Python; the user must install something themselves. */
  | 'no-python'
  /** A managed environment exists but is stale or broken. */
  | 'repair'
  /** Something failed and the reason is in `detail`. */
  | 'failed'

export interface Guidance {
  /** Status-bar text, VS Code icon syntax allowed. */
  statusBar: string
  /** Status-bar hover text. */
  tooltip: string
  /** One-line summary shown in the sidebar's welcome view. */
  headline: string
  /** Actionable lines under the headline, plain text (the view renders markdown). */
  steps: string[]
  /** Commands offered on the notification, in order. */
  actions: string[]
  /** Long-form markdown for the "How to connect" page. */
  markdown: string
}

const RELOAD = 'Ctrl+Shift+P → Developer: Reload Window'

/**
 * Guidance for a state. `detail` is appended to `failed` so the real error is
 * never swallowed - a "something went wrong" without the reason is worse than
 * useless.
 */
export function guidanceFor(state: SetupState, detail?: string): Guidance {
  switch (state) {
    case 'ready':
      return {
        statusBar: '$(pulse) LabWatch',
        tooltip: 'LabWatch — waiting for the first sample',
        headline: 'LabWatch is ready.',
        steps: ['Open the dashboard from the status bar, or run **LabWatch: Show GPU Summary**.'],
        actions: [],
        markdown: '',
      }

    case 'provisioning':
      return {
        statusBar: '$(sync~spin) LabWatch: setting up…',
        tooltip: 'LabWatch is creating a private environment. This happens once.',
        headline: 'Setting up LabWatch…',
        steps: ['Creating a private Python environment and installing the collector.'],
        actions: [],
        markdown: '',
      }

    case 'installable':
      return {
        statusBar: '$(plug) LabWatch: needs setup',
        tooltip:
          'LabWatch found Python but no collector. Click to create a private environment under this extension’s storage.',
        headline: 'One step left: install the LabWatch collector.',
        steps: [
          'This extension is the view; the collector is a small Python program that reads the GPUs.',
          'Python 3.10+ was found on this machine, so LabWatch can set it up privately — nothing global is touched.',
        ],
        actions: ['Set up LabWatch', 'Install manually', 'Not now'],
        markdown: '',
      }

    case 'no-python':
      return {
        statusBar: '$(circle-slash) LabWatch: no Python',
        tooltip: 'Python 3.10 or newer was not found. LabWatch needs it for the collector.',
        headline: 'Python 3.10+ not found.',
        steps: [
          'The collector is a Python program; the view has nothing to read without it.',
          'Install Python 3.10 or newer, then run **LabWatch: Set Up Collector** again.',
          'Already have it somewhere unusual? Point `labwatch.pythonPath` at it.',
        ],
        actions: ['How to connect', 'Open settings'],
        markdown: '',
      }

    case 'repair':
      return {
        statusBar: '$(tools) LabWatch: repair needed',
        tooltip: 'The private environment exists but the collector does not respond. Click to repair.',
        headline: 'The private environment needs repair.',
        steps: [
          'It was created earlier but `labwatch --version` no longer answers.',
          'Rebuilding it is safe: only this extension’s own folder is replaced.',
        ],
        actions: ['Repair LabWatch', 'Install manually', 'Not now'],
        markdown: '',
      }

    case 'failed':
      return {
        statusBar: '$(error) LabWatch: setup failed',
        tooltip: `Setup failed: ${detail ?? 'unknown error'}`,
        headline: 'Setting up the collector failed.',
        steps: [
          detail ?? 'No further detail was reported.',
          'The same commands work by hand if you prefer: `pipx install labwatch-lite`, or `uvx labwatch-lite` to run it once.',
          'A server without PyPI access can use `labwatch.pipIndexUrl` to point at a mirror.',
        ],
        actions: ['Run Doctor', 'How to connect', 'Copy install command'],
        markdown: '',
      }
  }
}

/** The command palette / manual path, shown by `How to connect`. */
export function connectionGuide(): string {
  return [
    '# Connecting the extension to a collector',
    '',
    'The extension is a **view**. The collector — a small Python program called',
    '`labwatch` — does the reading. One of the two situations below applies.',
    '',
    '## This machine can reach PyPI',
    '',
    'Run **LabWatch: Set Up Collector**. The extension creates a private',
    'environment inside its own storage folder and installs `labwatch-lite` there.',
    'Nothing global is installed and no `PATH` entry is added.',
    '',
    'Prefer to do it yourself? Any one of these works:',
    '',
    '```bash',
    'pipx install labwatch-lite     # a command on PATH: labwatch',
    'uvx labwatch-lite              # run once, install nothing',
    'pip install labwatch-lite      # then: python -m labwatch',
    '```',
    '',
    '> The distribution is `labwatch-lite` because `labwatch` on PyPI belongs to an',
    '> unrelated project. The command it installs is still `labwatch`.',
    '',
    '## This machine cannot reach PyPI',
    '',
    'A GPU server with no outbound access needs the dependency wheels brought in',
    'by hand. On a machine that does have access:',
    '',
    '```bash',
    'pip download labwatch-lite -d wheels',
    '```',
    '',
    'Copy `wheels/` to the server, then either install from it directly:',
    '',
    '```bash',
    'python3 -m venv ~/.labwatch/venv',
    '~/.labwatch/venv/bin/pip install --no-index --find-links wheels labwatch-lite',
    '```',
    '',
    'or serve it over HTTP and point the extension at it:',
    '',
    '```jsonc',
    '// settings.json',
    '"labwatch.pipIndexUrl": "http://mirror.internal/simple"',
    '```',
    '',
    '## Already running the collector elsewhere',
    '',
    'Set `labwatch.pythonPath` to whatever runs it — for example',
    '`/home/you/.conda/envs/mlenv/bin/python -m labwatch`. That setting is tried',
    'before anything else.',
    '',
    '## Remote-SSH',
    '',
    'The extension host runs on the server, so this whole page applies to the',
    'server: install there. The dashboard port is forwarded automatically when you',
    'open it, so nothing has to be exposed on the network.',
    '',
    '---',
    '',
    '重新加载窗口后生效：' + RELOAD,
  ].join('\n')
}

export function connectionGuideZh(): string {
  return [
    '# 让扩展连上采集器',
    '',
    '扩展只是**视图**；真正读数据的是一个叫 `labwatch` 的小型 Python 程序（采集器）。',
    '下面两种情况对号入座即可。',
    '',
    '## 这台机器能访问 PyPI',
    '',
    '执行 **LabWatch: Set Up Collector**（建立采集器环境）。扩展会在**自己的存储目录**里',
    '创建一个私有环境并安装 `labwatch-lite`，不写全局、不改 `PATH`。',
    '',
    '想自己装也可以，任选其一：',
    '',
    '```bash',
    'pipx install labwatch-lite     # 常驻命令：labwatch',
    'uvx labwatch-lite              # 只运行一次，不安装',
    'pip install labwatch-lite      # 之后：python -m labwatch',
    '```',
    '',
    '> 发行名是 `labwatch-lite`，因为 PyPI 上的 `labwatch` 属于另一个无关项目；',
    '> 它装出来的命令仍然是 `labwatch`。',
    '',
    '## 这台机器访问不了 PyPI',
    '',
    '没有外网的 GPU 服务器需要把依赖 wheel 带进来。先在一台有网的机器上：',
    '',
    '```bash',
    'pip download labwatch-lite -d wheels',
    '```',
    '',
    '把 `wheels/` 拷到服务器后，直接离线安装：',
    '',
    '```bash',
    'python3 -m venv ~/.labwatch/venv',
    '~/.labwatch/venv/bin/pip install --no-index --find-links wheels labwatch-lite',
    '```',
    '',
    '或者把它用 HTTP 暴露出来，让扩展指向它：',
    '',
    '```jsonc',
    '// settings.json',
    '"labwatch.pipIndexUrl": "http://mirror.internal/simple"',
    '```',
    '',
    '## 采集器已经在别处运行',
    '',
    '把 `labwatch.pythonPath` 指过去即可，例如',
    '`/home/you/.conda/envs/mlenv/bin/python -m labwatch`。该设置优先级最高。',
    '',
    '## Remote-SSH',
    '',
    '扩展宿主运行在服务器上，因此以上全部针对**服务器**：在服务器上安装。',
    '打开面板时端口会自动转发，无需对外暴露任何端口。',
    '',
    '---',
    '',
    '重新加载窗口后生效：' + RELOAD,
  ].join('\n')
}

/** The exact commands the "Install manually" action offers, copy-paste ready. */
export const MANUAL_COMMANDS = [
  'uvx labwatch-lite',
  'pipx install labwatch-lite',
  'pip install labwatch-lite',
]

export const MANUAL_COMMAND_TEXT = MANUAL_COMMANDS.join('    # or\n')
