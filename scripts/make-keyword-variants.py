"""Build the bisection variants under names that are still free.

Two naming facts, both learned from refusals:

  * The Marketplace reserves an **extension name** permanently. Deleting
    `labwatch-vscode` locked that name, so the new name is `labwatch-gpu`.
  * It reserves the **display name** separately and just as permanently:
    `labwatch-gpu` was refused with *"This extension display name is taken"* while
    it still said `displayName: "LabWatch"`. So every variant below carries its own
    display name, and a failure cannot burn the name the next variant needs.

What is already established: a vendor-free description with an empty tag list
*passes*. The remaining question is which added term is blocked, so the variants
differ only in description and keywords.

Versions increase with upload order because each attempt must outrank the last for
the same extension entry.

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

EXTENSION_NAME = "labwatch-gpu"

NEUTRAL_DESCRIPTION = (
    "Show graphics accelerator utilisation, memory and temperature in the VS Code status bar and sidebar."
)
VENDOR_DESCRIPTION = (
    "Show NVIDIA GPU utilisation, memory and temperature in the VS Code status bar and sidebar."
)

# (label, version, display name, changes, what a refusal here means)
VARIANTS: list[tuple[str, str, str, dict, str]] = [
    (
        "kw0-neutral",
        "1.1.0",
        "LabWatch GPU",
        {"description": NEUTRAL_DESCRIPTION, "keywords": []},
        "baseline under the new names - PASSED before (under the old name)",
    ),
    (
        "kw5-vendor-description",
        "1.1.1",
        "LabWatch GPU Status",
        {"description": VENDOR_DESCRIPTION, "keywords": []},
        "the *description* vocabulary (NVIDIA / GPU) is the trigger",
    ),
    (
        "kw1-gpu",
        "1.1.2",
        "LabWatch GPU Helper",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu"]},
        "the tag `gpu` is the trigger",
    ),
    (
        "kw2-gpu-nvidia",
        "1.1.3",
        "LabWatch Accelerator",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu", "nvidia"]},
        "the tag `nvidia` is the trigger",
    ),
    (
        "kw3-gpu-nvidia-cuda",
        "1.1.4",
        "LabWatch Accelerator View",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu", "nvidia", "cuda"]},
        "the tag `cuda` is the trigger",
    ),
    (
        "kw4-monitoring",
        "1.1.5",
        "LabWatch Status View",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu", "monitoring"]},
        "the tag `monitoring` is the trigger",
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
    used_names: set[str] = set()

    try:
        print(f"extension name: {EXTENSION_NAME}\n")
        for label, version, display, changes, meaning in VARIANTS:
            if display.lower() in used_names:
                raise SystemExit(f"display name {display!r} reused within one run")
            used_names.add(display.lower())

            candidate = json.loads(original)
            candidate.update(changes)
            candidate["name"] = EXTENSION_NAME
            candidate["version"] = version
            candidate["displayName"] = display
            candidate["categories"] = ["Visualization"]
            candidate["contributes"].pop("viewsWelcome", None)
            candidate["contributes"].pop("configuration", None)
            candidate.pop("scripts", None)
            candidate.pop("devDependencies", None)
            # The container title is shown in the Activity Bar; keep it distinct
            # from the reserved "LabWatch" string as well.
            candidate["contributes"]["viewsContainers"]["activitybar"][0]["title"] = display

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
            shown = next(
                (line.strip() for line in vsixmanifest.splitlines() if "<DisplayName>" in line),
                "(no DisplayName)",
            )

            expected = ",".join(changes["keywords"])
            actual = tags.replace("<Tags>", "").replace("</Tags>", "").strip()
            if actual != expected:
                raise SystemExit(f"{label}: tags mismatch, expected {expected!r} got {actual!r}")
            if inner["name"] != EXTENSION_NAME or inner["version"] != version:
                raise SystemExit(f"{label}: identity mismatch in the built package")
            if inner["displayName"] != display:
                raise SystemExit(f"{label}: display name mismatch in the built package")

            print(f"{version}  {target.name}  ({target.stat().st_size} bytes)")
            print(f"   {shown}")
            print(f"   tags: {actual or '(none)'}")
            print(f"   {meaning}")
    finally:
        PKG.write_text(original, encoding="utf-8")

    print(
        f"\nwrote {len(VARIANTS)} packages to {OUT_DIR}\n"
        "upload in version order; UNPUBLISH a successful one (never Remove/Delete)\n"
        "and never reuse a display name from a refused variant"
    )


if __name__ == "__main__":
    main()
