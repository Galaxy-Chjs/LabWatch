/**
 * Unit tests for the webview bridge.
 *
 * The panel itself needs an editor, but both halves of the bridge are plain Node:
 * the HTML rewriting that makes a browser bundle loadable in a webview, and the
 * loopback forwarder that answers the panel's API calls. The forwarder is tested
 * against a real HTTP server on a random port, because "it forwards correctly" is
 * exactly the kind of claim that a mock would let me make up.
 */

import { strict as assert } from 'node:assert'
import { createServer, type Server } from 'node:http'
import { test } from 'node:test'

import { forwardApiRequest, isAllowedApiPath, normaliseApiPath } from '../apiBridge'
import { buildWebviewShell, BRIDGE_SCRIPT, type ResourceMapper, type RootUri } from '../webviewHtml'

function mapper(prefix = 'https://webview.example'): { mapper: ResourceMapper; rootUri: RootUri } {
  const rootUri: RootUri = {
    path: '/ext/dashboard',
    with: (change) => ({ fsPath: change.path, toString: () => change.path }),
  }
  const map: ResourceMapper = {
    asWebviewUri: (value) => `${prefix}${String(value)}`,
    toString: () => 'vscode-webview://x',
  }
  return { mapper: map, rootUri }
}

const BUILT_HTML = `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <title>LabWatch</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-def.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

test('the webview shell rewrites assets, injects the bridge and sets a CSP', () => {
  const { mapper: map, rootUri } = mapper()
  const shell = buildWebviewShell({
    html: BUILT_HTML,
    mapper: map,
    rootUri,
    webviewCspSource: 'https://file+.vscode-resource.vscode-cdn.net',
    port: 8123,
  })

  // Absolute paths a webview cannot resolve are gone; every asset is webview-visible.
  assert.equal(shell.includes('src="/assets/'), false)
  assert.equal(shell.includes('href="/assets/'), false)
  assert.equal(shell.includes('href="/favicon.svg"'), false)
  for (const asset of ['index-abc.js', 'index-def.css', 'favicon.svg']) {
    assert.ok(shell.includes(asset), `${asset} is still referenced`)
  }
  assert.ok(shell.includes('https://webview.example/ext/dashboard/assets/index-abc.js'))

  // Without a CSP the webview refuses to run the bundle at all.
  assert.match(shell, /Content-Security-Policy/)
  assert.match(shell, /script-src https:\/\/file\+\.vscode-resource\.vscode-cdn\.net 'unsafe-inline'/)
  assert.match(shell, /default-src 'none'/)

  // The bridge must be installed before the bundle, and knows the port.
  assert.ok(shell.includes('window.__LABWATCH_PORT__ = 8123'), 'port injected')
  const bridgeAt = shell.indexOf('acquireVsCodeApi')
  const bundleAt = shell.indexOf('index-abc.js')
  assert.ok(bridgeAt > 0 && bridgeAt < bundleAt, 'the bridge is installed before the bundle')
})

test('the bridge forwards only /api/ traffic and leaves everything else alone', () => {
  // The shim has to be conservative: a webview that hijacks every fetch breaks
  // whatever else the page loads.
  assert.match(BRIDGE_SCRIPT, /indexOf\('\/api\/'\) === 0 \|\| url\.indexOf\('api\/'\) === 0/)
  assert.match(BRIDGE_SCRIPT, /realFetch\(input, init\)/)
  assert.match(BRIDGE_SCRIPT, /labwatch:api-request/)
  assert.match(BRIDGE_SCRIPT, /labwatch:api-response/)
  // A failure must reject, so the dashboard's existing error path handles it.
  assert.match(BRIDGE_SCRIPT, /reject\(new TypeError\(message\.error\)\)/)
})

test('only the dashboard’s own API paths are forwarded', () => {
  for (const path of [
    '/api/overview',
    '/api/health',
    '/api/system',
    '/api/gpus',
    '/api/processes',
    '/api/history/system?range=6h',
    '/api/history/gpus?range=24h',
    'api/overview',
  ]) {
    assert.equal(isAllowedApiPath(path), true, `${path} should be allowed`)
  }
  for (const path of ['/metrics', 'http://evil.example/steal', '/api/../../etc/passwd', '/api/x y', '']) {
    assert.equal(isAllowedApiPath(path), false, `${path} should be refused`)
  }
})

test('paths are normalised to what the collector serves', () => {
  assert.equal(normaliseApiPath('/api/overview'), '/api/overview')
  assert.equal(normaliseApiPath('api/overview'), '/api/overview')
  assert.equal(normaliseApiPath('/api/history/system?range=1h'), '/api/history/system?range=1h')
})

test('a forwarded request really comes back from a loopback collector', async () => {
  const server: Server = createServer((req, res) => {
    if (req.url === '/api/overview') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, path: req.url }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ detail: 'not found' }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  try {
    const ok = await forwardApiRequest({ id: 1, method: 'GET', path: '/api/overview' }, port)
    assert.equal(ok.status, 200)
    assert.equal(ok.type, 'labwatch:api-response')
    assert.deepEqual(JSON.parse(ok.body), { ok: true, path: '/api/overview' })
    assert.equal(ok.error, undefined)

    const missing = await forwardApiRequest({ id: 2, method: 'GET', path: '/api/nope' }, port)
    assert.equal(missing.status, 404)

    const refused = await forwardApiRequest({ id: 3, method: 'GET', path: 'https://evil.example' }, port)
    assert.equal(refused.status, 400)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('an unreachable collector comes back as an error, not a hang', async () => {
  // Port 1 on loopback: nothing is listening, which is the "collector is down" case.
  const response = await forwardApiRequest({ id: 9, method: 'GET', path: '/api/overview' }, 1, 2_000)
  assert.equal(response.status, 502)
  assert.ok(response.error !== undefined && response.error !== '', 'the reason is reported')
})
