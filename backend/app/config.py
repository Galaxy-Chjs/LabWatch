"""Application settings, loaded from environment variables with the ``LABWATCH_`` prefix."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime configuration for LabWatch Lite.

    All values can be overridden with ``LABWATCH_``-prefixed environment
    variables, e.g. ``LABWATCH_POLL_INTERVAL=2``.
    """

    model_config = SettingsConfigDict(
        env_prefix="LABWATCH_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- collection cadence -------------------------------------------------
    poll_interval: float = Field(
        default=2.0,
        gt=0,
        description="Seconds between live samples served to the dashboard.",
    )
    history_interval: float = Field(
        default=10.0,
        gt=0,
        description="Seconds between persisted history rows.",
    )
    retention_hours: float = Field(
        default=24.0,
        gt=0,
        description="How long history rows are kept before pruning.",
    )
    retention_max_rows: int = Field(
        default=200_000,
        gt=0,
        description="Hard safety cap on rows per history table, oldest pruned first.",
    )

    # --- storage ------------------------------------------------------------
    database_url: str = Field(
        default="",
        description="SQLAlchemy database URL. Defaults to SQLite inside the data dir.",
    )
    data_dir: Path = Field(
        default=BACKEND_DIR / "data",
        description="Directory holding the SQLite database file.",
    )

    # --- server -------------------------------------------------------------
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"
    cors_origins: str = Field(
        default="*",
        description="Comma separated list of allowed origins, or '*' for any.",
    )

    # --- behaviour ----------------------------------------------------------
    include_all_mounts: bool = Field(
        default=True,
        description=(
            "Report every real mounted filesystem, not just the root one. On a lab "
            "server the data volume behind a full disk is usually not the root "
            "filesystem, so hiding it would hide the problem."
        ),
    )
    max_mounts: int = Field(
        default=8,
        gt=0,
        description="Safety cap on how many filesystems are reported.",
    )
    demo_mode: bool = Field(
        default=False,
        description="Serve deterministic synthetic GPU data instead of real hardware.",
    )
    enable_background_collector: bool = Field(
        default=True,
        description="Persist history samples in the background.",
    )
    collect_commands: bool = Field(
        default=True,
        description="Resolve full process command lines (may be slow on some hosts).",
    )
    include_graphics_processes: bool = Field(
        default=False,
        description=(
            "Also list graphics contexts (NVML 'G' processes). On Windows desktops this "
            "includes every compositing GUI process, which drowns out training jobs."
        ),
    )
    process_limit: int = Field(
        default=64,
        gt=0,
        description="Maximum number of GPU processes enriched per sample.",
    )
    static_dir: Path | None = Field(
        default=None,
        description="Optional directory with a pre-built frontend to serve.",
    )

    @field_validator("log_level")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        return value.upper()

    @property
    def cors_origin_list(self) -> list[str]:
        """Parsed CORS origin list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_database_url(self) -> str:
        """SQLite URL, defaulting to ``<data_dir>/labwatch.db``."""
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(self.data_dir / 'labwatch.db').as_posix()}"

    @property
    def resolved_static_dir(self) -> Path | None:
        """Directory of a pre-built frontend bundle, if one is present."""
        if self.static_dir is not None:
            candidate = Path(self.static_dir)
            return candidate if candidate.is_dir() else None
        candidate = BACKEND_DIR / "static"
        return candidate if candidate.is_dir() else None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()
