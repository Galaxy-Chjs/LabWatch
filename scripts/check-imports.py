#!/usr/bin/env python
"""Verify that every relative import inside a package resolves to a real module.

Structural refactors break relative imports silently until the affected code path
runs. This walks the package, resolves each ``from ..x import y`` against the
files that actually exist, and reports anything that points outside the package.

Usage:
    python scripts/check-imports.py [package_dir]
"""

from __future__ import annotations

import ast
import pathlib
import sys


def modules_in(package: pathlib.Path) -> set[tuple[str, ...]]:
    """Every importable module path inside ``package``, as dotted tuples."""
    root = package.parent
    found: set[tuple[str, ...]] = set()
    for path in package.rglob("*.py"):
        parts = list(path.relative_to(root).with_suffix("").parts)
        if parts[-1] == "__init__":
            parts.pop()
        found.add(tuple(parts))
    return found


def resolve(package_of_module: tuple[str, ...], level: int, name: str | None) -> tuple[str, ...]:
    """Absolute target of a relative import.

    ``level`` counts dots: 1 is the module's own package, 2 its parent, and so on.
    """
    base = package_of_module[: len(package_of_module) - (level - 1)]
    if name:
        base = base + tuple(name.split("."))
    return base


def main(argv: list[str]) -> int:
    target = pathlib.Path(argv[1] if len(argv) > 1 else "labwatch")
    if not target.is_dir():
        print(f"not a directory: {target}")
        return 2

    existing = modules_in(target)
    problems: list[str] = []

    for path in sorted(target.rglob("*.py")):
        parts = list(path.relative_to(target.parent).with_suffix("").parts)
        module_pkg = tuple(parts[:-1]) if path.name != "__init__.py" else tuple(
            parts[:-1] if parts[-1] == "__init__" else parts
        )
        if path.name == "__init__.py":
            module_pkg = tuple(parts[:-1])

        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom) or not node.level:
                continue
            resolved = resolve(module_pkg, node.level, node.module)
            if resolved in existing:
                continue
            # A submodule of an existing package is fine even if not seen above.
            if any(candidate[: len(resolved)] == resolved for candidate in existing):
                continue
            source = "." * node.level + (node.module or "")
            problems.append(f"{path}:{node.lineno}: {source} -> {'.'.join(resolved)} (does not exist)")

    for problem in problems:
        print(problem)
    print(f"\n{len(problems)} broken relative import(s) in {target}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
