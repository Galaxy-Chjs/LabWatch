"""Bisect the last three differences from the version that passes.

Established by upload, in order:

  * no tags + a description that never says GPU            -> PASSED
  * description says GPU + tags `gpu`                      -> PASSED  (1.1.1)
  * description says GPU + tags `gpu,nvidia`                -> PASSED  (1.1.2)
  * description says GPU + tags `gpu,nvidia,cuda`           -> PASSED  (1.1.3)
  * the original manifest: tags `gpu,nvidia,cuda,monitoring,remote-ssh`,
    description "See your NVIDIA GPU state ...", full contributes -> REFUSED

Only three things separate the refused manifest from the passing one:

  A. the vendor word in the description  ("NVIDIA")
  B. the extra tags                      (`monitoring`, `remote-ssh`)
  C. the rest of `contributes`           (`viewsWelcome`, `configuration`)

Each variant below adds exactly one of them onto the passing 1.1.3 shape, so the
first refusal names the culprit. The identity stays `labwatch-gpu-status` /
"LabWatch GPU Status" - it is already established on the listing and must never
change; only the version rises.

Usage:
    python scripts/make-keyword-variants.py
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import zipfile

REPO = pathlib.Path(__file__).resolve().parent.parent
EXT = REPO / "vscode-extension"
PKG = EXT / "package.json"
OUT_DIR = REPO / "dist-vsix"

# Already published on the listing. Never change either of these.
EXTENSION_NAME = "labwatch-gpu-status"
DISPLAY_NAME = "LabWatch GPU Status"

NEUTRAL_DESCRIPTION = "Show GPU utilisation, memory and temperature in the VS Code status bar and sidebar."
VENDOR_DESCRIPTION = (
    "Show NVIDIA GPU utilisation, memory and temperature in the VS Code status bar and sidebar."
)

PASSING_KEYWORDS = ["gpu", "nvidia", "cuda"]
FULL_KEYWORDS = ["gpu", "nvidia", "cuda", "monitoring", "remote-ssh"]

# (version, label, description, keywords, restore full contributes, meaning)
VARIANTS: list[tuple[str, str, str, list[str], bool, str]] = [
    (
        "1.1.4",
        "vendor-description",
        VENDOR_DESCRIPTION,
        PASSING_KEYWORDS,
        False,
        "A: the word NVIDIA in the description -> if refused, edit the description",
    ),
    (
        "1.1.5",
        "extra-keywords",
        NEUTRAL_DESCRIPTION,
        FULL_KEYWORDS,
        False,
        "B: the tags monitoring, remote-ssh -> if refused, drop those tags",
    ),
    (
        "1.1.6",
        "full-contributes",
        NEUTRAL_DESCRIPTION,
        PASSING_KEYWORDS,
        True,
        "C: viewsWelcome and the configuration schema -> if refused, trim those",
    ),
    (
        "1.1.7",
        "all-three",
        VENDOR_DESCRIPTION,
        FULL_KEYWORDS,
        True,
        "A+B+C together: should reproduce the refusal and confirm the bisection",
    ),
]


def vsce(*args: str) -> None:
    result = subprocess.run(
        ["npx", "--yes", "@vscode/vsce", *args],
        cwd=EXT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=sys.platform == "win32",
    )
    if result.returncode != 0:
        raise SystemExit(f"vsce {' '.join(args)} failed:\n{result.stdout}\n{result.stderr}")


def main() -> None:
    original = PKG.read_text(encoding="utf-8")
    OUT_DIR.mkdir(exist_ok=True)

    try:
        print(f"identity (published, never varied): {EXTENSION_NAME} / {DISPLAY_NAME}\n")
        for version, label, description, keywords, full_contributes, meaning in VARIANTS:
            candidate = json.loads(original)
            candidate["name"] = EXTENSION_NAME
            candidate["version"] = version
            candidate["displayName"] = DISPLAY_NAME
            candidate["description"] = description
            candidate["keywords"] = keywords
            candidate["categories"] = ["Visualization"]
            if not full_contributes:
                candidate["contributes"].pop("viewsWelcome", None)
                candidate["contributes"].pop("configuration", None)
            candidate.pop("scripts", None)
            candidate.pop("devDependencies", None)
            candidate["contributes"]["viewsContainers"]["activitybar"][0]["title"] = DISPLAY_NAME

            target = OUT_DIR / f"{EXTENSION_NAME}-{version}-{label}.vsix"
            PKG.write_text(json.dumps(candidate, indent=2) + "\n", encoding="utf-8")
            vsce("package", "--no-dependencies", "--out", str(target))

            with zipfile.ZipFile(target) as archive:
                inner = json.loads(archive.read("extension/package.json"))
                vsixmanifest = archive.read("extension.vsixmanifest").decode("utf-8")
            tags = next(
                (line.strip() for line in vsixmanifest.splitlines() if "<Tags>" in line),
                "(no Tags element)",
            )

            expected = ",".join(keywords)
            actual = tags.replace("<Tags>", "").replace("</Tags>", "").strip()
            contributes = sorted(inner["contributes"])
            problems = []
            if actual != expected:
                problems.append(f"tags {actual!r} != {expected!r}")
            if inner["name"] != EXTENSION_NAME or inner["version"] != version:
                problems.append("identity mismatch")
            if inner["displayName"] != DISPLAY_NAME:
                problems.append(f"display name {inner['displayName']!r}")
            if problems:
                raise SystemExit(f"{label}: " + "; ".join(problems))

            print(f"{version}  {target.name}  ({target.stat().st_size} bytes)")
            print(f"   tags       : {actual}")
            print(f"   description: {description[:60]}...")
            print(f"   contributes: {contributes}")
            print(f"   {meaning}")
    finally:
        PKG.write_text(original, encoding="utf-8")

    print(
        f"\nwrote {len(VARIANTS)} packages to {OUT_DIR}\n"
        "upload in version order against the existing listing; no renaming"
    )


if __name__ == "__main__":
    main()
