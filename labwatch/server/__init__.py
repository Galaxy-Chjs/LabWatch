"""LabWatch server package.

The FastAPI application, collectors and services live here. ``__version__`` is
re-exported from the top-level package so there is a single source of truth for
the version number.
"""

from .. import __version__

__all__ = ["__version__"]
