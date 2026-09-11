<div align="center">

# LabWatch Lite

**轻量级、自托管的 NVIDIA GPU 与 AI 开发服务器监控面板。**

不用再 SSH 进去反复敲 `nvidia-smi`、`htop`、`df -h`，打开浏览器即可。

[English](README.md) · **简体中文**

[![CI](https://github.com/OWNER/labwatch/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/python-3.10%2B-3776ab?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

<img src="docs/images/hero.png" alt="LabWatch 面板：主机卡片、GPU 卡片与 GPU 进程表" width="100%">

</div>

---

## 为什么做这个

训练模型、跑推理、扫评测时，你会一遍又一遍地问同样的问题：

- 现在哪张卡是空的？
- GPU 是真的在算，还是只是占着显存？
- 谁在占 GPU 1，已经跑了多久？
- 内存是不是快满了？磁盘还剩多少？
- 过去一小时的利用率是什么样？

LabWatch 把这些全部放在一个每两秒自动刷新的页面上。

## 功能

| | |
|---|---|
| **GPU 遥测** | 每张 NVIDIA 卡的利用率、显存、温度、功耗（含功耗上限）、风扇、SM/显存频率、持久化模式与进程数。 |
| **GPU 进程映射** | 把 NVML 的计算进程 PID 与系统进程信息关联：用户、完整命令行、CPU %、常驻内存、启动时间与运行时长。 |
| **主机遥测** | CPU（使用率、核心数、频率、负载均值）、内存、磁盘（主挂载点，可选全部挂载点）、主机名、系统、内核、运行时长。 |
| **历史曲线** | CPU、内存、磁盘、GPU 利用率、显存、温度、功耗写入 SQLite，支持 **1H / 6H / 24H** 三个窗口。 |
| **进程表** | 任意数值列可排序、按 GPU 过滤、跨 PID/进程名/命令行/用户搜索。 |
| **优雅降级** | 没有驱动、没有 GPU、某项传感器不支持、进程中途退出，都只显示 `N/A`，绝不会让页面或 API 崩掉。 |
| **演示模式** | `LABWATCH_DEMO_MODE=true` 提供确定性合成数据，界面明确标注 **Demo Data**，无 N 卡也能完整展示。 |
| **主题** | 跟随系统 / 浅色 / 深色，首屏渲染前即生效，无闪烁。 |
| **只读** | LabWatch 从不修改被监控的主机。无需安装 agent，没有 shell，没有任务调度。 |

<table>
<tr>
<td width="50%"><img src="docs/images/gpu-cards.png" alt="GPU 卡片"><br><sub><b>每张 GPU 一张卡片</b> —— 页面的视觉中心</sub></td>
<td width="50%"><img src="docs/images/process-table.png" alt="GPU 进程表"><br><sub><b>GPU 进程</b> —— 可排序、可过滤、可搜索</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/images/host-overview.png" alt="主机卡片"><br><sub><b>主机总览</b> —— CPU、内存、磁盘、系统</sub></td>
<td width="50%"><img src="docs/images/history-1h.png" alt="历史曲线"><br><sub><b>历史曲线</b> —— 1H / 6H / 24H</sub></td>
</tr>
<tr>
<td colspan="2"><img src="docs/images/hero-light.png" alt="LabWatch 浅色主题" width="100%"><br><sub><b>浅色主题</b> —— 相同信息密度，不同底色</sub></td>
</tr>
<tr>
<td colspan="2"><img src="docs/images/hero-real.png" alt="LabWatch 读取真实 RTX 4060" width="100%"><br><sub><b>真实硬件，非演示数据</b> —— 通过 NVML 读取的 RTX 4060，以及无进程占用显存时的空状态</sub></td>
</tr>
</table>

## 快速开始

### Docker Compose（推荐）

```bash
git clone https://github.com/OWNER/labwatch.git
cd labwatch
docker compose up -d
```

打开 <http://localhost:8000>。历史数据保存在 `labwatch-data` 卷中，重启不丢失。

GPU 访问需要宿主机安装 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。
没有 GPU 时容器依然可用 —— CPU、内存、磁盘照常监控。

**没有 GPU？试试演示模式：**

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

### 从源码运行

后端：

```bash
cd backend
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

前端（另开一个终端）：

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173，并把 /api 代理到 :8000
```

单端口部署（由 FastAPI 直接托管构建产物）：

```bash
cd frontend && npm run build && cp -r dist ../backend/static
# 后端现在直接在 http://localhost:8000 提供面板
```

## 架构

<img src="docs/architecture.svg" alt="架构图：浏览器轮询 FastAPI，FastAPI 读取 NVML 与 psutil 并写入 SQLite" width="100%">

单机、单容器、三个数据源：

- **NVML**（`nvidia-ml-py`）负责 GPU 遥测与计算进程 PID。
- **psutil** 负责主机指标，并把 GPU PID 补全为用户、命令行、CPU、运行时长。
- **SQLite** 负责历史序列，使用 WAL 模式，按可配置的保留窗口定期清理。

面板轮询 `/api/overview`，间隔由后端下发，因此一次刷新只有一次往返。标签页隐藏时暂停轮询。
v1 刻意不使用 WebSocket：在 2 秒刷新下它只增加复杂度，不改变体验。

```
labwatch/
├── backend/
│   ├── app/
│   │   ├── api/            # 路由模块：health, system, gpu, history, overview
│   │   ├── collectors/     # psutil 主机采集、NVML GPU 采集、演示数据源
│   │   ├── services/       # 监控门面、历史持久化、后台采集循环
│   │   ├── config.py       # LABWATCH_* 配置项
│   │   ├── database.py     # SQLAlchemy 模型：host_samples, gpu_samples
│   │   ├── schemas.py      # Pydantic 响应模型
│   │   └── main.py         # 应用工厂、lifespan、静态前端挂载
│   ├── tests/              # 112 个 pytest 测试
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/     # 顶栏、主机卡片、GPU 卡片、进程表、图表
│   │   ├── hooks/          # SWR 轮询、主题
│   │   ├── lib/            # 格式化与状态分级工具
│   │   ├── services/       # 带类型的 API 客户端
│   │   └── types/          # 与 backend/app/schemas.py 一一对应
│   ├── e2e/                # Playwright 测试
│   └── scripts/            # 开发服务器、截图自动化
├── docs/images/            # 上方使用的截图
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## 配置

所有配置都是带 `LABWATCH_` 前缀的环境变量，完整注释见 [`.env.example`](.env.example)。

| 变量 | 默认值 | 作用 |
|---|---|---|
| `LABWATCH_POLL_INTERVAL` | `2` | 下发给前端的实时刷新间隔（秒）。 |
| `LABWATCH_HISTORY_INTERVAL` | `10` | 历史采样写入间隔（秒）。 |
| `LABWATCH_RETENTION_HOURS` | `24` | 历史保留时长。 |
| `LABWATCH_RETENTION_MAX_ROWS` | `200000` | 每张表的行数硬上限，超出先删最旧。 |
| `LABWATCH_DATA_DIR` | `backend/data` | 存放 `labwatch.db` 的目录。 |
| `LABWATCH_DATABASE_URL` | 自动推导 | 完整 SQLAlchemy URL，优先级高于 `DATA_DIR`。 |
| `LABWATCH_DEMO_MODE` | `false` | 提供合成数据，界面标注 **Demo Data**。 |
| `LABWATCH_ENABLE_BACKGROUND_COLLECTOR` | `true` | 后台持久化历史。 |
| `LABWATCH_COLLECT_COMMANDS` | `true` | 读取完整命令行（取决于 `/proc` 权限）。 |
| `LABWATCH_INCLUDE_GRAPHICS_PROCESSES` | `false` | 同时列出图形上下文。Windows 桌面下会带出所有合成 GUI 进程。 |
| `LABWATCH_PROCESS_LIMIT` | `64` | 每次采样最多补全的 GPU 进程数。 |
| `LABWATCH_CORS_ORIGINS` | `*` | 允许的浏览器来源，逗号分隔。 |
| `LABWATCH_LOG_LEVEL` | `INFO` | 标准 Python 日志级别。 |

### 关于 GPU 进程列表的预期

NVML 区分计算（`C`）与图形（`G`）上下文。LabWatch **默认只列计算进程**，与
`nvidia-smi --query-compute-apps` 一致。在 Windows 上每个 WDDM 应用都会出现在该列表里，
所以表格可能很长 —— 这是驱动对设备的视野，不是 Bug。设置
`LABWATCH_INCLUDE_GRAPHICS_PROCESSES=true` 可同时包含图形上下文。

## API

交互式文档位于 `/api/docs`。

| 接口 | 返回 |
|---|---|
| `GET /api/health` | 服务状态、数据库状态、NVML 可用性与采集器状态。 |
| `GET /api/overview` | 主机 + GPU + 进程，一次返回（前端轮询用）。 |
| `GET /api/system` | 主机 CPU、内存、磁盘与运行时长。`?all_mounts=true` 返回全部挂载点。 |
| `GET /api/gpus` | 每张 GPU 的实时状态；NVML 不可用时返回 `available`/`error`。 |
| `GET /api/processes` | GPU 进程。`?gpu_index=1` 过滤单卡。 |
| `GET /api/history/system?range=1h` | 主机历史，`range` 取 `1h`、`6h` 或 `24h`。 |
| `GET /api/history/gpus?range=1h` | 全部 GPU 历史。 |
| `GET /api/history/gpus/{index}?range=1h` | 单张 GPU 历史。 |

```bash
curl -s localhost:8000/api/overview | jq '.gpus.gpus[] | {index, utilization_percent, temperature_c}'
```

主机无法上报的字段返回 `null`，前端渲染为 `N/A`。驱动缺失时 `/api/gpus` 与
`/api/processes` 仍返回 HTTP 200，只是 `available: false` 并带 `error` 字符串 ——
这样健康检查才能区分"可达但降级"与"不可达"。

## 测试

```bash
# 后端：112 个测试，含采集器各种失败路径
cd backend && pip install -r requirements-dev.txt && pytest

# 前端：75 个测试
cd frontend && npm install && npm run test

# 浏览器端到端：8 个测试，自动拉起演示后端与开发服务器
cd frontend && npx playwright install chromium && npm run e2e
```

后端测试用仿真 NVML 替换真实实现，因此覆盖了：驱动缺失、无 GPU、功耗/风扇/频率传感器
不支持、进程在 NVML 查询与 psutil 查询之间退出、以及 NVML 调用抛异常。CI 会跑 lint、
带覆盖率的后端测试、前端测试、生产构建、Playwright 以及一次 Docker 构建与容器冒烟测试。

## 技术栈

**后端** Python 3.10+ · FastAPI · pydantic-settings · psutil · nvidia-ml-py · SQLAlchemy 2 · SQLite · pytest
**前端** React 19 · TypeScript（strict） · Vite · Tailwind CSS v4 · Recharts · SWR · Vitest · Testing Library
**部署** Docker（多阶段） · Docker Compose · GitHub Actions

## 已知限制

- **仅支持单机。** LabWatch 只监控它所在的机器，多机聚合不在 v1 范围内。
- **没有认证。** 面向可信内网。进程命令行可能包含敏感参数，若需对外暴露请在前面加一层带认证的反向代理。
- **仅支持 NVIDIA。** 不读取 AMD 与 Intel GPU。
- **Windows 的图形上下文噪声较大**，见上文说明。
- **历史是采样的，不是流式的。** 10 秒写入间隔会漏掉瞬时尖峰。
- **Windows 上负载均值为 `N/A`**，因为平台不提供该数据。
- **磁盘显示的是最有意义的挂载点。** 当根文件系统是真实设备时显示根文件系统；
  在根为 `overlay` 的容器中（例如 Docker Desktop）退回到最浅的真实挂载点，
  此时容器内的磁盘数字描述的是容器文件系统而非宿主机。需要宿主机磁盘数字请直接在宿主机运行。

## 路线图

后续由真实使用驱动，而非凭空设想：

- 面向对外暴露场景的可选令牌认证
- Prometheus `/metrics` 导出
- 阈值告警（显存、温度、磁盘）与 Webhook 推送
- 单面板下的多机聚合
- WebSocket 推送以实现亚秒级刷新

## 文档

- [`docs/PROJECT_REPORT.html`](docs/PROJECT_REPORT.html) —— 开发汇报文档（中英双语）：功能、架构、测试结果、已修复缺陷与发布就绪度。
- [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) —— 验收清单（中英双语）与实测结果。

## 许可

[MIT](LICENSE)

> LabWatch 默认面向可信内网。它不做认证，且可能暴露进程命令行。
