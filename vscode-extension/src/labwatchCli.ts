/**
 * Runs the LabWatch CLI and turns its JSON into typed state.
 *
 * The CLI is the single integration point on purpose: it already knows how to
 * find a running instance, and it exists on whichever machine the extension host
 * runs on. That is what makes this work identically over Remote-SSH — in a remote
 * workspace the extension host is the server, so `labwatch status` describes the
 * server's GPUs, not the laptop's.
 *
 * Resolution order, most specific first:
 *   1. `labwatch.pythonPath`, if the user set one;
 *   2. `labwatch` on PATH, which covers pipx / uv tool / a distro package;
 *   3. `python3 -m labwatch`, for a plain `pip install --user`;
 *   4. this extension's own private environment, if one has been created.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'

import { parseStatus, type LabwatchStatus } from './format'
import {
  findPython,
  managedEnvironmentWorks,
  nodeRunner,
  venvPythonPath,
  type Runner,
} from './pythonEnv'

const run = promisify(execFile)

/** Whether a private environment was created here before, working or not. */
export function venvPythonExists(venvDir: string, platform: NodeJS.Platform = process.platform): boolean {
  return venvDir !== '' && existsSync(venvPythonPath(venvDir, platform))
}

export interface CliCache {
  command: string[] | null
  /** Set when the managed environment has been located, to skip re-probing. */
  managedPython?: string | null
}

export interface CliResult {
  ok: boolean
  status: LabwatchStatus | null
  /** The invocation that worked, remembered so later calls skip the probing. */
  command: string[] | null
  error: string | null
  stderr: string | null
}

/** What the extension should tell the user, when the CLI cannot be found. */
export type CliTrouble = 'ok' | 'needs-setup' | 'needs-repair' | 'no-python' | 'unavailable'

export interface CliDiagnosis {
  trouble: CliTrouble
  /** Present when a CLI works. */
  command: string[] | null
  /** Human-readable reason for `trouble !== 'ok'`. */
  detail: string
}

export interface ResolveOptions {
  preferred: string
  /** Where a private environment would live; absolute. */
  venvDir: string
  cache: CliCache
  runner?: Runner
  platform?: NodeJS.Platform
}

function explicitCandidates(preferred: string): string[][] {
  const trimmed = preferred.trim()
  return trimmed ? [trimmed.split(/\s+/)] : []
}

/** Candidates that do not require the managed environment. */
export function systemCandidates(preferred: string): string[][] {
  return [
    ...explicitCandidates(preferred),
    ['labwatch'],
    ['python3', '-m', 'labwatch'],
    ['python', '-m', 'labwatch'],
  ]
}

async function respondsToVersion(
  runner: Runner,
  command: string[],
  timeout = 10_000,
): Promise<boolean> {
  try {
    const { stdout } = await runner(command[0], [...command.slice(1), 'version', '--json'], { timeout })
    return stdout.includes('"version"') || /labwatch \d/.test(stdout)
  } catch {
    return false
  }
}

/**
 * The Python of the private environment, if it exists and holds a working
 * collector. Cached, because this runs on every refresh.
 */
export async function managedPython(options: {
  venvDir: string
  cache: CliCache
  runner?: Runner
  platform?: NodeJS.Platform
}): Promise<string | null> {
  const runner = options.runner ?? nodeRunner
  const platform = options.platform ?? process.platform

  if (options.cache.managedPython !== undefined) {
    return options.cache.managedPython
  }
  const python = venvPythonPath(options.venvDir, platform)
  const works = await managedEnvironmentWorks(options.venvDir, runner, platform)
  options.cache.managedPython = works ? python : null
  return options.cache.managedPython
}

/**
 * Resolve the CLI invocation, or explain why none was found.
 *
 * The explanation is the point: "command not found" for a new user is a dead end,
 * while knowing that Python exists and one click will fix it is not.
 */
export async function diagnose(options: ResolveOptions): Promise<CliDiagnosis> {
  const runner = options.runner ?? nodeRunner
  const platform = options.platform ?? process.platform

  for (const candidate of systemCandidates(options.preferred)) {
    if (await respondsToVersion(runner, candidate)) {
      options.cache.command = candidate
      return { trouble: 'ok', command: candidate, detail: 'found on this machine' }
    }
  }

  const python = await managedPython({ ...options, runner, platform })
  if (python !== null) {
    const candidate = [python, '-m', 'labwatch']
    options.cache.command = candidate
    return { trouble: 'ok', command: candidate, detail: 'using the private environment' }
  }

  // Nothing works. Which advice applies depends on what is missing.
  const { found, sawTooOld } = await findPython(runner, platform)
  const venvExists = venvPythonExists(options.venvDir, platform)

  // A venv whose collector does not import is a failed install, not a mystery:
  // say so instead of offering to install something that is already there.
  const staleEnvironment = venvExists && !(await managedEnvironmentWorks(options.venvDir, runner, platform))
  if (staleEnvironment) {
    return {
      trouble: 'needs-repair',
      command: null,
      detail:
        'The private environment exists but the collector is not importable from it. ' +
        'Repairing rebuilds only this extension’s own folder.',
    }
  }
  if (found !== null) {
    return {
      trouble: 'needs-setup',
      command: null,
      detail: `Python ${found.version.join('.')} is available, so the collector can be installed privately.`,
    }
  }
  if (sawTooOld !== null) {
    return {
      trouble: 'needs-setup',
      command: null,
      detail: `The Python on PATH is too old (${sawTooOld}); LabWatch needs 3.10 or newer.`,
    }
  }
  return {
    trouble: 'no-python',
    command: null,
    detail: 'No Python interpreter was found on PATH.',
  }
}

/** Keep the old name meaningful for callers that only want the command. */
export async function resolveCli(preferred: string, cache: CliCache, venvDir = ''): Promise<string[] | null> {
  if (cache.command !== null) return cache.command
  const diagnosis = await diagnose({ preferred, venvDir, cache })
  return diagnosis.command
}

export interface StatusOptions {
  preferredPython: string
  port: number
  cache: CliCache
  venvDir: string
  timeoutMs?: number
  runner?: Runner
  platform?: NodeJS.Platform
}

/**
 * The last line of a stack trace, with the noise removed.
 *
 * A sidebar must not carry `/home/.../venv/bin/python -m labwatch status --port
 * 8123` followed by a Node error - the user needs the sentence, not the
 * invocation. The full text goes to the output channel.
 */
export function tidyError(text: string, limit = 160): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const meaningful =
    [...lines].reverse().find((line) => /error|not found|No module|Traceback|failed|cannot|denied/i.test(line)) ??
    lines[lines.length - 1] ??
    ''
  const cleaned = meaningful.replace(/^Command failed:\s*/i, '').replace(/\s+/g, ' ')
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}…` : cleaned
}

/** True when the collector simply is not importable from the environment used. */
export function looksUninstalled(text: string): boolean {
  return /No module named ['"]?labwatch|labwatch: command not found|not recognized as an internal/i.test(text)
}

/** Read the current status. Never throws: failures come back as `ok: false`. */
export async function fetchStatus(options: StatusOptions): Promise<CliResult> {
  const { preferredPython, port, cache, venvDir, timeoutMs = 15_000, runner, platform } = options

  const diagnosis = await diagnose({ preferred: preferredPython, venvDir, cache, runner, platform })
  const command = diagnosis.command
  if (command === null) {
    return { ok: false, status: null, command: null, error: diagnosis.detail, stderr: null }
  }

  try {
    const { stdout, stderr } = await run(
      command[0],
      [...command.slice(1), 'status', '--json', '--port', String(port)],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    )
    const status = parseStatus(stdout)
    if (status === null) {
      return { ok: false, status: null, command, error: 'Could not parse "labwatch status" output.', stderr }
    }
    return { ok: true, status, command, error: null, stderr: stderr.trim() || null }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string; code?: number }
    // `labwatch status` exits 3 when nothing is running, and still prints valid
    // JSON on stdout. That is a normal state, not an error.
    const status = failure.stdout ? parseStatus(failure.stdout) : null
    if (status !== null) {
      return { ok: true, status, command, error: null, stderr: null }
    }
    // A bare "the collector is not installed" must not read as a crash.
    const combined = `${failure.stderr ?? ''}\n${failure.message ?? ''}`
    const error_ = looksUninstalled(combined)
      ? 'The collector is not available from the environment this extension resolved.'
      : tidyError(combined) || 'labwatch status failed'
    return { ok: false, status: null, command, error: error_, stderr: failure.stderr?.trim() ?? null }
  }
}

/** Run an arbitrary CLI subcommand, for the Start/Stop/Doctor commands. */
export async function runCliCommand(options: {
  preferredPython: string
  port: number
  cache: CliCache
  venvDir: string
  args: string[]
  timeoutMs?: number
  runner?: Runner
  platform?: NodeJS.Platform
}): Promise<{ ok: boolean; stdout: string; stderr: string; error: string | null }> {
  const diagnosis = await diagnose({
    preferred: options.preferredPython,
    venvDir: options.venvDir,
    cache: options.cache,
    runner: options.runner,
    platform: options.platform,
  })
  const command = diagnosis.command
  if (command === null) {
    return { ok: false, stdout: '', stderr: '', error: diagnosis.detail }
  }
  try {
    const { stdout, stderr } = await run(
      command[0],
      [...command.slice(1), ...options.args, '--port', String(options.port)],
      { timeout: options.timeoutMs ?? 60_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    )
    return { ok: true, stdout, stderr, error: null }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string }
    return {
      ok: false,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      error: failure.message ?? 'command failed',
    }
  }
}
