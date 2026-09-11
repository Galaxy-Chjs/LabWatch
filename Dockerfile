# LabWatch - multi-stage build.
#
# Deliberately dependency-free at the OS level: no apt package is installed, so
# the build does not need a working Debian mirror (which is a common failure on
# restricted networks) and the image stays small. The healthcheck uses the Python
# interpreter that is already present.

# ---------------------------------------------------------------------------
# Stage 1: build the React dashboard into the Python package's ui dir
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend

WORKDIR /app/frontend

# Install dependencies first so the layer is cached across source changes.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

# vite resolves outDir relative to its own config as ../labwatch/ui, so this
# layout has to mirror the repository: the build lands in /app/labwatch/ui.
COPY frontend/ ./
RUN npm run build && test -f /app/labwatch/ui/index.html

# ---------------------------------------------------------------------------
# Stage 2: install the Python package with the dashboard baked in
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    LABWATCH_HOST=0.0.0.0 \
    LABWATCH_PORT=8000 \
    LABWATCH_DATA_DIR=/data \
    LABWATCH_HISTORY_INTERVAL=10

WORKDIR /app

COPY pyproject.toml README.md LICENSE ./
COPY labwatch ./labwatch
COPY --from=frontend /app/labwatch/ui ./labwatch/ui

# Fails the build if the dashboard did not make it into the package, rather than
# shipping an API-only image that looks fine until someone opens the page.
RUN pip install --no-cache-dir . \
    && python -c "import pathlib, labwatch; p = pathlib.Path(labwatch.__file__).parent / 'ui' / 'index.html'; assert p.is_file(), f'bundled dashboard missing: {p}'; print('dashboard bundled:', p.stat().st_size, 'bytes')"

# The SQLite database lives on a volume so history survives restarts.
RUN mkdir -p /data

# Run unprivileged. NVML needs read access to the driver, which the container gets
# through the NVIDIA Container Toolkit, not through root.
RUN useradd --create-home --uid 10001 labwatch \
    && chown -R labwatch:labwatch /app /data
USER labwatch

VOLUME ["/data"]
EXPOSE 8000

# No curl in the image: use the interpreter that is already there.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import json,urllib.request,sys; sys.exit(0 if json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4))['status'] in ('ok','degraded') else 1)"]

# The console script is the same entry point a pip user gets, so the container and
# a local install exercise the same code path. uvicorn handles SIGTERM itself, so
# no init shim is needed.
CMD ["labwatch", "serve", "--host", "0.0.0.0", "--port", "8000", "--no-browser"]
