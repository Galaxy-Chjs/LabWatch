"""Drive the whole webview path the way the panel does, without the editor.

It reproduces the two things that can only go wrong at runtime: that the built
dashboard loads when its asset URLs are rewritten the way `webviewHtml.ts` rewrites
them, and that every API path the dashboard uses is answered by the bridge. The
rewriting and the forwarding are the real implementations from the compiled
extension; only `asWebviewUri` is stood in for, because that lives in VS Code.

Usage:
    python scripts/verify-webview-panel.py [port]
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parent.parent
CORE = REPO / "vscode-extension" / "out"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

driver = f"""
const {{ buildWebviewShell }} = require({json.dumps(str(CORE / "webviewHtml.js"))});
const {{ forwardApiRequest, isAllowedApiPath }} = require({json.dumps(str(CORE / "apiBridge.js"))});
const {{ readFileSync }} = require("node:fs");

(async () => {{
  // 1. the shell the panel builds
  const html = readFileSync({json.dumps(str(REPO / "vscode-extension" / "dashboard" / "index.html"))}, "utf8");
  const shell = buildWebviewShell({{
    html,
    mapper: {{ asWebviewUri: (u) => "vscode-webview-resource://" + u.path, toString: () => "x" }},
    rootUri: {{ path: "/ext/dashboard", with: () => ({{}}) }},
    webviewCspSource: "vscode-webview://x",
    port: {PORT},
  }});
  console.log("shell bytes:", shell.length);
  console.log("has CSP:", shell.includes("Content-Security-Policy"));
  // The bundle is a deferred module, so an inline script placed before it always
  // runs first - which is what lets the bridge replace `fetch` in time.
  const bridgeAt = shell.indexOf("acquireVsCodeApi");
  const bundleAt = shell.search(/type="module"/);
  console.log("bridge before bundle:", bridgeAt > 0 && bundleAt > bridgeAt, "(" + bridgeAt + " < " + bundleAt + ")");
  const rewritten = [...shell.matchAll(/(?:src|href)="([^"]*vscode-webview-resource[^"]*)"/g)].map((m) => m[1]);
  console.log("rewritten assets:", rewritten.length);

  // 2. every API call the dashboard makes, through the bridge
  const paths = ["/api/overview", "/api/health", "/api/system", "/api/gpus", "/api/processes",
                 "/api/history/system?range=1h", "/api/history/system?range=6h",
                 "/api/history/system?range=24h", "/api/history/gpus?range=24h"];
  let failures = 0;
  for (const path of paths) {{
    if (!isAllowedApiPath(path)) {{ console.log("REFUSED", path); failures++; continue; }}
    const response = await forwardApiRequest({{ id: 1, method: "GET", path }}, {PORT}, 10000);
    const size = response.body ? response.body.length : 0;
    const ok = response.status === 200 && response.error === undefined;
    if (!ok) failures++;
    console.log((ok ? "  ok  " : " FAIL ") + path + " -> " + response.status + " (" + size + " bytes)" +
                (response.error ? " " + response.error : ""));
  }}

  // 3. a JSON spot check so "200" is not the whole evidence
  const overview = await forwardApiRequest({{ id: 2, method: "GET", path: "/api/overview" }}, {PORT}, 10000);
  if (overview.status === 200) {{
    const body = JSON.parse(overview.body);
    console.log("overview gpus:", (body.gpus && body.gpus.gpus ? body.gpus.gpus.length : "?"),
                "| demo:", body.demo, "| hostname:", body.system && body.system.hostname);
  }}
  console.log(failures === 0 ? "ALL OK" : failures + " FAILURE(S)");
  process.exit(failures === 0 ? 0 : 1);
}})();
"""

path = pathlib.Path(tempfile.mkdtemp(prefix="lw-webview-")) / "driver.js"
path.write_text(driver, encoding="utf-8")
try:
    result = subprocess.run(
        ["node", str(path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )
    print(result.stdout.strip())
    if result.stderr.strip():
        print("--- stderr ---")
        print(result.stderr.strip()[-1200:])
    print("exit:", result.returncode)
finally:
    import shutil

    shutil.rmtree(path.parent, ignore_errors=True)
