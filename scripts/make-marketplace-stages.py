"""Build staged copies of the extension to bisect the Marketplace refusal.

The publisher account is fine: an inert 3 KB extension uploaded successfully.
So the trigger is inside this package. Rather than guessing again, this produces
four VSIX files, each adding back one suspect on top of the previous one, so a
single upload tells you which stage trips the check.

The staged manifest is patched *inside the VSIX only* - nothing in the
repository is modified.

Usage:
    python scripts/make-marketplace-stages.py
"""

from __future__ import annotations

import json
import pathlib
import shutil
import zipfile

REPO = pathlib.Path(__file__).resolve().parent.parent
EXT = REPO / "vscode-extension"
BASE_VSIX = EXT / "labwatch-vscode-1.1.0.vsix"
OUT_DIR = REPO / "dist-vsix"

# Everything the real manifest declares, kept for stage 4.
FULL_DESCRIPTION = (
    "See your NVIDIA GPU state in the status bar and sidebar, and open the LabWatch "
    "dashboard. Works locally and over Remote-SSH."
)
FULL_CATEGORIES = ["Other", "Visualization"]
FULL_KEYWORDS = ["gpu", "nvidia", "cuda", "monitoring", "remote-ssh"]

STAGES = [
    {
        "name": "stage1-minimal-metadata",
        "note": "no 'monitor' wording, one category, no viewsWelcome, no configuration schema",
        "description": "Show NVIDIA GPU utilisation, memory and temperature in the VS Code status bar and sidebar.",
        "categories": ["Visualization"],
        "keywords": ["gpu", "nvidia", "cuda", "status-bar"],
        "drop": ["viewsWelcome", "configuration"],
    },
    {
        "name": "stage2-monitor-wording",
        "note": "same as stage 1, but the description and keywords use monitoring language",
        "description": FULL_DESCRIPTION,
        "categories": ["Visualization"],
        "keywords": FULL_KEYWORDS,
        "drop": ["viewsWelcome", "configuration"],
    },
    {
        "name": "stage3-views-welcome",
        "note": "stage 2 plus the viewsWelcome markdown and its command links",
        "description": FULL_DESCRIPTION,
        "categories": FULL_CATEGORIES,
        "keywords": FULL_KEYWORDS,
        "drop": ["configuration"],
    },
    {
        "name": "stage4-no-startup-activation",
        "note": "stage 3 plus an empty activationEvents - nothing runs at editor startup",
        "description": FULL_DESCRIPTION,
        "categories": FULL_CATEGORIES,
        "keywords": FULL_KEYWORDS,
        "drop": ["configuration"],
        "activation_events": [],
    },
    {
        "name": "stage5-full-manifest",
        "note": "the shipping manifest; identical to the current package",
        "description": FULL_DESCRIPTION,
        "categories": FULL_CATEGORIES,
        "keywords": FULL_KEYWORDS,
        "drop": [],
    },
]


def build(stage: dict) -> pathlib.Path:
    OUT_DIR.mkdir(exist_ok=True)
    target = OUT_DIR / f"labwatch-vscode-1.1.0-{stage['name']}.vsix"

    with zipfile.ZipFile(BASE_VSIX) as source:
        items = {info.filename: source.read(info.filename) for info in source.infolist()}

    manifest = json.loads(items["extension/package.json"])
    manifest["description"] = stage["description"]
    manifest["categories"] = stage["categories"]
    manifest["keywords"] = stage["keywords"]
    if "activation_events" in stage:
        manifest["activationEvents"] = stage["activation_events"]
    for key in stage["drop"]:
        manifest.get("contributes", {}).pop(key, None)

    items["extension/package.json"] = json.dumps(manifest, indent=2).encode()

    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as out:
        for name, payload in items.items():
            out.writestr(name, payload)

    return target


def main() -> None:
    if not BASE_VSIX.is_file():
        raise SystemExit(f"build the base package first: {BASE_VSIX}")
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)

    print(f"base: {BASE_VSIX.name} ({BASE_VSIX.stat().st_size} bytes)\n")
    for stage in STAGES:
        path = build(stage)
        print(f"{path.name}  ({path.stat().st_size} bytes)")
        print(f"   {stage['note']}")
    print(
        "\nUpload them in order through the Manage page, one at a time, and stop at\n"
        "the first refusal - that stage is the trigger. Unpublish any that succeed."
    )


if __name__ == "__main__":
    main()
