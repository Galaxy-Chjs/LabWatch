"""Allow ``python -m labwatch`` as an alternative to the console script."""

from __future__ import annotations

from .cli import main

if __name__ == "__main__":  # pragma: no cover - trivial entry point
    raise SystemExit(main())
