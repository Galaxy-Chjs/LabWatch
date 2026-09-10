"""Shared pytest fixtures."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import Settings  # noqa: E402
from app.database import Database  # noqa: E402
from app.services import HistoryService  # noqa: E402


@pytest.fixture
def tmp_settings(tmp_path: Path) -> Settings:
    """Settings pointing at an isolated temporary database, no background task."""
    return Settings(
        data_dir=tmp_path,
        enable_background_collector=False,
        demo_mode=False,
        history_interval=1.0,
        poll_interval=0.5,
        _env_file=None,
    )


@pytest.fixture
def demo_settings(tmp_path: Path) -> Settings:
    """Settings in demo mode with an isolated database."""
    return Settings(
        data_dir=tmp_path,
        enable_background_collector=False,
        demo_mode=True,
        history_interval=1.0,
        _env_file=None,
    )


@pytest.fixture
def database(tmp_path: Path) -> Database:
    """A SQLite database in a temporary directory."""
    db = Database(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    db.create_all()
    yield db
    db.dispose()


@pytest.fixture
def history(database: Database) -> HistoryService:
    """History service bound to the temporary database."""
    return HistoryService(database=database, retention_hours=24.0)
