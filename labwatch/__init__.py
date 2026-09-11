"""LabWatch Lite — watch your GPUs without leaving the terminal.

``labwatch`` starts a local dashboard that reads NVIDIA telemetry through NVML
and host metrics through psutil, and serves a React UI from the same process.
Everything is read-only: LabWatch never starts, stops or signals a workload.
"""

from __future__ import annotations

__version__ = "1.1.0"

__all__ = ["__version__"]
