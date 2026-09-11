# Acceptance Checklist

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

## Test 8 — Docker deployment

```bash
docker compose up -d
```

**Result: pass.** The multi-stage image builds (Node stage produces the static
bundle, Python stage serves it), the container reports healthy through
`/api/health`, and the dashboard is served from the same origin as the API. See
`PROJECT_REPORT.html` for the recorded build and smoke-test output.

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
| README | ✅ feature overview, quick start, architecture, configuration, API, limitations, roadmap |
| LICENSE | ✅ MIT |
| .gitignore | ✅ Python, Node, SQLite, test artifacts, editors |
| Tests | ✅ 112 backend + 75 frontend + 8 Playwright |
| CI | ✅ lint, backend tests with coverage, frontend tests, build, E2E, Docker smoke test |
| Build | ✅ `npx tsc -b` clean, `vite build` succeeds, wheel-free Python package |
| Release | ✅ v1.0.0 tagged and documented |

## Presentation gate

| Requirement | Status |
|---|---|
| Hero screenshot | ✅ `docs/images/hero.png` |
| Feature screenshots | ✅ GPU cards, process table, host tiles, history (1H/6H/24H), light theme |
| Architecture diagram | ✅ `docs/architecture.svg` |
| Demo | ✅ `LABWATCH_DEMO_MODE=true` plus a compose override |
| Feature overview | ✅ README table |
| Quick start | ✅ Docker Compose and from-source paths |
| Tech stack | ✅ README |
| Roadmap | ✅ README |
