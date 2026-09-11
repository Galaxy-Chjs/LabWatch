#!/usr/bin/env node
/**
 * Verify the VS Code extension against a real LabWatch CLI over SSH.
 *
 * The extension cannot be driven headlessly without a VS Code host, but its
 * contract with the CLI can: fetch the real `labwatch status --json` from the lab
 * server, run it through the compiled parser and formatters, and print what the
 * status bar and sidebar would show. That is the part most likely to be wrong.
 *
 * Usage:
 *   node scripts/verify-extension-e2e.mjs --ssh <ssh args> --remote <command>
 *
 * Both defaults point at a local-only deployment config (`.lab/`, git-ignored)
 * and contain no host names or paths, so the script is reusable as-is.
 */

import { execFileSync } from 'node:child_process'

import { gpuCardLines, parseStatus, statusBarText, statusBarTooltip } from '../vscode-extension/out/format.js'

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const sshConfig = arg('ssh-config', process.env.LABWATCH_SSH_CONFIG ?? '.lab/ssh_config')
const remote = arg(
  'remote',
  process.env.LABWATCH_REMOTE_STATUS ?? 'labwatch status --json --port 8010',
)

console.log('== 1. fetch real CLI JSON over SSH ==')
let raw
try {
  raw = execFileSync('ssh', ['-F', sshConfig, '-o', 'BatchMode=yes', 'lab', remote], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
} catch (error) {
  console.error('ssh failed:', error.message)
  process.exit(1)
}
console.log(`   received ${raw.length} bytes`)

console.log('\n== 2. parse with the extension parser ==')
const status = parseStatus(raw)
if (status === null) {
  console.error('   FAIL parser returned null for real CLI output')
  process.exit(1)
}
console.log(`   running=${status.running} version=${status.version} host=${status.hostname}`)
console.log(`   gpus=${status.gpu_count} busy=${status.busy_count} free=${status.free_count}`)
console.log(`   driver=${status.driver_version} cuda=${status.cuda_version} processes=${status.process_count}`)

console.log('\n== 3. status bar would show ==')
console.log(`   ${statusBarText(status)}`)

console.log('\n== 4. tooltip would show ==')
for (const line of statusBarTooltip(status).split('\n')) {
  console.log(`   ${line.replace(/\*\*/g, '')}`)
}

console.log('\n== 5. sidebar rows would show ==')
for (const gpu of status.gpus) {
  const [utilization, memory, temperature] = gpuCardLines(gpu)
  const icon = gpu.busy ? 'flame' : 'circle-outline'
  console.log(`   [${icon}] GPU ${gpu.index}  ${utilization}   ${memory}   ${temperature}`)
}

const failures = []
function check(label, condition) {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${label}`)
  if (!condition) failures.push(label)
}

console.log('\n== 6. contract checks ==')
check('running is true', status.running === true)
check('version is 1.1.0', status.version === '1.1.0')
check('8 GPUs reported', status.gpu_count === 8)
check('busy + free equals total', status.busy_count + status.free_count === status.gpu_count)
check('every GPU has a utilisation', status.gpus.every((gpu) => gpu.utilization_percent !== null))
check('every GPU has VRAM totals', status.gpus.every((gpu) => gpu.memory_total !== null))
check('every GPU has a temperature', status.gpus.every((gpu) => gpu.temperature_c !== null))
check('status bar is not an error state', !/not running|no GPU|CLI not found/.test(statusBarText(status)))

console.log(failures.length === 0 ? '\nEXTENSION E2E OK' : `\nEXTENSION E2E FAILED (${failures.length})`)
process.exit(failures.length === 0 ? 0 : 1)
