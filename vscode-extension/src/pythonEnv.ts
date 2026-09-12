/**
 * Finding a usable Python and building a private environment for the collector.
 *
 * No `vscode` imports: everything here is plain Node and fully unit-testable, and
 * process execution is injected so tests never spawn anything.
 *
 * Why this exists. The extension is a view; the collector is a Python program.
 * Asking a user to run `pipx install labwatch-lite` before the sidebar shows
 * anything is a poor first minute, so the extension does it for them - into its
 * own storage folder, with no global installs and no `PATH` edits.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const defaultRun = promisify(execFile)

export interface RunOptions {
  timeout?: number
  cwd?: string
}

export interface RunOutput {
  stdout: string
  stderr: string
}

/** Either resolves with output or throws; implementations must not block forever. */
export type Runner = (file: string, args: string[], options?: RunOptions) => Promise<RunOutput>

export const nodeRunner: Runner = async (file, args, options) => {
  const { stdout, stderr } = await defaultRun(file, args, {
    timeout: options?.timeout ?? 120_000,
    cwd: options?.cwd,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  })
  return { stdout, stderr }
}

const MINIMUM = [3, 10] as const

/** `Python 3.11.14` -> `[3, 11, 14]`; anything else -> null. */
export function parsePythonVersion(output: string): [number, number, number] | null {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(output)
  if (match === null) return null
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
}

export function isSupported(version: [number, number, number] | null): boolean {
  if (version === null) return false
  const [major, minor] = version
  return major > MINIMUM[0] || (major === MINIMUM[0] && minor >= MINIMUM[1])
}

export interface PythonCandidate {
  command: string
  args: string[]
}

/**
 * Interpreters to try, in order. `py -3` is the Windows launcher, which is the
 * only reliable way to find a non-Store Python there; `python3` comes first on
 * POSIX, where `python` is often still Python 2 or absent entirely.
 */
export function pythonCandidates(platform: NodeJS.Platform = process.platform): PythonCandidate[] {
  if (platform === 'win32') {
    return [
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] },
    ]
  }
  return [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
  ]
}

export interface FoundPython extends PythonCandidate {
  version: [number, number, number]
  /** Version string exactly as the interpreter reported it. */
  raw: string
}

/**
 * First interpreter that both exists and is new enough. A present-but-too-old
 * Python is reported separately from no Python at all, because the advice differs.
 */
export async function findPython(
  run: Runner,
  platform: NodeJS.Platform = process.platform,
): Promise<{ found: FoundPython | null; sawTooOld: string | null }> {
  let sawTooOld: string | null = null

  for (const candidate of pythonCandidates(platform)) {
    try {
      const { stdout, stderr } = await run(candidate.command, [...candidate.args, '--version'], {
        timeout: 15_000,
      })
      const output = `${stdout} ${stderr}`.trim()
      const version = parsePythonVersion(output)
      if (version === null) continue
      if (!isSupported(version)) {
        // Remember it, but keep looking: another interpreter may be fine.
        sawTooOld ??= output
        continue
      }
      return { found: { ...candidate, version, raw: output }, sawTooOld }
    } catch {
      // Not installed under this name; try the next.
    }
  }
  return { found: null, sawTooOld }
}

/** Whether `python -m venv` can actually build an environment here. */
export async function hasVenvModule(python: FoundPython, run: Runner): Promise<boolean> {
  try {
    await run(python.command, [...python.args, '-c', 'import venv, ensurepip'], { timeout: 30_000 })
    return true
  } catch {
    return false
  }
}

export function venvPythonPath(venvDir: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32'
    ? `${venvDir}\\Scripts\\python.exe`
    : `${venvDir}/bin/python`
}

export interface SetupOutcome {
  ok: boolean
  /** Path to the venv's Python when it worked. */
  python: string | null
  /** Machine-readable reason when it did not. */
  reason:
    | 'ok'
    | 'no-python'
    | 'python-too-old'
    | 'no-venv-module'
    | 'create-failed'
    | 'install-failed'
    | 'verify-failed'
  /** Human-readable detail, safe to show. */
  detail: string
  /** Log lines, for the output channel. */
  log: string[]
}

export interface SetupOptions {
  venvDir: string
  distribution?: string
  indexUrl?: string
  platform?: NodeJS.Platform
  run?: Runner
}

/** `[3, 11, 4]` -> `cp311`, used in log lines to say which interpreter was chosen. */
export function abiTag(version: [number, number, number]): string {
  return `cp${version[0]}${version[1]}`
}

/**
 * Interpreters conda knows about, so a collector already installed in one of them
 * is found instead of a second one being built for no reason.
 *
 * People who configure Python day to day tend to keep their working environment in
 * conda, and `conda info --envs` is the only reliable way to learn its path: `PATH`
 * frequently points at `base`, which is not where anything is installed.
 *
 * Each line is `<name> <path>`, with the active environment marked `*` after the
 * name - `mlenv  *  /home/u/miniconda3/envs/mlenv`. The path is the last field, so
 * the whole line is not a path and must not be treated as one.
 */
export async function condaEnvironments(run: Runner): Promise<string[]> {
  try {
    const { stdout } = await run('conda', ['info', '--envs'], { timeout: 30_000 })
    const found: string[] = []
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const fields = trimmed.split(/\s+/)
      const candidate = fields[fields.length - 1]
      if (fields.length < 2 || candidate === '*' || candidate === '') continue
      if (candidate.startsWith('/') || /^[A-Za-z]:\\/.test(candidate)) found.push(candidate)
    }
    return found
  } catch {
    return []
  }
}

/**
 * Create `<venvDir>`, install the collector into it, and prove it answers.
 *
 * Unpinned deliberately: pip resolves whatever the machine can reach, and reuses
 * its own cache, so a second setup on the same host needs no network at all.
 */
export async function setupManagedEnvironment(options: SetupOptions): Promise<SetupOutcome> {
  const run = options.run ?? nodeRunner
  const platform = options.platform ?? process.platform
  const distribution = options.distribution ?? 'labwatch-lite'
  const log: string[] = []
  const note = (line: string): void => {
    log.push(line)
  }

  const { found, sawTooOld } = await findPython(run, platform)
  if (found === null) {
    const detail =
      sawTooOld === null
        ? 'No Python interpreter was found on PATH.'
        : `The only Python found is too old for LabWatch: ${sawTooOld}.`
    note(detail)
    return {
      ok: false,
      python: null,
      reason: sawTooOld === null ? 'no-python' : 'python-too-old',
      detail,
      log,
    }
  }
  note(`using ${found.raw} from ${[found.command, ...found.args].join(' ')}`)

  if (!(await hasVenvModule(found, run))) {
    const detail =
      `${found.raw} is present but its "venv" module is missing. ` +
      'On Debian and Ubuntu that is the python3-venv package.'
    note(detail)
    return { ok: false, python: null, reason: 'no-venv-module', detail, log }
  }

  try {
    note(`creating ${options.venvDir}`)
    await run(found.command, [...found.args, '-m', 'venv', options.venvDir], { timeout: 180_000 })
  } catch (error) {
    const detail = `Could not create a virtual environment: ${message(error)}`
    note(detail)
    return { ok: false, python: null, reason: 'create-failed', detail, log }
  }

  const python = venvPythonPath(options.venvDir, platform)
  const pipArgs = ['-m', 'pip', 'install', '--upgrade', '--disable-pip-version-check']
  if (options.indexUrl) {
    pipArgs.push('--index-url', options.indexUrl)
    note(`using index ${options.indexUrl}`)
  }
  pipArgs.push(distribution)

  try {
    note(`installing ${distribution}`)
    const { stdout } = await run(python, pipArgs, { timeout: 600_000 })
    note(stdout.trim().split('\n').slice(-2).join('\n'))
  } catch (error) {
    const detail =
      `Installing ${distribution} failed: ${message(error)}. If this machine uses an ` +
      'internal mirror, set `labwatch.pipIndexUrl`; if it already has a working ' +
      'collector, point `labwatch.pythonPath` at it instead — see "How to connect".'
    note(detail)
    return { ok: false, python: null, reason: 'install-failed', detail, log }
  }

  try {
    const { stdout } = await run(python, ['-m', 'labwatch', 'version', '--json'], { timeout: 60_000 })
    note(`verified: ${stdout.trim()}`)
  } catch (error) {
    const detail = `The environment was built but the collector does not run: ${message(error)}`
    note(detail)
    return { ok: false, python: null, reason: 'verify-failed', detail, log }
  }

  return { ok: true, python, reason: 'ok', detail: 'ready', log }
}

/** True when the managed environment exists and its collector answers. */
export async function managedEnvironmentWorks(
  venvDir: string,
  run: Runner,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  const python = venvPythonPath(venvDir, platform)
  try {
    const { stdout } = await run(python, ['-m', 'labwatch', 'version', '--json'], { timeout: 60_000 })
    return stdout.includes('"version"') || /labwatch \d/.test(stdout)
  } catch {
    return false
  }
}

/**
 * The useful part of a failed command.
 *
 * pip's explanation is usually on the line *before* the last one, ("ERROR: Could
 * not find a version…" followed by "ERROR: No matching distribution…"), so keeping
 * only the final line - or worse, Node's "Command failed: <the whole invocation>" -
 * throws away the one sentence that says what to do. The complete output still goes
 * to the output channel.
 */
function message(error: unknown): string {
  if (error === null || error === undefined) return 'unknown error'
  const failure = error as { stderr?: string; stdout?: string; message?: string }
  const lines = (text: string | undefined): string[] =>
    (text ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')

  const errors = lines(failure.stderr).filter((line) => /^ERROR|error:|No matching|not found|cannot|denied/i.test(line))
  if (errors.length > 0) {
    return errors.slice(0, 3).join(' · ')
  }
  const stderr = lines(failure.stderr)
  if (stderr.length > 0) return stderr.slice(-2).join(' · ')
  return failure.message ?? String(error)
}
