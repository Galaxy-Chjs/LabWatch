"""SQLAlchemy setup and history models.

The database stores only the two time series used by the charts; live GPU
process information is intentionally never persisted.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Float, Index, Integer, String, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Declarative base for all LabWatch tables."""


class HostSample(Base):
    """Persisted host level sample."""

    __tablename__ = "host_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    cpu_percent: Mapped[float | None] = mapped_column(Float)
    memory_used: Mapped[int | None] = mapped_column(Integer)
    memory_total: Mapped[int | None] = mapped_column(Integer)
    memory_percent: Mapped[float | None] = mapped_column(Float)
    disk_used: Mapped[int | None] = mapped_column(Integer)
    disk_total: Mapped[int | None] = mapped_column(Integer)
    disk_percent: Mapped[float | None] = mapped_column(Float)


class GpuSample(Base):
    """Persisted per-GPU sample."""

    __tablename__ = "gpu_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    gpu_index: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    gpu_uuid: Mapped[str | None] = mapped_column(String(64))
    utilization: Mapped[float | None] = mapped_column(Float)
    memory_used: Mapped[int | None] = mapped_column(Integer)
    memory_total: Mapped[int | None] = mapped_column(Integer)
    memory_percent: Mapped[float | None] = mapped_column(Float)
    temperature: Mapped[float | None] = mapped_column(Float)
    power_usage: Mapped[float | None] = mapped_column(Float)
    power_limit: Mapped[float | None] = mapped_column(Float)

    __table_args__ = (Index("ix_gpu_samples_index_ts", "gpu_index", "timestamp"),)


def create_db_engine(database_url: str) -> Engine:
    """Create an engine with sane SQLite defaults (WAL, foreign keys, timeouts)."""
    is_sqlite = database_url.startswith("sqlite")
    if is_sqlite:
        # ``sqlite:///relative/path.db`` or ``sqlite:////abs/path.db``
        raw_path = database_url.split("sqlite:///", 1)[-1]
        if raw_path and raw_path != ":memory:":
            Path(raw_path).parent.mkdir(parents=True, exist_ok=True)
    connect_args = {"check_same_thread": False, "timeout": 15} if is_sqlite else {}
    engine = create_engine(database_url, future=True, connect_args=connect_args)

    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, _record):  # pragma: no cover - driver hook
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
                cursor.execute("PRAGMA busy_timeout=15000")
            finally:
                cursor.close()

    return engine


class Database:
    """Owns the engine/session factory and creates the schema."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self.engine = create_db_engine(database_url)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)

    def create_all(self) -> None:
        """Create any missing tables."""
        Base.metadata.create_all(self.engine)

    def dispose(self) -> None:
        """Dispose of the connection pool."""
        self.engine.dispose()

    @contextmanager
    def session(self) -> Iterator[Session]:
        """Transactional session scope; rolls back and logs on failure."""
        session = self.session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            logger.exception("Database operation failed")
            raise
        finally:
            session.close()
