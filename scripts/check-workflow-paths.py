#!/usr/bin/env python
"""Check that the paths CI commands refer to actually exist.

Twice during the v1.1 work a workflow named a path that a refactor had deleted
(``ruff check labwatch backend`` after ``backend/`` was removed). The job then
fails with "file not found" — a red build with no lint problem behind it, which
sends you looking at the code instead of the workflow.

This walks every ``run:`` step in the workflows, pulls out the arguments that
look like repository paths, and fails if one is missing. It is a heuristic: it
only considers arguments that look like a relative path, and it skips anything
starting with ``-`` (a flag), containing ``=`` (an assignment), or ``$`` (a shell
expression).

Usage:
    python scripts/check-workflow-paths.py [repo_root]
"""

from __future__ import annotations

import pathlib
import re
import shlex
import sys

import yaml

# Commands whose non-flag arguments are filesystem paths.
PATH_TAKING = {"ruff", "python", "pytest", "mypy", "twine", "pytest-cov"}

# Arguments that are definitely not repository paths.
IGNORED_VALUES = {
    "check",
    "version",
    "validate",
    "format",
    "build",
    "--help",
    "-m",
    "-e",
    "-q",
    "-t",
    "run",
}

# Paths a step creates itself, so they legitimately do not exist beforehand.
GENERATED = {
    "dist",
    "build",
    "venv",
    ".venv",
    "node_modules",
    "htmlcov",
    "coverage.xml",
    ".coverage",
    "out",
}

# A bare version number, e.g. the `3.10` in `check-syntax-floor.py labwatch 3.10`.
VERSION_LIKE = re.compile(r"^\d+(\.\d+)*$")

# A path-looking token: letters, digits, and . _ - / \ only.
PATH_LIKE = re.compile(r"^[A-Za-z0-9._][A-Za-z0-9._/-]*$")


def candidates(command: str) -> list[str]:
    """Return the tokens in a shell command that look like repository paths."""
    found: list[str] = []
    for line in command.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        try:
            tokens = shlex.split(stripped, comments=True)
        except ValueError:
            # Unbalanced quoting in a heredoc or shell expression; skip the line.
            continue
        if not tokens:
            continue
        # Handle `cd foo && ruff check bar`, `if ... ; then`, pipelines.
        segment: list[str] = []
        for token in tokens:
            if token in {"&&", "||", ";", "|", "then", "else", "do", "fi"}:
                found.extend(_paths_in(segment))
                segment = []
                continue
            segment.append(token)
        found.extend(_paths_in(segment))
    return found


def _paths_in(tokens: list[str]) -> list[str]:
    """Extract path-like arguments from one shell command segment."""
    if not tokens:
        return []
    executable = pathlib.PurePath(tokens[0]).name
    if executable not in PATH_TAKING:
        return []
    results: list[str] = []
    skip_next = False
    for token in tokens[1:]:
        if skip_next:
            skip_next = False
            continue
        if token in IGNORED_VALUES:
            continue
        if token.startswith("-"):
            # Flags that consume a value (`--cov X`, `-p name`) are not paths
            # unless the value looks like one; only skip the flag itself.
            skip_next = token in {"--python-version", "--platform", "--abi", "--implementation", "--dest", "-o", "-p"}
            continue
        if "=" in token or "$" in token or "*" in token or token.startswith(".") and len(token) > 1:
            # Assignments, shell expansions, globs and dotted flags.
            if not token.startswith("./") and not token.startswith("../"):
                continue
        if not PATH_LIKE.match(token):
            continue
        if VERSION_LIKE.match(token) or token in GENERATED:
            continue
        results.append(token.rstrip("/"))
    return results


def main(argv: list[str]) -> int:
    root = pathlib.Path(argv[1] if len(argv) > 1 else ".")
    workflows = sorted((root / ".github" / "workflows").glob("*.y*ml"))
    if not workflows:
        print("no workflows found")
        return 2

    problems: list[str] = []
    checked = 0
    for workflow in workflows:
        document = yaml.safe_load(workflow.read_text(encoding="utf-8")) or {}
        for job_name, job in (document.get("jobs") or {}).items():
            default_cwd = ((job.get("defaults") or {}).get("run") or {}).get("working-directory")
            for step in job.get("steps") or []:
                run = step.get("run")
                if not run:
                    continue
                cwd = (step.get("working-directory") or default_cwd or "")
                for candidate in candidates(run):
                    checked += 1
                    base = root / cwd if cwd else root
                    if not (base / candidate).exists():
                        problems.append(
                            f"{workflow.name}:{job_name}: {step.get('name', 'run')!r} -> "
                            f"{cwd + '/' if cwd else ''}{candidate} does not exist"
                        )

    for problem in problems:
        print(f"  {problem}")
    print(f"\n{checked} path argument(s) checked, {len(problems)} missing")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
