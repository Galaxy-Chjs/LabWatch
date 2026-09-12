# LabWatch for VS Code

See your GPU state where you are already looking, and open the full dashboard
when you need detail.

- **Status bar** — `GPU 3 busy / 8`, or `GPU 0 98% · 33GB/48GB` on a single-GPU
  machine. Refreshes on an interval.
- **LabWatch sidebar** — one compact row per GPU: utilisation, VRAM,
  temperature. A hover tooltip adds power, process count and whether the card
  looks busy or free.
- **Commands** — Open Full Dashboard, Start in Background, Stop, Refresh, Run
  Doctor, Show GPU Summary.

The extension is a *view*: it runs `labwatch status --json` and renders the
result. The GPU collector lives in LabWatch, never in the editor, so the two can
never disagree.

## Requirements

LabWatch itself must be installed on the machine the extension talks to:

```bash
uvx labwatch-lite          # run once, no install
# or a permanent command:
pipx install labwatch-lite
pip install labwatch-lite
```

The distribution is called `labwatch-lite` because `labwatch` on PyPI belongs to an
unrelated project; what these commands install is the `labwatch` command used below.
发行名是 `labwatch-lite`（PyPI 上的 `labwatch` 属于别的项目），装出来的命令仍是 `labwatch`。

If `labwatch` is not on `PATH`, set `labwatch.pythonPath` to an explicit command
(for example `/home/you/.conda/envs/mlenv/bin/python -m labwatch`).

## Remote-SSH

This is the case the extension was designed around:

```text
Laptop (VS Code UI)
   │  Remote-SSH
   ▼
Linux GPU server  ← extension host runs here, so it sees the server's GPUs
```

Two things make it work without extra configuration:

1. In a remote window the extension host runs on the **server**, so
   `labwatch status` reports the server's GPUs and processes, not the laptop's.
2. **Open Full Dashboard** uses `vscode.env.asExternalUri`, which asks VS Code to
   forward the dashboard port over the existing SSH connection and hands your
   browser a reachable `localhost` URL. No manual tunnel, and nothing is exposed
   on the server's network.

If the CLI is missing on the remote, the extension says so and names the install
commands instead of failing silently.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `labwatch.pythonPath` | *(auto)* | Command used to run the CLI. Empty tries `labwatch`, then `python3 -m labwatch`, then `python -m labwatch`. |
| `labwatch.refreshInterval` | `5` | Seconds between refreshes. |
| `labwatch.statusBar` | `true` | Show state in the status bar. |
| `labwatch.autoStart` | `false` | Start LabWatch in the background when a workspace opens and nothing is running. |
| `labwatch.dashboardPort` | `8123` | Port the dashboard is served on. |

## Build and install from source

The Marketplace listing is not published yet, so build it locally:

```bash
cd vscode-extension
npm install
npm run compile
```

Then package and install the `.vsix`:

```bash
npx --yes @vscode/vsce package --no-dependencies
code --install-extension labwatch-gpu-status-1.2.0.vsix --force
```

For development, open the repository in VS Code and press <kbd>F5</kbd> —
`.vscode/launch.json` starts an Extension Development Host.

## Tests

```bash
npm run compile && npm test
```

The formatting and status-bar logic is deliberately kept free of `vscode`
imports so it runs under plain Node, including the parsing of a partially
populated CLI payload.

## Files

| File | Purpose |
|---|---|
| `src/format.ts` | Pure formatting and status-bar text; no VS Code imports, fully unit tested. |
| `src/labwatchCli.ts` | Runs the CLI, resolves how to invoke it, tolerates a missing binary. |
| `src/gpuTree.ts` | The sidebar tree. |
| `src/extension.ts` | Activation, commands, refresh timer, port forwarding. |
