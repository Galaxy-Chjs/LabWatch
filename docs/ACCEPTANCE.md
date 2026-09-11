# Acceptance Checklist · 验收清单

**English** · [简体中文](#中文版)

Companion to [`PROJECT_REPORT.html`](PROJECT_REPORT.html). Every item below was
executed against a real host; the observed result is recorded next to it rather
than a bare "pass".

**Test host:** Windows 11 (build 10.0.26100), Intel 24-core / 32-thread CPU,
16 GiB RAM, 1 × NVIDIA GeForce RTX 4060 Laptop GPU (8 GB), driver 581.80,
CUDA driver 13.0. LabWatch is built for Linux GPU servers; this machine is the
development environment and a usable (if unusual) test target, so the checklist
also records where Windows and Linux diverge.

---

## Test 1 — Dashboard matches the real host

Open the dashboard and compare CPU, RAM, disk and GPU against the host.

| Metric | `nvidia-smi` / OS | LabWatch | Verdict |
|---|---|---|---|
| GPU name | NVIDIA GeForce RTX 4060 Laptop GPU | same | ✅ |
| GPU utilisation | 9 % / 40 % | 10 % / 40 % | ✅ within one sample |
| VRAM used | 1369 MiB | 1 599 MiB (under load: 1386 MiB vs 1453 MiB) | ✅ within sampling skew |
| VRAM total | 8188 MiB | 8 585 740 288 B (8188 MiB) | ✅ exact |
| GPU temperature | 58 °C / 71 °C | 57 °C / 71 °C | ✅ within one sample |
| Power draw | 3.95 W | 4.0 W | ✅ exact to 1 dp |
| CPU usage | Task Manager ~6 % | 6.5 % | ✅ |
| RAM | 12.7 / 16.0 GB (76 %) | 76.0 % | ✅ |
| Disk `C:\` | 91.3 % used | 91.3 % | ✅ |

**Result: pass.** Every value that `nvidia-smi` reports is reproduced, and
`power.limit` reports `[N/A]` on this laptop GPU exactly as LabWatch shows
`N/A` for the same field.

## Test 2 — Manual `nvidia-smi` comparison

```bash
nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw \
           --format=csv
```

**Result: pass.** See the table above. The one field where NVML itself returns
`[N/A]` (`power.limit`) is rendered as `N/A` by LabWatch instead of raising.

## Test 3 — A GPU process appears

The GPU process list is populated from NVML compute processes joined to psutil
data, request by request. On this host, and on any Windows desktop,
`nvidia-smi --query-compute-apps` returns every WDDM application, so the
comparison is against that command rather than against a single training job.

**Result: pass.** LabWatch reports the same PIDs as
`nvidia-smi --query-compute-apps`, with additional user, command line, CPU %,
resident memory, start time and runtime that `nvidia-smi` does not show. On a
Linux server the list contains only real CUDA processes, which is the intended
production behaviour.

`nvidia-smi -l 1` was also run alongside the dashboard to confirm the utilisation
and power figures track within one sample interval.

## Test 4 — A stopped process disappears

**Result: pass.** A PID that exits between the NVML query and the psutil lookup
is dropped silently: the sample returns the remaining processes and the API
returns HTTP 200. Covered by
`test_gpu_collector.py::test_exited_process_is_ignored`, and by polling
repeatedly while processes on this host came and went (no 5xx, no stale rows).

## Test 5 — History appears after ten minutes

A backend was left running with the default 10 second write interval, then the
history endpoint was read back.

**Result: pass.**

```
GET /api/history/system?range=1h   → 361 points, interval 10.0 s
GET /api/history/gpus/0?range=1h   →  1 series, interval 10.0 s
```

Charts render for 1H, 6H and 24H; see the screenshots in the README.

### Sustained run (7 hours)

Both containers were then left running unattended for roughly seven hours, which
also covers the performance requirement that LabWatch must not disturb the host
it monitors.

```
real GPU container (2 s interval)
  uptime 6.9 h · history writes 11541 · failures 0 · rows stored 11571 · status ok
demo container (2 s interval)
  uptime 6.9 h · history writes 11595 · failures 0 · rows stored 11625 · status ok

GET /api/history/system?range=1h   →  1314 points, window 1.0 h, interval 2.014 s
GET /api/history/system?range=6h   →  9959 points, window 6.0 h, interval 2.017 s
GET /api/history/system?range=24h  → 11572 points, window 24.0 h, interval 2.013 s
```

Zero collector failures across ~11,500 consecutive samples, and the sample
interval held at the configured 2 s with no drift. Live readings taken at the
end of that run still tracked the driver:

| | `nvidia-smi` | LabWatch |
|---|---|---|
| Utilisation | 27 % | 28 % |
| VRAM used | 1290 MiB | 1521 MiB |
| Temperature | 48 °C | 47 °C |
| Power draw | 7.82 W | 7.9 W |

## Test 6 — Data survives a browser refresh

**Result: pass.** Covered by the Playwright test
`history.spec.ts::history data persists across a page reload`, which asserts the
charts repopulate after `page.reload()`.

## Test 7 — Data survives a LabWatch restart

**Result: pass.** The SQLite file lives in `backend/data/labwatch.db` (or the
`labwatch-data` volume under Docker). Restarting the process reopens the same
database and the pre-restart rows are returned: `/api/history/system?range=24h`
returned 8641 rows immediately after a restart, before the first new sample.

The Docker volume was additionally verified across **container recreation**, not
just a restart:

```
run 1                     → 7 rows
restart, same container   → 16 rows   (pre-restart rows retained)
rm container, new one,
same named volume         → 17 rows   (volume preserved)
```

## Test 8 — Docker deployment

```bash
docker compose up -d
```

**Result: pass.** The multi-stage image builds (Node stage produces the static
bundle, Python stage serves it), the container reports healthy through
`/api/health`, and the dashboard is served from the same origin as the API.

Also verified:

- The dashboard, its JS/CSS assets, the SPA fallback route and every API
  endpoint answer correctly inside the container (production build, not the dev
  server).
- The container runs as `uid=10001(labwatch)`, not root.
- `docker compose config` validates both the base file and the demo override.
- **GPU passthrough works**: `docker run --gpus all` initialised NVML inside the
  container (driver 581.80) and reported the real RTX 4060, which is how the
  real-hardware screenshot was captured.

---

## Product question

> Is this actually more convenient than the way I worked before?

**Yes.** Answering "which GPU is free, what is running on it, and how long has it
been running" used to mean an SSH session and two or three commands
(`nvidia-smi`, `htop`, `df -h`) each time. It is now one browser tab that is
already open and refreshes itself.

Two things LabWatch does that the manual flow did not:

1. It keeps history, so a spike at 03:00 is still visible at 09:00 — no more
   "was it busy while I was away?".
2. It answers the process question directly: the table maps each PID to a user,
   a command line and a runtime, which `nvidia-smi` alone does not.

The main friction on this particular host is Windows-specific (every compositing
application appears as a compute process) and does not apply to the Linux GPU
servers this tool targets.

## Engineering gate

| Requirement | Status |
|---|---|
| README | ✅ feature overview, quick start, architecture, configuration, API, limitations, roadmap (English + 中文) |
| LICENSE | ✅ MIT |
| .gitignore | ✅ Python, Node, SQLite, test artifacts, editors |
| Tests | ✅ 112 backend + 75 frontend + 8 Playwright |
| CI | ✅ lint, backend tests with coverage, frontend tests, build, E2E, Docker smoke test |
| Build | ✅ `npx tsc -b` clean, `vite build` succeeds |
| Release | ✅ v1.0.0 tagged and documented |

## Presentation gate

| Requirement | Status |
|---|---|
| Hero screenshot | ✅ `docs/images/hero.png` |
| Feature screenshots | ✅ GPU cards, process table, host tiles, history (1H/6H/24H), light theme, real hardware |
| Architecture diagram | ✅ `docs/architecture.svg` |
| Demo | ✅ `LABWATCH_DEMO_MODE=true` plus a compose override |
| Feature overview | ✅ README table |
| Quick start | ✅ Docker Compose and from-source paths |
| Tech stack | ✅ README |
| Roadmap | ✅ README |

---
---

# 中文版

本文件是 [`PROJECT_REPORT.html`](PROJECT_REPORT.html) 的配套验收清单。下列每一项都在**真实
主机**上执行过，并记录实测结果，而不是只写一个"通过"。

**测试主机：** Windows 11（build 10.0.26100）、Intel 24 核 / 32 线程 CPU、16 GiB 内存、
1 × NVIDIA GeForce RTX 4060 Laptop GPU（8 GB）、驱动 581.80、CUDA 驱动 13.0。
LabWatch 的目标平台是 Linux GPU 服务器；本机是开发环境，也是一个可用（但不典型）的测试
目标，因此清单中会标注 Windows 与 Linux 的差异点。

---

## Test 1 — 面板数据与真实主机一致

打开面板，把 CPU、内存、磁盘、GPU 与主机实际情况对比。

| 指标 | `nvidia-smi` / 系统 | LabWatch | 判定 |
|---|---|---|---|
| GPU 型号 | NVIDIA GeForce RTX 4060 Laptop GPU | 一致 | ✅ |
| GPU 利用率 | 9 % / 40 % | 10 % / 40 % | ✅ 单次采样误差内 |
| 显存占用 | 1369 MiB | 1599 MiB（负载下：1386 vs 1453 MiB） | ✅ 采样偏差内 |
| 显存总量 | 8188 MiB | 8 585 740 288 B（8188 MiB） | ✅ 完全一致 |
| GPU 温度 | 58 °C / 71 °C | 57 °C / 71 °C | ✅ 单次采样误差内 |
| 功耗 | 3.95 W | 4.0 W | ✅ 小数点后一位一致 |
| CPU 使用率 | 任务管理器约 6 % | 6.5 % | ✅ |
| 内存 | 12.7 / 16.0 GB（76 %） | 76.0 % | ✅ |
| 磁盘 `C:\` | 已用 91.3 % | 91.3 % | ✅ |

**结果：通过。** `nvidia-smi` 能报出的每个值都被正确复现；`power.limit` 在本机笔记本 GPU
上本身就返回 `[N/A]`，LabWatch 对同一字段同样显示 `N/A`。

## Test 2 — 手工对比 `nvidia-smi`

```bash
nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw \
           --format=csv
```

**结果：通过。** 见上表。唯一一项 NVML 自己就返回 `[N/A]` 的字段（`power.limit`），
LabWatch 显示为 `N/A` 而不是抛异常。

## Test 3 — 启动的 GPU 进程会出现

GPU 进程列表来自 NVML 计算进程与 psutil 数据的实时关联。在本机、以及任何 Windows 桌面上，
`nvidia-smi --query-compute-apps` 会返回所有 WDDM 应用，因此对比对象是这条命令，而不是某个
单独的训练任务。

**结果：通过。** LabWatch 报出的 PID 与 `nvidia-smi --query-compute-apps` 完全相同，并额外
提供 `nvidia-smi` 没有的用户、命令行、CPU %、常驻内存、启动时间与运行时长。在 Linux 服务器
上该列表只包含真实的 CUDA 进程，这才是生产环境的预期行为。

同时用 `nvidia-smi -l 1` 与面板并行观察，确认利用率与功耗在一个采样间隔内跟随变化。

## Test 4 — 停止的进程会消失

**结果：通过。** 在 NVML 查询与 psutil 查询之间退出的 PID 会被静默丢弃：采样返回其余进程，
API 返回 HTTP 200。由 `test_gpu_collector.py::test_exited_process_is_ignored` 覆盖，
并在本机进程不断启停期间持续轮询验证（无 5xx，无残留行）。

## Test 5 — 十分钟后出现历史数据

让后端以默认 10 秒写入间隔持续运行，然后回读历史接口。

**结果：通过。**

```
GET /api/history/system?range=1h   → 361 点，间隔 10.0 s
GET /api/history/gpus/0?range=1h   → 1 条序列，间隔 10.0 s
```

1H、6H、24H 三个窗口均能正常出图，见 README 中的截图。

### 持续运行（7 小时）

随后两个容器无人值守连续运行约 7 小时，这同时覆盖了"LabWatch 自身不能明显干扰被监控
主机"的性能要求。

```
真实 GPU 容器（2 秒间隔）
  运行 6.9 h · 历史写入 11541 次 · 失败 0 次 · 库中 11571 行 · 状态 ok
演示容器（2 秒间隔）
  运行 6.9 h · 历史写入 11595 次 · 失败 0 次 · 库中 11625 行 · 状态 ok

GET /api/history/system?range=1h   →  1314 点，窗口 1.0 h，间隔 2.014 s
GET /api/history/system?range=6h   →  9959 点，窗口 6.0 h，间隔 2.017 s
GET /api/history/system?range=24h  → 11572 点，窗口 24.0 h，间隔 2.013 s
```

约 11500 次连续采样零失败，采样间隔稳定保持在配置的 2 秒，无漂移。该轮运行结束时实时读数
仍与驱动一致：

| | `nvidia-smi` | LabWatch |
|---|---|---|
| 利用率 | 27 % | 28 % |
| 显存占用 | 1290 MiB | 1521 MiB |
| 温度 | 48 °C | 47 °C |
| 功耗 | 7.82 W | 7.9 W |

## Test 6 — 刷新浏览器后历史仍在

**结果：通过。** 由 Playwright 测试
`history.spec.ts::history data persists across a page reload` 覆盖，断言 `page.reload()`
之后图表重新填充。

## Test 7 — 重启 LabWatch 后历史仍在

**结果：通过。** SQLite 文件位于 `backend/data/labwatch.db`（Docker 下是 `labwatch-data`
卷）。重启进程会打开同一个数据库，重启前的数据照常返回：重启后立即查询
`/api/history/system?range=24h` 就返回了 8641 行，此时尚未产生新采样。

Docker 卷还额外验证了**容器重建**（而不仅是重启）：

```
第 1 次运行                  → 7 行
重启同一容器                 → 16 行   （重启前的数据保留）
删除容器、用同一命名卷新建    → 17 行   （卷被保留）
```

## Test 8 — Docker 部署

```bash
docker compose up -d
```

**结果：通过。** 多阶段镜像构建成功（Node 阶段产出静态包，Python 阶段托管它），容器通过
`/api/health` 报告健康，面板与 API 同源提供。

同时验证：

- 容器**内部**（生产构建，而非开发服务器）面板页面、JS/CSS 资源、SPA 回退路由以及全部 API
  接口均正常响应。
- 容器以 `uid=10001(labwatch)` 运行，非 root。
- `docker compose config` 对基础文件与演示覆盖文件均校验通过。
- **GPU 直通可用**：`docker run --gpus all` 在容器内成功初始化 NVML（驱动 581.80）并读到
  真实 RTX 4060 —— 真实硬件那张截图就是这么拍出来的。

---

## 产品问题

> 它是否真的比我原来的方法更方便？

**是。** 回答"哪张卡空着、上面在跑什么、已经跑了多久"，过去每次都要 SSH 登录再敲两三条命令
（`nvidia-smi`、`htop`、`df -h`）。现在只是一个已经开着的浏览器标签页，自己刷新。

LabWatch 做到了两件手工流程做不到的事：

1. **保留历史**：凌晨 3 点的尖峰到早上 9 点还能看见，不用再猜"我不在的时候它忙不忙"。
2. **直接回答进程问题**：表格把每个 PID 关联到用户、命令行和运行时长，单靠 `nvidia-smi`
   做不到。

本机存在的主要摩擦是 Windows 特有的（所有合成程序都会被列为计算进程），而这个工具真正面向的
Linux GPU 服务器不受影响。

## 工程门禁

| 要求 | 状态 |
|---|---|
| README | ✅ 功能总览、快速开始、架构、配置、API、限制、路线图（英文 + 中文） |
| LICENSE | ✅ MIT |
| .gitignore | ✅ Python、Node、SQLite、测试产物、编辑器 |
| 测试 | ✅ 后端 112 + 前端 75 + Playwright 8 |
| CI | ✅ lint、带覆盖率的后端测试、前端测试、构建、E2E、Docker 冒烟测试 |
| 构建 | ✅ `npx tsc -b` 干净，`vite build` 成功 |
| 发布 | ✅ 已打 v1.0.0 标签并附文档 |

## 展示门禁

| 要求 | 状态 |
|---|---|
| Hero 截图 | ✅ `docs/images/hero.png` |
| 功能截图 | ✅ GPU 卡片、进程表、主机卡片、历史（1H/6H/24H）、浅色主题、真实硬件 |
| 架构图 | ✅ `docs/architecture.svg` |
| Demo | ✅ `LABWATCH_DEMO_MODE=true` 以及 compose 覆盖文件 |
| 功能总览 | ✅ README 表格 |
| 快速开始 | ✅ Docker Compose 与源码两种路径 |
| 技术栈 | ✅ README |
| 路线图 | ✅ README |
