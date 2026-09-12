/**
 * The other half of the webview bridge: answering the panel's API calls.
 *
 * A dashboard loaded in a webview cannot reach `http://127.0.0.1:8123` itself - its
 * own origin is the webview, and reaching out would mean CORS and, over Remote-SSH,
 * a forwarded port. So the panel forwards requests over `postMessage` and this does
 * the talking, over loopback, from the extension host.
 *
 * Node's `http` rather than `fetch`: no global fetch guarantee on older runtimes,
 * and no proxy environment variables to trip over for a loopback call.
 */

import { request as httpRequest } from 'node:http'

export interface ApiRequestMessage {
  id: number
  method: string
  path: string
}

export interface ApiResponseMessage {
  type: 'labwatch:api-response'
  id: number
  status: number
  statusText: string
  contentType: string
  body: string
  error?: string
}

/** Only the paths the dashboard actually uses, so a bug cannot become a tunnel. */
export function isAllowedApiPath(path: string): boolean {
  return /^\/?api\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&%._-]*)?$/.test(path)
}

export function normaliseApiPath(path: string): string {
  const withSlash = path.startsWith('/') ? path : `/${path}`
  return withSlash.startsWith('/api/') ? withSlash : `/api${withSlash.replace(/^\/?/, '/').replace('//', '/')}`
}

/**
 * Perform one forwarded request. Never throws: a failure comes back as a response
 * with `error` set, which the bridge turns into a rejected fetch - exactly what the
 * dashboard already handles when the collector is down.
 */
export async function forwardApiRequest(
  request: ApiRequestMessage,
  port: number,
  timeoutMs = 20_000,
): Promise<ApiResponseMessage> {
  const base: ApiResponseMessage = {
    type: 'labwatch:api-response',
    id: request.id,
    status: 502,
    statusText: 'Bad Gateway',
    contentType: 'application/json',
    body: '{}',
  }

  if (!isAllowedApiPath(request.path)) {
    return { ...base, status: 400, statusText: 'Bad Request', body: JSON.stringify({ detail: 'unsupported path' }) }
  }

  const path = normaliseApiPath(request.path)

  return new Promise<ApiResponseMessage>((resolve) => {
    const finished = (message: ApiResponseMessage): void => resolve(message)

    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: request.method === 'POST' ? 'POST' : 'GET',
        headers: { Accept: 'application/json', Host: `127.0.0.1:${port}` },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () =>
          finished({
            ...base,
            status: res.statusCode ?? 502,
            statusText: res.statusMessage ?? '',
            contentType: String(res.headers['content-type'] ?? 'application/json'),
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
        res.on('error', (error: Error) => finished({ ...base, error: error.message }))
      },
    )

    req.on('timeout', () => {
      req.destroy(new Error('the collector did not answer in time'))
    })
    req.on('error', (error: Error) => finished({ ...base, error: error.message }))
    req.end()
  })
}
