# Changelog

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
