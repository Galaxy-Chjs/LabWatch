# Changelog

## 1.3.3

Size and correctness.

- **The bundled wheels are gone.** Shipping 29 MB of wheels was built on my wrong
  guess that the lab server has no outbound access; it does. The VSIX is back to
  under a megabyte, and a failed install now says what pip said.
- **A conda environment is found before anything is installed.** Interpreters from
  `conda info --envs` are probed after `PATH` and before the private environment, so
  a collector you installed deliberately is used instead of a second copy being
  created. This is also the likely fix for a machine that already runs LabWatch.
- Fixed the conda parsing: each line is `<name> <path>`, and treating the whole line
  as a path matched nothing.

## 1.3.3（中文）

体积与正确性。

- **移除内置 wheel。** 内置 29 MB wheel 建立在我"服务器没有外网"的错误猜测上，而事实并非
  如此。VSIX 回到 1 MB 以内；安装失败时也会直接给出 pip 的原话。
- **安装之前先找 conda 环境。** 现在会依次探测 `PATH`、`conda info --envs` 中的解释器，
  最后才考虑私有环境。因此你刻意装好的采集器会被直接使用，不会再建第二份 —— 这也很可能是
  你这台已能运行 LabWatch 的机器上问题的正解。
- 修正了 conda 输出解析：每行是 `<名字> <路径>`，此前把整行当路径，导致一个都匹配不到。

## 1.3.2

Zero behaviour change, one crucial difference: failures now say *why*.

- **The real reason is visible.** A failed install used to report
  `Command failed: <the entire command line>`, which is unfixable from the
  outside - and is exactly what the sidebar showed on the server. The
  interpreter's own message is now the message (`ERROR: Could not find a version…`
  · `ERROR: No matching distribution…`), and the complete output goes to the
  **LabWatch** output channel, with a **Show log** button on the error.
- Setup logs are marked and kept in full, so a failure on someone else's machine
  can be diagnosed from the channel rather than from a screenshot.

## 1.3.2（中文）

行为零改动，但有一点至关重要：失败现在会说明**原因**。

- **能看到真正的报错。** 安装失败原本只报 `Command failed: <整条命令行>`，从外部无法据此
  修复 —— 这正是服务器上侧边栏显示的内容。现在直接使用解释器自己的信息
  （`ERROR: Could not find a version…` · `ERROR: No matching distribution…`），完整输出写入
  **LabWatch** 输出面板，并在报错弹窗提供 **Show log** 按钮。
- 配置过程的日志会完整保留，别人机器上的失败可以直接从输出面板定位，而不用靠截图。

## 1.3.1

Fixes found by running 1.3.0 on a real server.

- **A working collector is no longer reported as broken.** When the collector was
  installed but no instance was running, the sidebar said "Setup needs attention"
  and printed the whole `python -m labwatch status --port 8123` command line as the
  reason. Errors from the running instance are now kept apart from installation
  problems: the sidebar shows a short headline with a **Start** action, and the raw
  output goes to the LabWatch output channel.
- **The wheels now ship inside the extension.** A GPU server is often the one
  machine with no outbound access, and the one-click setup would fail there for a
  reason the user could do nothing about. The VSIX therefore carries wheels for
  Linux x86_64 (Python 3.10–3.12) and Windows x64 (3.12); setup installs from the
  matching directory with `--no-index`, and only falls back to PyPI when there is
  no match. Regenerate with `scripts/bundle-extension-wheels.py`.
- Wheel directories are named `<platform>-<abi>` (`manylinux2014_x86_64-cp311`). A
  bundle keyed only by `cp311` handed Linux wheels to a Windows interpreter, and
  pip answered "No matching distribution" for a perfectly good bundle.
- The status bar starts the collector when none is running, and opens the dashboard
  when one is.

---

## 1.3.1（中文）

在真实服务器上跑 1.3.0 之后发现并修复的问题。

- **不再把可用的采集器报成故障。** 采集器已安装但没有实例在运行时，侧边栏原本显示
  "Setup needs attention"，并把整条 `python -m labwatch status --port 8123` 命令行当成
  原因。现在运行期错误与安装问题分开：侧边栏只留一句结论并提供 **Start** 操作，原始输出
  写进 LabWatch 输出面板。
- **wheel 现在随扩展一起分发。** GPU 服务器常常是网络上唯一没有外网的机器，一键配置在那里
  会因用户无法解决的原因失败。因此 VSIX 内置了 Linux x86_64（Python 3.10–3.12）与
  Windows x64（3.12）的 wheel；配置时用匹配目录以 `--no-index` 安装，只有没有匹配项时才回退
  到 PyPI。重新生成：`scripts/bundle-extension-wheels.py`。
- wheel 目录改名为 `<平台>-<ABI>`（如 `manylinux2014_x86_64-cp311`）。此前只按 `cp311`
  命名，会把 Linux wheel 交给 Windows 解释器，pip 于是对一个完好的包报出
  "No matching distribution"。
- 没有实例运行时，点状态栏即启动采集器；有实例时则打开面板。

## 1.3.0

Nothing to install by hand any more.

- **One-click setup.** When no collector is found and Python 3.10+ is present, the
  extension offers to build a private environment inside its own storage folder and
  install `labwatch-lite` into it. Nothing global is installed, `PATH` is untouched,
  and it happens once.
- **It says what is wrong.** The sidebar now explains the state instead of showing
  an empty pane: needs setup, needs repair, no Python, or setup failed — each with
  the action that resolves it, and the real error text when something breaks.
- **`LabWatch: How to Connect`** opens a guide covering all four routes: automatic
  setup, manual install, an offline server (`pip download`, or
  `labwatch.pipIndexUrl` for a mirror), and pointing `labwatch.pythonPath` at an
  existing collector.
- **New settings**: `labwatch.autoSetup` (offer the automatic setup, default on)
  and `labwatch.pipIndexUrl` (alternative package index).
- Every notification and error message is bilingual, and the sidebar welcome view
  links straight to the three actions that matter.

---

## 1.3.0（中文）

不再需要手动安装任何东西。

- **一键配置。** 未找到采集器且机器上有 Python 3.10+ 时，扩展会询问并在**自己的存储目录**
  内创建私有环境、安装 `labwatch-lite`。不写全局、不改 `PATH`，只做一次。
- **说明清状态。** 侧边栏不再是一片空白，而是给出具体状态：需要配置、需要修复、没有
  Python、配置失败 —— 每种都附带对应的操作按钮，失败时显示真实错误文本。
- **`LabWatch: How to Connect`** 打开一份指南，覆盖四种接入方式：自动配置、手动安装、
  离线服务器（`pip download`，或用 `labwatch.pipIndexUrl` 指向镜像）、以及把
  `labwatch.pythonPath` 指向已有采集器。
- **新增设置**：`labwatch.autoSetup`（是否提供自动配置，默认开启）与
  `labwatch.pipIndexUrl`（备用包索引）。
- 所有提示与错误均为中英双语，侧边栏欢迎视图直接给出三个关键操作入口。

## 1.2.0

First public release on the Marketplace. · 首个公开发布版本。

- Status bar summary of GPU state, refreshed on an interval.
- **LabWatch** sidebar: one row per GPU with utilisation, VRAM and temperature.
- Hover tooltips add power, process count and whether a card looks busy or free.
- Commands: Open Full Dashboard, Start in Background, Stop, Refresh, Run Doctor,
  Show GPU Summary.
- Works locally and over **Remote-SSH**: the extension runs `labwatch status --json`
  and renders the result, so the editor and the dashboard can never disagree.

---

- 状态栏显示 GPU 概览，按间隔刷新。
- **LabWatch** 侧边栏：每张卡一行，显示利用率、显存、温度。
- 悬停提示补充功耗、进程数，以及该卡处于忙碌还是空闲。
- 命令：打开完整面板、后台启动、停止、刷新、运行 Doctor、显示 GPU 摘要。
- 本机与 **Remote-SSH** 均可用：扩展执行 `labwatch status --json` 并渲染结果，
  因此编辑器与面板不可能给出不一致的数据。
