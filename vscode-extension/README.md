# LabWatch for VS Code

See your GPU state where you are already looking, and open the full dashboard
when you need detail.

**Install without the Marketplace**, while the listing is in review:

```bash
code --install-extension https://github.com/Galaxy-Chjs/LabWatch/releases/latest/download/labwatch-gpu-status-1.3.3.vsix
```

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

The extension is the view; a small Python program — the collector — does the
reading. **You do not have to install it yourself.** On first use, if no collector
is found and Python 3.10 or newer is present, the extension offers to build a
private environment inside its own storage folder and install the collector there.
Nothing global is installed and `PATH` is not modified.

If you prefer to install it yourself, any of these works:

```bash
pipx install labwatch-lite     # a command on PATH: labwatch
uvx labwatch-lite              # run once, install nothing
pip install labwatch-lite      # then: python -m labwatch
```

The distribution is called `labwatch-lite` because `labwatch` on PyPI belongs to an
unrelated project; what these commands install is the `labwatch` command used below.
发行名是 `labwatch-lite`（PyPI 上的 `labwatch` 属于别的项目），装出来的命令仍是 `labwatch`。

Already running the collector somewhere specific — a conda environment, say? You do
not even have to configure it: interpreters conda knows about are searched before
anything is installed. Setting `labwatch.pythonPath` simply puts one first.

### Where the collector is looked for

1. `labwatch.pythonPath`, if you set it;
2. `labwatch` on `PATH` — pipx, `uv tool`, a distro package;
3. `python3 -m labwatch` — a plain `pip install --user`;
4. interpreters **conda** knows about, because that is where a deliberately managed
   environment usually lives and where `PATH` frequently does not point;
5. its own private environment, built inside the extension's storage folder **only
   when nothing above exists** and you agree to it.

So a machine that can already run `labwatch` never gets a second copy. When the
private environment *does* have to be built, it installs from PyPI or from
`labwatch.pipIndexUrl` (an internal mirror behaves exactly as it would by hand), and
the whole log goes to the **LabWatch** output channel with the interpreter's own
error message rather than "command failed".

## When something is wrong

The sidebar never shows a blank pane, and it never reports a working collector as
broken. Installation problems — **needs setup**, **needs repair**, **no Python
found**, **setup failed** — get their own headline and the action that resolves
them. A collector that is installed but simply not running is *not* an error: it
offers **Start**, and the underlying command output goes to the **LabWatch** output
channel rather than into the sidebar. `LabWatch: Run Doctor` prints the collector's
own diagnostics in a tab.

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

If the collector is missing on the remote, the extension offers to set it up there —
the private environment is created on the server, which is where it belongs.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `labwatch.pythonPath` | *(auto)* | Command used to run the collector. Tried **first**. Empty lets the extension find it: `labwatch` on `PATH`, then `python3 -m labwatch`, then its own private environment. |
| `labwatch.autoSetup` | `true` | Offer to build the private environment on first use when no collector is found. |
| `labwatch.pipIndexUrl` | *(PyPI)* | Alternative package index for the automatic setup — an internal mirror, for example. |
| `labwatch.refreshInterval` | `5` | Seconds between refreshes. |
| `labwatch.statusBar` | `true` | Show state in the status bar. |
| `labwatch.autoStart` | `false` | Start the collector in the background when a workspace opens and nothing is running. |
| `labwatch.dashboardPort` | `8123` | Port the dashboard is served on; forwarded automatically over Remote-SSH. |

## Build and install from source

```bash
cd vscode-extension
npm install
npm run compile
npx --yes @vscode/vsce package --no-dependencies
code --install-extension labwatch-gpu-status-1.3.3.vsix --force
```

For development, open the repository in VS Code and press <kbd>F5</kbd> —
`.vscode/launch.json` starts an Extension Development Host.

## Tests

```bash
npm run compile && npm test
```

The formatting, guidance text and Python-environment logic are deliberately kept
free of `vscode` imports, so they run under plain Node: 34 tests cover the payload
parsing, every setup state's user-facing text, and the resolution order between
`pythonPath`, `PATH`, and the private environment. Nothing in the suite spawns
Python or touches the network — processes are injected.

The real end-to-end path has its own check, which does build a temporary
environment and install into it:

```bash
python scripts/verify-extension-setup.py     # from the repository root
```

## Files

| File | Purpose |
|---|---|
| `src/format.ts` | Pure formatting and status-bar text; no VS Code imports, fully unit tested. |
| `src/guidance.ts` | Every user-facing message and the connection guide, bilingual; no VS Code imports, unit tested. |
| `src/pythonEnv.ts` | Finds a Python 3.10+ interpreter and builds the private environment; process execution is injected so it is testable. |
| `src/labwatchCli.ts` | Resolves how to invoke the collector, runs it, and explains what is missing when it cannot. |
| `src/gpuTree.ts` | The sidebar tree, including the setup states it shows when there is no data. |
| `src/extension.ts` | Activation, commands, refresh timer, port forwarding, setup prompt. |