# LabWatch Lite

## Product & Development Specification

Version: 1.0
Development Mode: Autonomous Vibe Coding
Primary Developer: Codex
Target: Public GitHub v1.0 Release

---

# 1. Product Definition

## 1.1 Product Name

**LabWatch**

Repository 推荐名称：

```text
labwatch
```

---

## 1.2 One-line Description

> A lightweight self-hosted dashboard for monitoring NVIDIA GPUs and AI development servers.

---

# 2. Problem

AI 开发过程中，服务器状态通常依赖大量终端命令查看：

```bash
nvidia-smi
htop
free -h
df -h
ps aux
```

每次训练、推理、评测时，都需要：

```text
SSH
↓
运行命令
↓
人工查看
↓
重复
```

当一台服务器存在多张 GPU 和多个任务时，更难快速回答：

- 哪张 GPU 有空？
- 哪张 GPU 显存最大？
- GPU 是否真的在计算？
- 谁占用了 GPU？
- 某 Python Process 已经运行多久？
- CPU/RAM 是否爆满？
- Disk 是否快满？
- 最近一小时 GPU 利用率发生了什么？

LabWatch 用浏览器 Dashboard 解决这些问题。

---

# 3. Target User

核心用户：

```text
AI Researchers
ML Engineers
Students
GPU Server Users
```

尤其适用于：

```text
Linux Server
+
NVIDIA GPU
+
Python / CUDA workloads
```

---

# 4. V1 Scope

LabWatch v1.0 必须保持：

> **Single Host + Multiple GPUs**

即：

支持一台服务器上的：

```text
GPU 0
GPU 1
GPU 2
...
```

但暂时不支持多服务器集中管理。

---

# 5. Non-Goals

以下功能明确不属于 v1：

```text
Multi-server management
User accounts
Authentication
Cloud service
SSH management
Remote shell
Terminal emulator
File browser
Training log viewer
Job scheduler
Slurm integration
Kubernetes
Process killing
GPU reservation
Email notification
Telegram notification
Complex alert engine
Agent / LLM functionality
```

即使实现很容易，也不要擅自加入。

优先保证核心体验优秀。

---

# 6. Main User Experience

用户在服务器运行：

```bash
docker compose up -d
```

然后访问：

```text
http://SERVER_IP:PORT
```

立即看到：

```text
LabWatch
────────────────────────────────────────

HOST

CPU            RAM             DISK
24%            32 / 128 GB     1.2 / 2 TB

Uptime
5d 14h


GPUs
────────────────────────────────────────

GPU 0
RTX 4090

Utilization
████████████████░░░ 82%

VRAM
38.2 / 48 GB

Temperature
69°C

Power
392 W


GPU 1
RTX 4090

Utilization
████░░░░░░░░░░░░░ 21%

VRAM
7.3 / 48 GB

Temperature
48°C


GPU Processes
────────────────────────────────────────

PID     GPU   VRAM     Command
15234    0    26GB     python train.py
19218    0     8GB     python eval.py
20421    1     6GB     python api.py
```

下方具有历史资源曲线。

---

# 7. Technology Stack

## Backend

使用：

```text
Python
FastAPI
psutil
NVML Python bindings
SQLite
SQLAlchemy
Pydantic
```

NVML 推荐通过 NVIDIA 官方/主流 Python binding 获取。

如果 Python package 名与 import 名不同，应以当前稳定可维护方案为准。

---

## Frontend

使用：

```text
React
TypeScript
Vite
Tailwind CSS
Recharts
```

允许使用成熟 UI Component Library，但避免引入庞大依赖。

---

## Testing

Backend：

```text
pytest
FastAPI TestClient
```

Frontend：

```text
Vitest
```

End-to-End：

```text
Playwright
```

---

## Deployment

```text
Docker
Docker Compose
```

---

# 8. Architecture

整体架构保持简单：

```text
                    Browser

                       │
                    HTTP REST
                       │

                ┌──────▼──────┐
                │   FastAPI   │
                │             │
                │    REST     │
                │ Background  │
                │ Collector   │
                └──────┬──────┘
                       │
             ┌─────────┼─────────┐
             │         │         │
             ▼         ▼         ▼

           NVML      psutil    SQLite

             │         │

           GPU       System
                     Process
```

Frontend 使用周期轮询获取实时数据。

v1 不要求 WebSocket。

原因：

- 减少复杂度
- 更容易测试
- 更容易部署
- 对 2–5 秒刷新场景完全足够

WebSocket 可以留给未来版本。

---

# 9. Data Collection Strategy

建议：

实时状态采集：

```text
2 seconds
```

历史数据写入：

```text
10 seconds
```

默认保存：

```text
24 hours
```

允许环境变量修改。

例如：

```text
LABWATCH_POLL_INTERVAL=2
LABWATCH_HISTORY_INTERVAL=10
LABWATCH_RETENTION_HOURS=24
```

---

# 10. System Metrics

必须采集：

## CPU

```text
CPU Usage %
Core Count
Load Average
```

---

## Memory

```text
Total
Used
Available
Usage %
```

---

## Disk

至少展示运行 LabWatch 所在主磁盘：

```text
Total
Used
Free
Usage %
```

如果实现简单，可以支持多个 mount。

---

## Host

```text
Hostname
OS
Kernel
System Uptime
```

---

# 11. GPU Metrics

对服务器中的每张 NVIDIA GPU：

必须展示：

```text
Index
GPU Name
GPU UUID
GPU Utilization %
Memory Used
Memory Total
Memory %
Temperature
Power Usage
Power Limit
```

如果某项硬件不支持：

UI 显示：

```text
N/A
```

而不是 API 报错。

---

# 12. GPU Processes

这是 LabWatch 最重要的差异化功能之一。

需要取得 GPU Compute Process PID，并与系统 Process 信息关联。

至少展示：

```text
PID
GPU Index
GPU Memory
Username
Process Name
Command
CPU %
RAM
Start Time
Runtime
```

例如：

```text
PID 15234

GPU
0

GPU Memory
25.7 GB

Command
python train_router.py --config config/v4.yaml

Runtime
03:42:18
```

如果进程在查询时已经退出：

应该安全忽略。

不能导致整个 API 出错。

---

# 13. Historical Metrics

历史数据至少包括：

## Host

```text
CPU usage
RAM usage
Disk usage
```

## GPU

```text
GPU utilization
VRAM usage
Temperature
Power
```

支持：

```text
1H
6H
24H
```

三个时间窗口。

---

# 14. Backend Data Model

建议至少：

## HostSample

```text
id
timestamp

cpu_percent

memory_used
memory_total

disk_used
disk_total
```

---

## GpuSample

```text
id
timestamp

gpu_index
gpu_uuid

utilization

memory_used
memory_total

temperature

power_usage
power_limit
```

Process 不要求长期存数据库。

Process 只作为实时信息。

---

# 15. Backend API

至少实现：

```text
GET /api/health
```

返回服务状态。

---

```text
GET /api/system
```

返回：

```text
hostname
os
uptime
cpu
memory
disk
```

---

```text
GET /api/gpus
```

返回所有 GPU 当前状态。

---

```text
GET /api/processes
```

返回 GPU Process。

---

```text
GET /api/history/system
```

Query：

```text
range=1h
range=6h
range=24h
```

---

```text
GET /api/history/gpus/{gpu_index}
```

返回指定 GPU 历史。

---

可以额外实现：

```text
GET /api/overview
```

减少 Frontend API 请求数量。

但不要因为接口数量而过度设计。

---

# 16. Frontend

## Main Dashboard

Dashboard 顶部：

```text
LabWatch

Hostname
System Uptime
Last Update
```

---

## System Overview

三个或四个 Card：

```text
CPU
RAM
Disk
System
```

必须简洁。

---

## GPU Overview

每张 GPU 一个 Card。

Card 必须可以快速看出：

```text
GPU Utilization
VRAM
Temperature
Power
```

GPU Card 是页面视觉中心。

---

# 17. Visual Design

目标：

> Modern AI Infrastructure Dashboard

设计关键词：

```text
Clean
Minimal
Professional
Dark-friendly
Dense but readable
```

禁止：

```text
大量渐变
过度动画
彩虹色
花哨 Glassmorphism
巨大无意义空白
AI-generated-looking UI
```

颜色主要用于表达状态：

```text
Normal
Warning
Critical
Idle
```

但不要制造视觉噪音。

---

# 18. Dark Mode

v1 必须支持 Dark Mode。

允许：

```text
System
Light
Dark
```

但如果增加主题切换明显拖慢开发：

至少默认提供优秀 Dark UI。

---

# 19. Charts

Charts 必须强调信息，不强调视觉特效。

至少：

```text
GPU Utilization History
GPU Memory History
CPU History
RAM History
```

GPU Temperature / Power 可根据页面空间决定。

支持：

```text
1H
6H
24H
```

---

# 20. Responsive Design

主要目标：

```text
Desktop
Laptop
```

移动端只要求：

> 可阅读。

不要求开发完整 Mobile App 体验。

---

# 21. Error Handling

必须正确处理：

### No NVIDIA Driver

显示：

```text
NVIDIA GPU unavailable
```

而不是整个 Backend 崩溃。

---

### No GPU

仍然显示：

```text
CPU
RAM
Disk
```

---

### NVML Query Failure

单项显示：

```text
N/A
```

---

### Process Disappears

安全忽略。

---

### SQLite Failure

清楚记录日志。

---

# 22. Security

v1 不提供 Authentication。

README 必须提醒：

> LabWatch is intended for trusted private networks by default.

不要默认告诉用户：

```text
Expose directly to the public internet.
```

因为 Process Command 可能包含敏感参数。

---

# 23. Repository Structure

推荐：

```text
labwatch/

├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── collectors/
│   │   ├── models/
│   │   ├── services/
│   │   ├── database/
│   │   └── main.py
│   │
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   │
│   ├── tests/
│   └── Dockerfile
│
├── docs/
│
├── docker-compose.yml
├── README.md
├── LICENSE
└── .github/
    └── workflows/
```

可以合理调整。

不要为了完全遵守目录示意牺牲代码质量。

---

# 24. Development Milestones

## Milestone 1 — Environment & Collector

目标：

Backend 可以独立输出：

```text
CPU
RAM
Disk
GPU
GPU Process
```

验收：

API JSON 正确。

使用：

```bash
nvidia-smi
free
df
```

人工抽样对比。

误差合理。

---

# Milestone 2 — Backend API

完成：

```text
/api/system
/api/gpus
/api/processes
/api/health
```

实现完整错误处理。

Backend Tests 通过。

---

# Milestone 3 — Frontend Dashboard

完成：

```text
System Overview
GPU Cards
Process Table
```

确保 UI 第一版已经达到可展示水平。

---

# Milestone 4 — Historical Metrics

完成：

```text
SQLite
Background Collector
History API
Charts
```

支持：

```text
1H
6H
24H
```

---

# Milestone 5 — Product Polish

完成：

```text
Loading
Empty State
Error State
Dark UI
Responsive
Formatting
Sorting
Filtering
```

Process Table 至少支持：

```text
Sort
GPU filter
Search
```

---

# Milestone 6 — Deployment

完成：

```text
Dockerfile
docker-compose.yml
Environment Variables
Production Build
```

验证：

```bash
docker compose up --build
```

可以运行。

---

# Milestone 7 — QA

运行：

```text
Backend Unit Tests
Backend Integration Tests
Frontend Tests
Playwright E2E
Docker Smoke Test
```

修复：

```text
Broken UI
Console errors
API errors
Unhandled exceptions
```

---

# Milestone 8 — GitHub Release

README 至少包含：

```text
Project Logo / Name
Description
Hero Screenshot
Features
Quick Start
Screenshots
Architecture
Configuration
API
Tech Stack
Limitations
Roadmap
License
```

Release：

```text
v1.0.0
```

---

# 25. Automated Testing Requirements

不得只依赖人工测试。

## Collector Tests

Mock：

```text
psutil
NVML
```

验证：

```text
Normal GPU
No GPU
Unsupported Power
Exited Process
NVML Failure
```

---

## API Tests

至少：

```text
health returns 200
system returns valid schema
gpu endpoint works
history range validation works
```

---

## Frontend

测试关键：

```text
Dashboard renders
GPU card renders
No-GPU state works
Process table works
```

---

## E2E

至少三个流程：

```text
Dashboard loads

GPU information appears

History range can switch
```

测试环境可以使用 Mock Backend。

---

# 26. Demo Data Mode

强烈建议实现：

```text
LABWATCH_DEMO_MODE=true
```

作用：

即使 GitHub 用户没有 NVIDIA GPU，也可以展示：

```text
Fake GPUs
Fake Processes
Fake History
```

这对：

```text
CI
Screenshots
README
Demo
Frontend Development
```

非常有帮助。

并显著提高项目的可展示性。

Demo Mode 必须明确标记：

```text
Demo Data
```

避免误导。

---

# 27. CI

GitHub Actions 至少：

```text
Backend Tests
Frontend Tests
Frontend Build
```

如果成本合理：

加入：

```text
Docker Build
```

PR / Push 必须自动运行。

---

# 28. Code Quality

要求：

```text
Type hints
TypeScript strict mode
Clear naming
Reasonable modularity
No giant files
No duplicated collectors
No hard-coded server paths
```

但禁止为了“架构漂亮”引入：

```text
Microservices
Event Bus
Redis
Kafka
Celery
Repository Pattern everywhere
Complex DI framework
```

保持简单。

---

# 29. Logging

Backend 使用标准 logging。

必须记录：

```text
Application startup
NVML availability
Collector failures
Database failures
Unexpected exceptions
```

正常采样不要刷屏。

---

# 30. Performance Requirements

LabWatch 不需要追求高性能。

目标：

```text
Dashboard load < 2 seconds on LAN

API typical response < 500ms

Collector should not noticeably affect server workload
```

正常运行时 LabWatch 本身：

```text
CPU usage should remain low
RAM should remain reasonable
```

不能为了监控 GPU 消耗大量资源。

---

# 31. Definition of Done

只有以下全部完成才能声称 v1 完成：

```text
Core monitoring works
Multi-GPU on one host works
GPU process mapping works
Historical charts work
No-GPU failure is graceful
Tests pass
CI passes
Docker works
README complete
Screenshots complete
Architecture diagram complete
Demo mode works
No major console/API errors
Repository clean
v1.0.0 release-ready
```

---

# 32. User Acceptance Checklist

最终交付给用户验收时，用户只需要完成：

### Test 1

打开 Dashboard。

确认实际服务器：

```text
CPU
RAM
Disk
GPU
```

与真实情况基本一致。

---

### Test 2

运行：

```bash
nvidia-smi
```

与 LabWatch GPU 数据对比。

---

### Test 3

启动 Python GPU Process。

确认它出现在：

```text
GPU Processes
```

---

### Test 4

停止 Process。

确认其自动消失。

---

### Test 5

运行至少 10 分钟。

确认 Historical Charts 出现。

---

### Test 6

刷新浏览器。

历史数据仍存在。

---

### Test 7

重新启动 LabWatch。

历史数据库正常。

---

### Test 8

Docker 部署成功。

---

# 33. Final Deliverables

最终必须交付：

```text
Working Repository

README.md

Docker deployment

Tests

GitHub Actions

Screenshots

Demo GIF

Architecture Diagram

v1.0 Release Notes

PROJECT_REPORT.html
```

其中：

```text
PROJECT_REPORT.html
```

作为唯一完整开发汇报文档。

不要创建大量重复：

```text
status1.md
status2.md
notes.md
final_report2.md
debug_report.md
```

报告中统一展示：

```text
Implemented Features
Architecture
Screenshots
Tests
Test Results
Known Limitations
Bugs Fixed
Remaining Issues
Release Readiness
```

---

# 34. Autonomous Execution Policy

Codex 必须以高自主度工作。

```text
AUTONOMOUS EXECUTION POLICY

The user expects approximately 95% autonomous execution.

You should independently:

- initialize the repository;
- choose reasonable implementation details;
- implement backend and frontend;
- create tests;
- debug failures;
- refactor when necessary;
- build Docker deployment;
- configure CI;
- create documentation;
- prepare screenshots and demo materials;
- perform final QA.

Do not stop to ask the user about ordinary engineering decisions.

Do not ask about:
- naming minor variables;
- package choice when alternatives are equivalent;
- folder organization;
- small UI details;
- ordinary dependency errors;
- test failures;
- common implementation bugs.

When an error occurs:

1. inspect the error;
2. determine the likely root cause;
3. attempt a fix;
4. run relevant tests;
5. inspect the result;
6. repeat if necessary.

Escalate only when:

1. requirements fundamentally conflict;
2. credentials or private information are required;
3. a destructive or irreversible operation requires approval;
4. the environment prevents implementation;
5. multiple serious debugging attempts have failed.

Do not expand project scope without a clear product reason.

The priority order is:

1. Correctness
2. Usability
3. Reliability
4. Simplicity
5. Visual quality
6. Additional features
```

---

# 35. Scope Protection

如果开发过程中出现：

> “顺手还可以加……”

默认答案：

**不加。**

特别禁止在 v1 开发过程中扩展：

```text
Multi-server
Alerts
SSH
Terminal
Logs
Authentication
Cloud
Agent
LLM
Job scheduling
```

先完成一个优秀的：

> Single-host AI Server Monitor.

后续只有在用户实际使用 LabWatch 后确实产生需求，才进入：

```text
v1.1
v1.2
v2.0
```

---

# 36. Final Goal

LabWatch v1 最终不应该让人感觉：

> “这是一个学生练习项目。”

而应该让陌生 GitHub 用户看到 README 后认为：

> “这个东西很简单，但我确实可以拿来监控自己的 GPU Server。”

这就是项目成功的标准。
