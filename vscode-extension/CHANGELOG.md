# Changelog

## 1.2.0

First public release. Everything below ships with it.

- Status bar summary of GPU state, refreshed on an interval.
- **LabWatch** sidebar: one row per GPU with utilisation, VRAM and temperature.
- Hover tooltips add power, process count and whether a card looks busy or free.
- Commands: Open Full Dashboard, Start in Background, Stop, Refresh, Run Doctor,
  Show GPU Summary.
- Works locally and over **Remote-SSH**: the extension runs `labwatch status --json`
  and renders the result, so the editor and the dashboard can never disagree.

Notes for this first release:

- The Activity Bar icon is a PNG rather than an SVG, because `vsce` refuses to
  publish extensions carrying user-supplied SVG images.
- The 1.1.x builds were internal iterations used to work out a Marketplace
  metadata refusal; they are not listed as releases.

---

## 1.2.0（中文）

首个公开发布版本，以下功能全部随之发布。

- 状态栏显示 GPU 概览，按间隔刷新。
- **LabWatch** 侧边栏：每张卡一行，显示利用率、显存、温度。
- 悬停提示补充功耗、进程数，以及该卡处于忙碌还是空闲。
- 命令：打开完整面板、后台启动、停止、刷新、运行 Doctor、显示 GPU 摘要。
- 本机与 **Remote-SSH** 均可用：扩展执行 `labwatch status --json` 并渲染结果，
  因此编辑器与面板不可能给出不一致的数据。

首次发布的说明：

- 活动栏图标使用 PNG 而非 SVG，因为 `vsce` 拒绝发布包含用户自带 SVG 的扩展。
- 1.1.x 是排查 Marketplace 元数据拦截期间的内部迭代版本，不作为发布版本列出。
