# LabWatch Lite - multi-stage build.
#
# No `# syntax=` directive on purpose: this Dockerfile only uses portable
# instructions, and requiring a frontend image download breaks builds on hosts
# whose registry route is restricted or IPv6-only.

# ---------------------------------------------------------------------------
# Stage 1: build the React dashboard
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend

WORKDIR /app

# Install dependencies first so the layer is cached across source changes.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: backend runtime with the built dashboard baked in
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    LABWATCH_HOST=0.0.0.0 \
    LABWATCH_PORT=8000 \
    LABWATCH_DATA_DIR=/data \
    LABWATCH_STATIC_DIR=/app/static

WORKDIR /app

# curl is used by the container healthcheck; tini reaps zombie processes.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl tini \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=frontend /app/dist ./static

# The SQLite database lives on a volume so history survives restarts.
RUN mkdir -p /data
VOLUME ["/data"]

# Run unprivileged. NVML needs read access to the driver, which the container
# gets through the NVIDIA Container Toolkit, not through root.
RUN useradd --create-home --uid 10001 labwatch \
    && chown -R labwatch:labwatch /app /data
USER labwatch

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "uvicorn app.main:app --host ${LABWATCH_HOST} --port ${LABWATCH_PORT} --log-level ${LABWATCH_LOG_LEVEL:-info}"]
