#!/usr/bin/env python
"""Parse the package with an older grammar to catch version-specific syntax.

``requires-python = ">=3.10"`` is a promise, and it is easy to break silently:
f-strings with reused quote characters, ``match`` statements, or PEP 695 type
parameters all parse fine on a modern interpreter and fail on the oldest
supported one. CI runs 3.12, so nothing else catches this.

Usage:
    python scripts/check-syntax-floor.py [package_dir] [3.10]
"""

from __future__ import annotations

import ast
import pathlib
import sys


def main(argv: list[str]) -> int:
    target = pathlib.Path(argv[1] if len(argv) > 1 else "labwatch")
    raw = argv[2] if len(argv) > 2 else "3.10"
    major, minor = (int(part) for part in raw.split(".")[:2])

    if not target.is_dir():
        print(f"not a directory: {target}")
        return 2

    files = sorted(target.rglob("*.py"))
    problems: list[str] = []
    for path in files:
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path), feature_version=(major, minor))
        except SyntaxError as exc:
            problems.append(f"{path}:{exc.lineno}: {exc.msg}")

    for problem in problems:
        print(problem)
    print(f"\n{len(problems)} syntax error(s) under Python {raw} across {len(files)} file(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
