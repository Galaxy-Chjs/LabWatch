/**
 * Turning the built dashboard into something a webview can load.
 *
 * Pure string work with no `vscode` import, because the interesting part is the
 * rewriting and it is worth unit testing: the built `index.html` refers to assets
 * by absolute path (`/assets/index-abc.js`), which a webview cannot resolve, and it
 * needs a Content-Security-Policy or VS Code refuses to run the bundle at all.
 *
 * The same built bundle is served to a browser by the collector; only this file
 * knows how to present it inside the editor.
 */

/** Anything with `asWebviewUri` - kept structural so this stays editor-free. */
export interface ResourceMapper {
  asWebviewUri(value: unknown): unknown
  toString(): string
}

/** A `vscode.Uri` with the two members the mapper needs. */
export interface RootUri {
  path: string
  with(change: { path: string }): unknown
}

export interface WebviewShellOptions {
  /** The built `index.html`, exactly as the collector would serve it. */
  html: string
  /** Resolves a repo-relative path to a webview-visible URI. */
  mapper: ResourceMapper
  /** Root URI joined with a repo-relative path to form the URI handed to `mapper`. */
  rootUri: RootUri
  webviewCspSource: string
  /** Collector port, injected so the bridge knows where to send API traffic. */
  port: number
}

/**
 * The transport shim. Runs *before* the bundle and replaces `window.fetch` for
 * `/api/*` requests, forwarding them to the extension host, which is the only
 * party that can reach the collector without CORS or a forwarded port.
 *
 * Written as a string because that is what a webview executes; the same source
 * lives here rather than in a separate built file so a webview has no second
 * script to load.
 */
export const BRIDGE_SCRIPT = `
(function () {
  var api = acquireVsCodeApi();
  window.__LABWATCH_WEBVIEW__ = true;
  var pending = new Map();
  var counter = 0;

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || message.type !== 'labwatch:api-response' || !pending.has(message.id)) return;
    var resolve = pending.get(message.id);
    pending.delete(message.id);
    resolve(message);
  });

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = url.indexOf('/api/') === 0 || url.indexOf('api/') === 0;
    if (!window.__LABWATCH_WEBVIEW__ || !isApi) {
      if (realFetch) return realFetch(input, init);
      return Promise.reject(new Error('fetch is unavailable'));
    }
    var id = ++counter;
    var method = (init && init.method) || 'GET';
    return new Promise(function (resolve, reject) {
      pending.set(id, function (message) {
        if (message.error) {
          reject(new TypeError(message.error));
          return;
        }
        resolve(new Response(message.body, {
          status: message.status,
          statusText: message.statusText,
          headers: { 'Content-Type': message.contentType || 'application/json' },
        }));
      });
      api.postMessage({ type: 'labwatch:api-request', id: id, method: method, path: url });
    });
  };
})();
`

/**
 * Rewrite the built page for a webview: absolute asset paths become webview URIs,
 * the bridge is injected ahead of the bundle, and a CSP is added.
 */
export function buildWebviewShell(options: WebviewShellOptions): string {
  const { html, mapper, rootUri, webviewCspSource, port } = options

  const toWebviewUri = (absolutePath: string): string => {
    const relative = absolutePath.replace(/^\//, '')
    return String(mapper.asWebviewUri(rootUri.with({ path: `${rootUri.path}/${relative}`.replace(/\/+/g, '/') })))
  }

  const csp = [
    "default-src 'none'",
    `img-src ${webviewCspSource} data:`,
    `style-src ${webviewCspSource} 'unsafe-inline'`,
    `font-src ${webviewCspSource}`,
    `script-src ${webviewCspSource} 'unsafe-inline'`,
    `connect-src ${webviewCspSource}`,
  ].join('; ')

  return html
    .replace(
      /<link rel="icon" href="([^"]+)"/g,
      (_match, href: string) => `<link rel="icon" href="${toWebviewUri(href)}"`,
    )
    .replace(
      /(src|href)="(\/assets\/[^"]+)"/g,
      (_match, attribute: string, value: string) => `${attribute}="${toWebviewUri(value)}"`,
    )
    .replace(
      '<head>',
      [
        '<head>',
        `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
        `<script>window.__LABWATCH_PORT__ = ${port};</script>`,
        `<script>${BRIDGE_SCRIPT}</script>`,
      ].join('\n'),
    )
}
