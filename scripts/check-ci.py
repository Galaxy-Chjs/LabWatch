#!/usr/bin/env python
"""Print a compact summary of the CI jobs, with a structural sanity check.

CI is the thing that catches everything else, so a mistake in it is expensive:
a job that does not run looks exactly like a job that passed. This prints the job
graph and fails if a job has no steps or references an unknown dependency.
"""

from __future__ import annotations

import pathlib
import sys

import yaml


def main(argv: list[str]) -> int:
    path = pathlib.Path(argv[1] if len(argv) > 1 else ".github/workflows/ci.yml")
    if not path.is_file():
        print(f"not found: {path}")
        return 2

    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    jobs: dict = document.get("jobs", {})
    if not jobs:
        print("no jobs defined")
        return 1

    problems: list[str] = []
    for name, job in jobs.items():
        steps = job.get("steps", [])
        needs = job.get("needs", [])
        needs = [needs] if isinstance(needs, str) else list(needs)
        label = job.get("name", "(no name)")
        print(f"  {name:<10} needs={','.join(needs) if needs else '-':<22} steps={len(steps):<3} {label}")
        if not steps:
            problems.append(f"{name}: no steps")
        for dependency in needs:
            if dependency not in jobs:
                problems.append(f"{name}: needs unknown job '{dependency}'")
        for step in steps:
            if "uses" not in step and "run" not in step:
                problems.append(f"{name}: step {step.get('name', '?')!r} has neither 'uses' nor 'run'")

    for problem in problems:
        print(f"  PROBLEM {problem}")
    print(f"\n{len(jobs)} job(s), {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
