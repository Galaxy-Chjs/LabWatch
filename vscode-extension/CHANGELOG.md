# Changelog

## 1.1.0

First published version. · 首个发布版本。

- Status bar summary of GPU state, refreshed on an interval.
- **LabWatch** sidebar: one row per GPU with utilisation, VRAM and temperature.
- Hover tooltips add power, process count and whether a card looks busy or free.
- Commands: Open Full Dashboard, Start in Background, Stop, Refresh, Run Doctor,
  Show GPU Summary.
- Works locally and over **Remote-SSH**; the extension runs `labwatch status --json`
  and renders it, so the editor and the dashboard can never disagree.

---

- 状态栏显示 GPU 概览，按间隔刷新。
- **LabWatch** 侧边栏：每张卡一行，显示利用率、显存、温度。
- 悬停提示补充功耗、进程数，以及该卡处于忙碌还是空闲。
- 命令：打开完整面板、后台启动、停止、刷新、运行 Doctor、显示 GPU 摘要。
- 本机与 **Remote-SSH** 均可用；扩展执行 `labwatch status --json` 并渲染结果，
  因此编辑器与面板不可能给出不一致的数据。
