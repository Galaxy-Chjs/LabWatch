"""Copy the built dashboard into the extension so the webview panel can show it.

The dashboard has exactly one implementation: `frontend/`, whose build output is
committed under `labwatch/ui` and served by the collector to a browser. The webview
panel needs those same files on disk inside the extension, so this copies them -
there is no second build, which is what keeps the panel and the browser page from
ever disagreeing.

Run it before packaging:

    python scripts/sync-extension-dashboard.py
"""

from __future__ import annotations

import pathlib
import shutil
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
SOURCE = REPO / "labwatch" / "ui"
TARGET = REPO / "vscode-extension" / "dashboard"
REQUIRED = ("index.html", "favicon.svg")


def main() -> int:
    if not (SOURCE / "index.html").is_file():
        print(f"no built dashboard at {SOURCE}; run the frontend build first", file=sys.stderr)
        return 1

    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.copytree(SOURCE, TARGET)

    files = sorted(path for path in TARGET.rglob("*") if path.is_file())
    total = sum(path.stat().st_size for path in files)
    for required in REQUIRED:
        if not (TARGET / required).exists():
            print(f"expected {required} in the dashboard build", file=sys.stderr)
            return 1

    print(f"copied {len(files)} files, {total / 1024:.0f} KB -> {TARGET.relative_to(REPO)}")
    for path in files:
        print(f"  {path.relative_to(TARGET)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
