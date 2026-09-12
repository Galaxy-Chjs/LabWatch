"""Bundle the collector's wheels into the extension, for servers without PyPI.

Motivation. The machines LabWatch is for are GPU servers, and a GPU server is
often the one machine on the network with no outbound access. The one-click setup
would then fail at `pip install` for a reason the user cannot do anything about
from inside the editor.

So the wheels ship *inside* the VSIX, one directory per platform and interpreter:
`manylinux2014_x86_64-cp311`, `win_amd64-cp312`, and so on. Setup picks the
directory matching the interpreter it found, installs from it with `--no-index`,
and only reaches for PyPI when there is no match. The directory name must carry
both halves - a bundle keyed only by `cp311` hands Linux wheels to a Windows
interpreter, and pip then reports "No matching distribution", which reads like a
packaging bug and is not one.

Usage:
    python scripts/bundle-extension-wheels.py                 # the default matrix
    python scripts/bundle-extension-wheels.py manylinux2014_x86_64:3.11
"""

from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
TARGET = REPO / "vscode-extension" / "wheels"
DISTRIBUTION = "labwatch-lite"

# LabWatch's floor is 3.10, and the lab server runs 3.11. Windows is included so
# the same bundle covers a laptop, which is also where the setup gets tested.
DEFAULT_MATRIX = [
    f"manylinux2014_x86_64:{version}" for version in ("3.10", "3.11", "3.12")
] + [f"win_amd64:{version}" for version in ("3.11", "3.12")]


def download(target: str, run_python: str) -> tuple[int, int]:
    platform_tag, python_version = target.split(":")
    abi = f"cp{python_version.replace('.', '')}"
    destination = TARGET / f"{platform_tag}-{abi}"
    destination.mkdir(parents=True, exist_ok=True)

    command = [
        run_python,
        "-m",
        "pip",
        "download",
        DISTRIBUTION,
        "--only-binary=:all:",
        "--platform",
        platform_tag,
        "--python-version",
        python_version,
        "--implementation",
        "cp",
        "--abi",
        abi,
        "-d",
        str(destination),
    ]
    print(f"==> {platform_tag} {python_version}")
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        print(result.stdout[-1500:])
        print(result.stderr[-1500:], file=sys.stderr)
        raise SystemExit(f"download failed for {target}")

    wheels = list(destination.glob("*.whl"))
    return len(wheels), sum(wheel.stat().st_size for wheel in wheels)


def main(argv: list[str]) -> int:
    run_python = str(REPO / ".venv-test" / "Scripts" / "python.exe")
    if not pathlib.Path(run_python).is_file():
        run_python = sys.executable

    matrix = argv[1:] or DEFAULT_MATRIX

    if TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True)

    total = 0
    lines: list[str] = []
    for target in matrix:
        count, size = download(target, run_python)
        print(f"    {count} wheels, {size / 1e6:.1f} MB")
        total += size
        lines.append(f"- `{target.split(':')[0]}-cp{target.split(':')[1].replace('.', '')}`: {count} wheels, {size / 1e6:.1f} MB")

    (TARGET / "README.md").write_text(
        "# Bundled collector wheels\n\n"
        f"Wheels for `{DISTRIBUTION}`, one directory per platform and CPython ABI.\n"
        "`pythonEnv.ts` installs from the directory matching the interpreter it found,\n"
        "with `--no-index`, so a server with no outbound access still gets a working\n"
        "collector. Anything not covered here falls back to PyPI.\n\n"
        + "\n".join(lines)
        + "\n\nRegenerate with `python scripts/bundle-extension-wheels.py`.\n",
        encoding="utf-8",
    )

    print(f"\ntotal: {total / 1e6:.1f} MB in {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
