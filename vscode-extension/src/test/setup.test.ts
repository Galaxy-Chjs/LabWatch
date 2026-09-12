/**
 * Unit tests for the setup logic.
 *
 * These run under plain Node 閳?no VS Code host 閳?which is why `pythonEnv.ts`,
 * `guidance.ts` and the resolution helpers in `labwatchCli.ts` keep their `vscode`
 * dependencies out. Every process is faked, so the suite never spawns Python and
 * never touches the network.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { guidanceFor, connectionGuide, MANUAL_COMMANDS } from '../guidance'
import { actionsFor, NOT_RUNNING_ACTIONS } from '../stateActions'
import { diagnose, looksUninstalled, tidyError } from '../labwatchCli'
import {
  condaEnvironments,
  findPython,
  isSupported,
  managedEnvironmentWorks,
  parsePythonVersion,
  pythonCandidates,
  setupManagedEnvironment,
  venvPythonPath,
  type RunOutput,
  type Runner,
} from '../pythonEnv'

/** A runner driven by a table of responses; records what was asked. */
function fakeRunner(
  respond: (file: string, args: string[]) => RunOutput | Error,
): { run: Runner; calls: string[][] } {
  const calls: string[][] = []
  const run: Runner = async (file, args) => {
    const call = [file, ...args]
    calls.push(call)
    const result = respond(file, args)
    if (result instanceof Error) throw result
    return result
  }
  return { run, calls }
}

const VERSION_JSON = '{"name": "labwatch-lite", "version": "1.1.0"}'

test('parsePythonVersion reads the usual shapes', () => {
  assert.deepEqual(parsePythonVersion('Python 3.11.14'), [3, 11, 14])
  assert.deepEqual(parsePythonVersion('Python 3.10'), [3, 10, 0])
  assert.deepEqual(parsePythonVersion('  Python 3.12.7  '), [3, 12, 7])
  assert.equal(parsePythonVersion('command not found'), null)
})

test('the floor is 3.10 and it is enforced', () => {
  assert.equal(isSupported([3, 10, 0]), true)
  assert.equal(isSupported([3, 9, 18]), false)
  assert.equal(isSupported([2, 7, 18]), false)
  assert.equal(isSupported([4, 0, 0]), true)
  assert.equal(isSupported(null), false)
})

test('POSIX tries python3 before python; Windows uses the launcher first', () => {
  assert.deepEqual(
    pythonCandidates('linux').map((c) => c.command),
    ['python3', 'python'],
  )
  assert.equal(pythonCandidates('win32')[0].command, 'py')
})

test('findPython skips an old interpreter and takes the next usable one', async () => {
  const { run, calls } = fakeRunner((file) => {
    if (file === 'python3') return { stdout: 'Python 3.8.10', stderr: '' }
    return { stdout: 'Python 3.11.14', stderr: '' }
  })
  const { found, sawTooOld } = await findPython(run, 'linux')
  assert.equal(found?.command, 'python')
  assert.equal(found?.version.join('.'), '3.11.14')
  assert.match(sawTooOld ?? '', /3\.8\.10/)
  assert.deepEqual(calls[0], ['python3', '--version'])
})

test('findPython reports no Python at all without inventing one', async () => {
  const { run } = fakeRunner(() => new Error('ENOENT'))
  const { found, sawTooOld } = await findPython(run, 'linux')
  assert.equal(found, null)
  assert.equal(sawTooOld, null)
})

test('venv paths follow the platform', () => {
  assert.equal(venvPythonPath('/home/u/.labwatch/venv', 'linux'), '/home/u/.labwatch/venv/bin/python')
  assert.equal(venvPythonPath('C:\\Users\\u\\venv', 'win32'), 'C:\\Users\\u\\venv\\Scripts\\python.exe')
})

test('setup installs into the venv and verifies the collector answers', async () => {
  const { run, calls } = fakeRunner((file, args) => {
    if (args.includes('--version')) return { stdout: 'Python 3.11.14', stderr: '' }
    if (args.includes('import venv, ensurepip')) return { stdout: '', stderr: '' }
    if (args.includes('venv')) return { stdout: '', stderr: '' }
    if (args.includes('install')) return { stdout: 'Successfully installed labwatch-lite-1.1.0', stderr: '' }
    if (args.includes('version')) return { stdout: VERSION_JSON, stderr: '' }
    return new Error(`unexpected call: ${file} ${args.join(' ')}`)
  })

  const outcome = await setupManagedEnvironment({ venvDir: '/tmp/lw-venv', platform: 'linux', run })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.python, '/tmp/lw-venv/bin/python')
  assert.ok(calls.some((call) => call.join(' ').includes('install --upgrade')), 'pip install was run')
  assert.ok(calls.some((call) => call.join(' ').includes('-m labwatch version --json')), 'install was verified')
})

test('setup honours a custom index URL for machines that cannot reach PyPI', async () => {
  const { run, calls } = fakeRunner((_file, args) => {
    if (args.includes('--version')) return { stdout: 'Python 3.11.14', stderr: '' }
    if (args.includes('install')) return { stdout: 'ok', stderr: '' }
    if (args.includes('version')) return { stdout: VERSION_JSON, stderr: '' }
    return { stdout: '', stderr: '' }
  })
  await setupManagedEnvironment({
    venvDir: '/tmp/lw-venv',
    platform: 'linux',
    run,
    indexUrl: 'http://mirror.internal/simple',
  })
  const install = calls.find((call) => call.includes('install'))
  assert.ok(install?.join(' ').includes('--index-url http://mirror.internal/simple'))
})

test('setup stops with no-python rather than a vague failure', async () => {
  const { run } = fakeRunner(() => new Error('ENOENT'))
  const outcome = await setupManagedEnvironment({ venvDir: '/tmp/lw-venv', platform: 'linux', run })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.reason, 'no-python')
})

test('a too-old Python is reported as its own reason, with the version', async () => {
  const { run } = fakeRunner(() => ({ stdout: 'Python 3.8.10', stderr: '' }))
  const outcome = await setupManagedEnvironment({ venvDir: '/tmp/lw-venv', platform: 'linux', run })
  assert.equal(outcome.reason, 'python-too-old')
  assert.match(outcome.detail, /3\.8\.10/)
})

test('a Python without the venv module names the package to install', async () => {
  const { run } = fakeRunner((_file, args) => {
    if (args.includes('--version')) return { stdout: 'Python 3.11.14', stderr: '' }
    return new Error('No module named venv')
  })
  const outcome = await setupManagedEnvironment({ venvDir: '/tmp/lw-venv', platform: 'linux', run })
  assert.equal(outcome.reason, 'no-venv-module')
  assert.match(outcome.detail, /python3-venv/)
})

test('a failed install is reported with the offline route mentioned', async () => {
  const { run } = fakeRunner((_file, args) => {
    if (args.includes('--version')) return { stdout: 'Python 3.11.14', stderr: '' }
    if (args.includes('install')) throw Object.assign(new Error('pip failed'), { stderr: 'ERROR: No matching distribution' })
    return { stdout: '', stderr: '' }
  })
  const outcome = await setupManagedEnvironment({ venvDir: '/tmp/lw-venv', platform: 'linux', run })
  assert.equal(outcome.reason, 'install-failed')
  // Both escape routes are named, because either may be the right one: a mirror,
  // or a collector that already works somewhere the user chose.
  assert.match(outcome.detail, /pipIndexUrl/)
  assert.match(outcome.detail, /pythonPath/)
  assert.match(outcome.detail, /No matching distribution/)
})

test('the reason survives: pip says what is wrong, and that is what is shown', async () => {
  // The screenshot that started this investigation showed only
  // "Command failed: <the whole command line>" - unfixable from the outside. pip
  // puts the useful sentence on its own line, and not always the last one.
  const stderr = [
    'ERROR: Could not find a version that satisfies the requirement labwatch-lite (from versions: none)',
    'ERROR: No matching distribution found for labwatch-lite',
    'WARNING: You are using pip version 22.0.4; however, version 24.3.1 is available.',
  ].join('\n')
  const { run } = fakeRunner((_file, args) => {
    if (args.includes('--version')) return { stdout: 'Python 3.11.14', stderr: '' }
    if (args.includes('install')) {
      throw Object.assign(new Error('Command failed: /venv/bin/python -m pip install labwatch-lite'), { stderr })
    }
    return { stdout: '', stderr: '' }
  })
  const outcome = await setupManagedEnvironment({ venvDir: '/tmp/lw-venv', platform: 'linux', run })
  assert.equal(outcome.reason, 'install-failed')
  assert.match(outcome.detail, /Could not find a version/)
  assert.match(outcome.detail, /No matching distribution/)
  assert.equal(outcome.detail.includes('Command failed'), false)
  // The full output still reaches the log, which is what the output channel shows.
  assert.ok(outcome.log.some((line) => line.includes('No matching distribution')))
})

test('managedEnvironmentWorks is false when the interpreter is gone', async () => {
  const { run } = fakeRunner(() => new Error('ENOENT'))
  assert.equal(await managedEnvironmentWorks('/tmp/lw-venv', run, 'linux'), false)
})

test('a collector on PATH wins, and the venv is not consulted', async () => {
  const { run, calls } = fakeRunner((file, args) => {
    if (file === 'labwatch' && args.includes('--json')) return { stdout: VERSION_JSON, stderr: '' }
    return new Error('ENOENT')
  })
  const cache = { command: null } as { command: string[] | null; managedPython?: string | null }
  const result = await diagnose({
    preferred: '',
    venvDir: '/tmp/lw-venv',
    cache,
    runner: run,
    platform: 'linux',
  })
  assert.equal(result.trouble, 'ok')
  assert.deepEqual(result.command, ['labwatch'])
  assert.equal(
    calls.some((call) => call[0].startsWith('/tmp/lw-venv')),
    false,
  )
})

test('pythonPath is tried before anything else', async () => {
  const { run, calls } = fakeRunner((file) =>
    file === '/opt/mlenv/bin/python' ? { stdout: VERSION_JSON, stderr: '' } : new Error('ENOENT'),
  )
  const cache: { command: string[] | null } = { command: null }
  const result = await diagnose({
    preferred: '/opt/mlenv/bin/python -m labwatch',
    venvDir: '/tmp/lw-venv',
    cache,
    runner: run,
    platform: 'linux',
  })
  assert.equal(result.trouble, 'ok')
  assert.deepEqual(calls[0].slice(0, 3), ['/opt/mlenv/bin/python', '-m', 'labwatch'])
})

test('the private environment is used when there is nothing on PATH', async () => {
  const { run } = fakeRunner((file, args) => {
    if (file === '/tmp/lw-venv/bin/python' && args.includes('version')) return { stdout: VERSION_JSON, stderr: '' }
    return new Error('ENOENT')
  })
  const cache: { command: string[] | null } = { command: null }
  const result = await diagnose({
    preferred: '',
    venvDir: '/tmp/lw-venv',
    cache,
    runner: run,
    platform: 'linux',
  })
  assert.equal(result.trouble, 'ok')
  assert.deepEqual(result.command, ['/tmp/lw-venv/bin/python', '-m', 'labwatch'])
})

test('nothing found, but Python available: the answer is needs-setup', async () => {
  const { run } = fakeRunner((file, args) => {
    if (file === 'python3' && args.includes('--version')) return { stdout: 'Python 3.11.14', stderr: '' }
    return new Error('ENOENT')
  })
  const cache: { command: string[] | null } = { command: null }
  const result = await diagnose({
    preferred: '',
    venvDir: '/tmp/lw-venv',
    cache,
    runner: run,
    platform: 'linux',
  })
  assert.equal(result.trouble, 'needs-setup')
  assert.match(result.detail, /3\.11\.14/)
})

test('no Python at all is its own answer, not needs-setup', async () => {
  const { run } = fakeRunner(() => new Error('ENOENT'))
  const cache: { command: string[] | null } = { command: null }
  const result = await diagnose({
    preferred: '',
    venvDir: '/tmp/lw-venv',
    cache,
    runner: run,
    platform: 'linux',
  })
  assert.equal(result.trouble, 'no-python')
})

test('every state produces actionable text, never an empty instruction', () => {
  for (const state of ['ready', 'provisioning', 'installable', 'no-python', 'repair', 'failed'] as const) {
    const guidance = guidanceFor(state)
    assert.ok(guidance.statusBar.length > 0, `${state} needs status-bar text`)
    assert.ok(guidance.tooltip.length > 0, `${state} needs a tooltip`)
    assert.ok(guidance.headline.length > 0, `${state} needs a headline`)
    assert.ok(guidance.steps.length > 0, `${state} needs at least one step`)
  }
})

test('the failure state shows the real reason rather than a generic apology', () => {
  const guidance = guidanceFor('failed', 'pip: no matching distribution')
  assert.match(guidance.tooltip, /no matching distribution/)
  assert.match(guidance.steps[0], /no matching distribution/)
})

test('conda environments are discovered, and a broken conda is not fatal', async () => {
  const { run } = fakeRunner((file, args) => {
    if (file === 'conda' && args.includes('--envs')) {
      return {
        stdout: [
          '# conda environments:',
          '#',
          'base                     /home/u/miniconda3',
          'mlenv                 *  /home/u/miniconda3/envs/mlenv',
          '',
        ].join('\n'),
        stderr: '',
      }
    }
    return new Error('ENOENT')
  })
  const envs = await condaEnvironments(run)
  // The trailing asterisk marks the active environment and is not part of its path.
  assert.deepEqual(envs, ['/home/u/miniconda3', '/home/u/miniconda3/envs/mlenv'])

  const { run: broken } = fakeRunner(() => new Error('conda: command not found'))
  assert.deepEqual(await condaEnvironments(broken), [])
})

test('a collector inside a conda environment is used instead of building a new one', async () => {
  const { run, calls } = fakeRunner((file, args) => {
    if (file === 'conda' && args.includes('--envs')) {
      return { stdout: 'base  /home/u/miniconda3\nmlenv  /home/u/miniconda3/envs/mlenv\n', stderr: '' }
    }
    if (file === '/home/u/miniconda3/envs/mlenv/bin/python' && args.includes('version')) {
      return { stdout: VERSION_JSON, stderr: '' }
    }
    return new Error('ENOENT')
  })
  const cache: { command: string[] | null } = { command: null }
  const result = await diagnose({
    preferred: '',
    venvDir: '/tmp/lw-venv',
    cache,
    runner: run,
    platform: 'linux',
  })
  assert.equal(result.trouble, 'ok')
  assert.deepEqual(result.command, ['/home/u/miniconda3/envs/mlenv/bin/python', '-m', 'labwatch'])
  assert.match(result.detail, /conda environment/)
  // Nothing was installed: the private environment was never needed.
  assert.equal(
    calls.some((call) => call.join(' ').includes('venv')),
    false,
  )
})

test('the connection guide covers all four routes and both languages', () => {
  const guide = connectionGuide()
  for (const command of MANUAL_COMMANDS) {
    assert.ok(guide.includes(command), `guide mentions ${command}`)
  }
  assert.match(guide, /pip download labwatch-lite/)
  assert.match(guide, /pipIndexUrl/)
  assert.match(guide, /pythonPath/)
  assert.match(guide, /Remote-SSH/)
})

test('tidyError keeps the sentence and drops the invocation', () => {
  const raw = [
    'Command failed: /home/u/.vscode-server/data/User/globalStorage/x/venv/bin/python -m labwatch status --port 8123',
    '',
    'Traceback (most recent call last):',
    'ModuleNotFoundError: No module named labwatch',
  ].join('\n')
  const tidied = tidyError(raw)
  assert.match(tidied, /No module named labwatch/)
  assert.equal(tidied.includes('vscode-server'), false)
  assert.equal(tidied.includes('\n'), false)
})

test('tidyError truncates rather than letting the sidebar stretch', () => {
  const tidied = tidyError(`error: ${'x'.repeat(400)}`, 60)
  assert.equal(tidied.length, 60)
  assert.ok(tidied.endsWith('…'))
})

test('an unimportable collector is recognised as such, not as a crash', () => {
  assert.equal(looksUninstalled('ModuleNotFoundError: No module named labwatch'), true)
  assert.equal(looksUninstalled('labwatch: command not found'), true)
  assert.equal(looksUninstalled('Connection refused while polling'), false)
})

test('every setup state offers at least one way out, and starts with the fix', () => {  const expected: Record<string, string> = {
    installable: 'labwatch.setup',
    repair: 'labwatch.setup',
    'no-python': 'labwatch.showGuide',
    failed: 'labwatch.doctor',
  }
  for (const [state, command] of Object.entries(expected)) {
    const actions = actionsFor(state as never)
    assert.ok(actions.length > 0, `${state} needs actions`)
    assert.equal(actions[0].command, command, `${state} should lead with its fix`)
    for (const action of actions) {
      assert.ok(action.label.length > 0, `${state} action needs a label`)
      assert.match(action.command, /^labwatch\./)
    }
  }
  assert.equal(actionsFor('ready').length, 0)
  assert.equal(NOT_RUNNING_ACTIONS[0].command, 'labwatch.start')
})
