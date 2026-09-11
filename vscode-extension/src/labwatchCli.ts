/**
 * Runs the LabWatch CLI and turns its JSON into typed state.
 *
 * The CLI is the single integration point on purpose: it already knows how to
 * find a running instance, and it exists on whichever machine the extension host
 * runs on. That is what makes this work identically over Remote-SSH — in a remote
 * workspace the extension host is the server, so `labwatch status` describes the
 * server's GPUs, not the laptop's.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { parseStatus, type LabwatchStatus } from './format'

const run = promisify(execFile)

/** How the CLI can be invoked, tried in order until one works. */
export interface CliCandidates {
  configured: string
}

export interface CliResult {
  ok: boolean
  status: LabwatchStatus | null
  /** The invocation that worked, remembered so later calls skip the probing. */
  command: string[] | null
  error: string | null
  stderr: string | null
}

const DEFAULT_CANDIDATES: string[][] = [
  ['labwatch'],
  ['python3', '-m', 'labwatch'],
  ['python', '-m', 'labwatch'],
]

/**
 * Resolve the CLI invocation.
 *
 * A missing CLI is the single most likely failure for a new user, so the error
 * message names all three installation commands rather than "command not found".
 */
export async function resolveCli(preferred: string, cache: CliCache): Promise<string[] | null> {
  if (cache.command !== null) return cache.command

  const candidates: string[][] = preferred.trim()
    ? [preferred.trim().split(/\s+/), ...DEFAULT_CANDIDATES]
    : [...DEFAULT_CANDIDATES]

  for (const candidate of candidates) {
    try {
      const { stdout } = await run(candidate[0], [...candidate.slice(1), 'version', '--json'], {
        timeout: 10_000,
        windowsHide: true,
      })
      if (stdout.includes('"version"') || /labwatch \d/.test(stdout)) {
        cache.command = candidate
        return candidate
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

export interface CliCache {
  command: string[] | null
}

export interface StatusOptions {
  preferredPython: string
  port: number
  cache: CliCache
  timeoutMs?: number
}

/** Read the current status. Never throws: failures come back as `ok: false`. */
export async function fetchStatus(options: StatusOptions): Promise<CliResult> {
  const { preferredPython, port, cache, timeoutMs = 15_000 } = options

  const command = await resolveCli(preferredPython, cache)
  if (command === null) {
    return {
      ok: false,
      status: null,
      command: null,
      error:
        'LabWatch CLI not found. Install it with "uvx labwatch", "pipx install labwatch" or "pip install labwatch", then set labwatch.pythonPath if it is not on PATH.',
      stderr: null,
    }
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
    return {
      ok: false,
      status: null,
      command,
      error: failure.message ?? 'labwatch status failed',
      stderr: failure.stderr?.trim() ?? null,
    }
  }
}

/** Run an arbitrary CLI subcommand, for the Start/Stop/Doctor commands. */
export async function runCliCommand(
  options: { preferredPython: string; port: number; cache: CliCache; args: string[]; timeoutMs?: number },
): Promise<{ ok: boolean; stdout: string; stderr: string; error: string | null }> {
  const command = await resolveCli(options.preferredPython, options.cache)
  if (command === null) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: 'LabWatch CLI not found. Install it with "uvx labwatch", "pipx install labwatch" or "pip install labwatch".',
    }
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
