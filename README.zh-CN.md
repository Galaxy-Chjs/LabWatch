<div align="center">

# LabWatch

**一条命令，开始观察你的 GPU。**

```bash
uvx labwatch
```

打开 <http://localhost:8123> —— 不用 clone，不用 npm，不用配置。

[English](https://github.com/Galaxy-Chjs/LabWatch/blob/main/README.md) · **简体中文**

[![PyPI](https://img.shields.io/pypi/v/labwatch-lite)](https://pypi.org/project/labwatch-lite/)
![PyPI - Python Version](https://img.shields.io/pypi/pyversions/labwatch-lite)
[![CI](https://github.com/Galaxy-Chjs/LabWatch/actions/workflows/ci.yml/badge.svg)](https://github.com/Galaxy-Chjs/LabWatch/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/python-3.10%2B-3776ab?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![License](https://img.shields.io/badge/license-MIT-blue)

<img src="https://raw.githubusercontent.com/Galaxy-Chjs/LabWatch/main/docs/images/hero-labserver.png" alt="LabWatch 监控 8 张 RTX 4090 的科研服务器" width="100%">

</div>

---

## 安装

一条命令，无需配置：

```bash
uvx labwatch-lite
```

这就是全部安装过程。`uvx` 会拉取 LabWatch、启动它并打开面板。

想要一个常驻命令？以下任选其一：

```bash
uv tool install labwatch-lite   # 之后：labwatch
pipx install labwatch-lite      # 之后：labwatch
pip install labwatch-lite       # 之后：python -m labwatch
```

> **为什么包名是 `labwatch-lite`，而命令是 `labwatch`**
>
> PyPI 上的 `labwatch` 属于另一个无关项目
> （[rbretschneider/labwatch_cli](https://github.com/rbretschneider/labwatch_cli)），
> 因此本项目以发行名 **`labwatch-lite`** 发布，避免用户装到别人的工具。导入包名与
> 命令行命令都仍然是 `labwatch`，只有 `pip`/`uvx`/`pipx` 里写的名字不同。直接安装
> PyPI 上的 `labwatch` 得到的是那个项目，不是本项目。

暂时没有 N 卡？用合成数据先看看界面：

```bash
uvx labwatch-lite --demo
```

## 使用

```bash
labwatch                     # 启动并打开面板
labwatch --port 8124         # 换端口
labwatch --demo              # 合成 GPU，无需硬件
labwatch doctor              # 这台机器能跑 LabWatch 吗？
labwatch start --background  # 后台运行
labwatch status              # 在跑吗？GPU 现在什么状态？
labwatch stop                # 停止后台实例
labwatch open                # 再次打开面板
```

`labwatch doctor` 回答"为什么跑不起来"：

```text
LabWatch Doctor

✓ Python — 3.11.14
✓ Dependencies — 7 runtime packages importable
✓ NVML — available (driver 580.173.02)
✓ GPUs — 8 detected
✓ Port — 127.0.0.1:8123 available
✓ Database — ~/.local/share/labwatch
✓ Dashboard — bundled (640 KB)

✓ Ready — 8 GPUs available.
```

`labwatch status` 是一行答案：

```text
LabWatch 1.1.0
  hello-RG4208-V4  ·  http://127.0.0.1:8010

  7 busy / 8 GPUs  ·  1 free  driver 580.173.02

  GPU 0  NVIDIA GeForce RTX 409   99.0%       32 GB / 48 GB   63°C   446 W  busy
  GPU 1  NVIDIA GeForce RTX 409  100.0%       31 GB / 48 GB   58°C   387 W  busy
  GPU 2  NVIDIA GeForce RTX 409   18.0%        1 GB / 48 GB   52°C   107 W  free

  CPU 13%  ·  RAM 8%  ·  8 GPU processes
```

`status` 与 `doctor` 支持 `--json`，输出机器可读格式 —— 这正是
[VS Code 扩展](#vs-code) 消费的接口。

## VS Code

一个轻量扩展，把 GPU 状态放到你本来就在看的地方。

- **状态栏**：`GPU 3 busy / 8`，单卡时显示 `GPU 0 98% · 33/48GB`，按间隔刷新。
- **LabWatch 侧边栏**：每张卡一行 —— 利用率、显存、温度。
- **Open Full Dashboard**：跳转到 Web 面板看历史、进程与图表。

本地与 **Remote-SSH** 都可用：扩展运行在远端工作区，看到的是远端 GPU，
VS Code 会自动把面板端口转发到你的浏览器。LabWatch 不会在编辑器里被重新实现 ——
扩展只是同一个采集器的一个视图。

构建方式见 [`vscode-extension/README.md`](https://github.com/Galaxy-Chjs/LabWatch/blob/main/vscode-extension/README.md)；
也可以直接安装打包好的 `labwatch-gpu-status-1.3.3.vsix`（`code --install-extension`）。
Marketplace 上架正在审核中。

**无需单独安装采集器**：它是个小型 Python 程序。若机器上已有（`PATH` 上的 `labwatch`，
或 conda 环境里的），扩展会直接找到并使用，不做任何安装；只有在都没有时，才会询问并在自己的
存储目录里创建私有环境，不写全局、不改 `PATH`，包源用 PyPI 或你通过
`labwatch.pipIndexUrl` 指定的镜像。

## 能看到什么

| | |
|---|---|
| **GPU 遥测** | 每张 NVIDIA 卡的利用率、显存、温度、功耗（含上限）、风扇、SM/显存频率、持久化模式、进程数。 |
| **GPU 进程** | NVML 计算 PID 与系统进程信息关联：用户、完整命令行、CPU %、常驻内存、运行时长。共享服务器上可跨用户。 |
| **主机遥测** | CPU（使用率、核心数、频率、负载均值）、内存、全部真实文件系统、主机名、系统、内核、运行时长。 |
| **历史曲线** | CPU、内存、磁盘、GPU 利用率、显存、温度、功耗写入 SQLite，支持 **1H / 6H / 24H**。 |
| **进程表** | 任意数值列排序、按 GPU 过滤、跨 PID/进程名/命令行/用户搜索。 |
| **优雅降级** | 没有驱动、没有 GPU、传感器不支持、进程中途退出，都显示 `N/A`，绝不让页面崩掉。 |
| **主题** | 跟随系统 / 浅色 / 深色，首屏渲染前即生效。 |
| **只读** | LabWatch 从不启动、停止或向任何任务发送信号。 |

<table>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/Galaxy-Chjs/LabWatch/main/docs/images/gpu-cards-labserver.png" alt="八张 GPU 卡片"><br><sub><b>每卡一张卡片</b> —— 8 张 RTX 4090 满载</sub></td>
<td width="50%"><img src="https://raw.githubusercontent.com/Galaxy-Chjs/LabWatch/main/docs/images/process-table-labserver.png" alt="GPU 进程表"><br><sub><b>GPU 进程</b> —— 可排序、过滤、搜索</sub></td>
</tr>
<tr>
<td width="50%"><img src="https://raw.githubusercontent.com/Galaxy-Chjs/LabWatch/main/docs/images/host-overview-labserver.png" alt="主机与文件系统"><br><sub><b>主机总览</b> —— CPU、内存、全部文件系统</sub></td>
<td width="50%"><img src="https://raw.githubusercontent.com/Galaxy-Chjs/LabWatch/main/docs/images/history-1h-labserver.png" alt="历史曲线"><br><sub><b>历史曲线</b> —— 1H / 6H / 24H</sub></td>
</tr>
<tr>
<td colspan="2"><img src="https://raw.githubusercontent.com/Galaxy-Chjs/LabWatch/main/docs/images/hero-light.png" alt="LabWatch 浅色主题" width="100%"><br><sub><b>浅色主题</b> —— 相同的信息密度</sub></td>
</tr>
</table>

## 配置

全部为 `LABWATCH_` 前缀的环境变量，完整列表见
[`.env.example`](https://github.com/Galaxy-Chjs/LabWatch/blob/main/.env.example)。常用的：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `LABWATCH_PORT` | `8000` | 监听端口（经 `labwatch` 命令启动时为 `8123`）。 |
| `LABWATCH_HOST` | `0.0.0.0` | 绑定地址。只在本机访问就设为 `127.0.0.1`。 |
| `LABWATCH_DATA_DIR` | 平台数据目录 | `labwatch.db` 的位置。 |
| `LABWATCH_POLL_INTERVAL` | `2` | 实时刷新间隔（秒）。 |
| `LABWATCH_HISTORY_INTERVAL` | `10` | 历史写入间隔（秒）。 |
| `LABWATCH_RETENTION_HOURS` | `24` | 历史保留时长。 |
| `LABWATCH_DEMO_MODE` | `false` | 合成数据，界面标注 **Demo Data**。 |
| `LABWATCH_INCLUDE_ALL_MOUNTS` | `true` | 上报全部真实文件系统，而不只是 `/`。 |
| `LABWATCH_COLLECT_COMMANDS` | `true` | 解析完整的进程命令行。 |
| `LABWATCH_PROCESS_LIMIT` | `64` | 每次采样补全信息的 GPU 进程上限。 |
| `LABWATCH_INCLUDE_GRAPHICS_PROCESSES` | `false` | 同时列出图形上下文。Windows 桌面下噪声较大。 |
| `LABWATCH_STATIC_DIR` | （包内面板） | 改用其他目录中已构建好的前端，Docker 场景使用。 |

快速开始用的是 CLI 自己的默认值（`127.0.0.1:8123`）。`labwatch` 会为它启动的服务
设置这些变量；直接用 `labwatch serve` 或 server 模块运行时，用的是上表中的默认值。

## 架构

<img src="https://raw.githubusercontent.com/Galaxy-Chjs/LabWatch/main/docs/architecture.svg" alt="架构图：浏览器轮询 FastAPI，FastAPI 读取 NVML 与 psutil 并写入 SQLite" width="100%">

单进程、单机、三个数据源：**NVML** 提供 GPU 遥测与计算进程 PID，**psutil** 提供主机指标与进程补全，
**SQLite** 保存历史。面板轮询 `/api/overview`，一次刷新只有一次往返，标签页隐藏时暂停轮询。

构建好的前端随 Python 包一起分发，这就是 `uvx labwatch-lite` 不需要 Node 工具链的原因。
v1 刻意不引入 WebSocket、消息队列、缓存层与认证：在 2 秒刷新频率下，它们只会增加运维面。

```
labwatch/
├── labwatch/                 # Python 包
│   ├── cli/                  # labwatch doctor / status / start / stop
│   ├── server/               # FastAPI 应用、采集器、服务层
│   └── ui/                   # 构建好的前端，随 wheel 分发
├── vscode-extension/         # 状态栏、侧边栏、打开面板
├── docker-compose.yml        # 服务器部署方案
└── docs/                     # 汇报文档、验收清单、截图
```

## 进阶部署

Docker 适合共享服务器，不适合笔记本：

```bash
docker compose up -d
```

GPU 访问需要宿主机安装 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。
没有 GPU 时容器依然监控 CPU、内存与磁盘。

### 从源码运行

```bash
git clone https://github.com/Galaxy-Chjs/LabWatch.git
cd labwatch
pip install -e ".[dev]"
labwatch --demo
```

构建好的前端已提交在 `labwatch/ui`，因此源码运行也不需要 npm。只有改动前端时才需要重新构建：

```bash
cd frontend && npm install && npm run build   # 输出到 labwatch/ui
```

## API

交互式文档位于 `/api/docs`。

| 接口 | 返回 |
|---|---|
| `GET /api/health` | 服务、数据库、NVML 与采集器状态。 |
| `GET /api/overview` | 主机 + GPU + 进程，一次返回。 |
| `GET /api/system` | 主机 CPU、内存、文件系统、运行时长。 |
| `GET /api/gpus` | 全部 GPU；NVML 不可用时带 `available`/`error`。 |
| `GET /api/processes` | GPU 进程；`?gpu_index=1` 过滤单卡。 |
| `GET /api/history/system?range=1h` | 主机历史；`range` 取 `1h`、`6h`、`24h`。 |
| `GET /api/history/gpus` | 全部 GPU 历史。 |

```bash
curl -s localhost:8123/api/overview | jq '.gpus.gpus[] | {index, utilization_percent, temperature_c}'
```

## 测试

```bash
pip install -e ".[dev]"
pytest              # 179 个后端测试
ruff check labwatch tests

cd frontend
npm run test        # 77 个前端测试
npm run e2e         # 8 个 Playwright 测试，自动拉起演示后端

cd vscode-extension
npm run compile && npm test   # 34 个扩展测试
```

CI 还会校验：`labwatch/ui` 与前端源码一致、wheel 内含并能托管面板、Docker 镜像健康启动。

## 技术栈

**打包** hatchling · console-script 入口 · CLI 仅用标准库
**后端** Python 3.10+ · FastAPI · pydantic-settings · psutil · nvidia-ml-py · SQLAlchemy 2 · SQLite · pytest
**前端** React 19 · TypeScript（strict） · Vite · Tailwind CSS v4 · Recharts · SWR · Vitest · Testing Library
**编辑器** VS Code 扩展（TypeScript）
**部署** Docker（多阶段） · Docker Compose · GitHub Actions

## 已知限制

- **仅单机。** LabWatch 只监控它所在的机器。
- **没有认证。** 面向可信内网；进程命令行可能包含敏感信息。如需对外暴露请加反向代理。
- **仅 NVIDIA。** 不读取 AMD 与 Intel GPU。
- **Windows 图形上下文噪声大**，默认只列计算进程。
- **Windows 上负载均值为 `N/A`**，平台不提供。
- **VS Code 扩展尚未上架 Marketplace。** 扩展已完成、测试通过、打包正常；
  从源码安装见 [`vscode-extension/README.md`](https://github.com/Galaxy-Chjs/LabWatch/blob/main/vscode-extension/README.md)。

## 路线图

- VS Code 扩展上架 Marketplace
- Prometheus `/metrics` 导出
- 阈值告警（显存、温度、磁盘）与 Webhook
- 多机聚合

## 文档

- [`docs/PROJECT_REPORT.html`](https://github.com/Galaxy-Chjs/LabWatch/blob/main/docs/PROJECT_REPORT.html) —— 完整汇报（中英双语）：功能、架构、测试结果、全部已修复缺陷、发布就绪度。
- [`docs/ACCEPTANCE.md`](https://github.com/Galaxy-Chjs/LabWatch/blob/main/docs/ACCEPTANCE.md) —— 验收清单与实测结果，含 8 卡服务器验证。
- [docs/RELEASING.md](https://github.com/Galaxy-Chjs/LabWatch/blob/main/docs/RELEASING.md) —— 需要人工完成的发布步骤：GitHub、PyPI（让 `uvx labwatch-lite` 直接可用）与 VS Code Marketplace。

## 许可

[MIT](https://github.com/Galaxy-Chjs/LabWatch/blob/main/LICENSE)

> LabWatch 默认面向可信内网。它不做认证，且可能暴露进程命令行。
