"""Build keyword variants to find which metadata term the Marketplace blocks.

Background. Marketplace Support told a comparable project that certain *keywords*
are blocked because they are used heavily in spam and malicious content. Two facts
are now established by experiment:

  * An inert 3 KB extension uploads fine under this publisher, so the account is
    not the problem.
  * The first variant below - no keywords, and a description that names no vendor
    or hardware - **uploads successfully**. So a vendor-free description and an
    empty tag list pass, and the blocked term is in the vocabulary that the later
    variants add back.

Two practical constraints shape this script:

1. `vsce` copies `keywords` into `extension.vsixmanifest` as `<Tags>` when it
   packages, so a variant must be produced by a real `vsce package` - patching the
   file inside an already-built VSIX tests nothing. (That mistake was made once.)
2. The Marketplace reserves an extension name permanently, so the bisection must
   run against a *single* extension entry, with each attempt at a higher version
   than the last. Versions are therefore assigned in upload order.

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

# The extension name used by every variant, so the whole bisection happens on one
# Marketplace entry. Renamed from `labwatch-vscode`: the first variant published
# under that name and was then deleted in the portal, which permanently reserves
# the name, so it can never be reused - not even by us.
EXTENSION_NAME = "labwatch-gpu"

BASE_VERSION = "1.1.0"
BASE_DESCRIPTION = (
    "Show graphics accelerator utilisation, memory and temperature in the VS Code status bar and sidebar."
)
VENDOR_DESCRIPTION = (
    "Show NVIDIA GPU utilisation, memory and temperature in the VS Code status bar and sidebar."
)

# (label, version, changes, what a refusal here tells us)
VARIANTS: list[tuple[str, str, dict, str]] = [
    (
        "kw0-neutral",
        "1.1.0",
        {"description": BASE_DESCRIPTION, "keywords": []},
        "baseline - PASSED: a vendor-free description with no tags is accepted",
    ),
    (
        "kw5-vendor-description",
        "1.1.1",
        {"description": VENDOR_DESCRIPTION, "keywords": []},
        "if this is refused, the *description* vocabulary is the trigger",
    ),
    (
        "kw1-gpu",
        "1.1.2",
        {"description": BASE_DESCRIPTION, "keywords": ["gpu"]},
        "if this is refused, the tag `gpu` is the trigger",
    ),
    (
        "kw2-gpu-nvidia",
        "1.1.3",
        {"description": BASE_DESCRIPTION, "keywords": ["gpu", "nvidia"]},
        "if this is refused, the tag `nvidia` is the trigger",
    ),
    (
        "kw3-gpu-nvidia-cuda",
        "1.1.4",
        {"description": BASE_DESCRIPTION, "keywords": ["gpu", "nvidia", "cuda"]},
        "if this is refused, the tag `cuda` is the trigger",
    ),
    (
        "kw4-monitoring",
        "1.1.5",
        {"description": BASE_DESCRIPTION, "keywords": ["gpu", "monitoring"]},
        "if this is refused, the tag `monitoring` is the trigger",
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
        print(f"extension name for every variant: {EXTENSION_NAME}\n")
        for label, version, changes, meaning in VARIANTS:
            candidate = json.loads(original)
            candidate.update(changes)
            candidate["name"] = EXTENSION_NAME
            candidate["version"] = version
            # Minimal contributions, matching the shape that passed.
            candidate["categories"] = ["Visualization"]
            candidate["contributes"].pop("viewsWelcome", None)
            candidate["contributes"].pop("configuration", None)
            candidate.pop("scripts", None)
            candidate.pop("devDependencies", None)

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
            identity = next(
                (line.strip() for line in vsixmanifest.splitlines() if "<Identity" in line),
                "(no Identity)",
            )

            expected = ",".join(changes["keywords"])
            actual = tags.replace("<Tags>", "").replace("</Tags>", "").strip()
            if actual != expected:
                raise SystemExit(f"{label}: tags mismatch, expected {expected!r} got {actual!r}")
            if inner["name"] != EXTENSION_NAME or inner["version"] != version:
                raise SystemExit(f"{label}: identity mismatch in the built package")

            print(f"{version}  {target.name}  ({target.stat().st_size} bytes)")
            print(f"   tags: {actual or '(none)'}")
            print(f"   {identity}")
            print(f"   {meaning}")
    finally:
        PKG.write_text(original, encoding="utf-8")

    print(
        f"\nwrote {len(VARIANTS)} packages to {OUT_DIR}\n"
        "upload in version order, because each attempt must be a higher version than\n"
        "the last; UNPUBLISH a successful one (never Remove/Delete) and continue"
    )


if __name__ == "__main__":
    main()
