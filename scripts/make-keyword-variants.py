"""Build the metadata bisection variants for one fixed, still-free identity.

Rules this script now enforces, each learned from a refused upload:

  1. An extension listing's **identity is fixed at its first upload**. Changing
     either half afterwards is refused - a different `name` gives "extension
     already exists", the same `name` with a different `displayName` gives "display
     name is taken" - and unpublishing or removing the listing releases neither.
     So the identity is declared exactly once, here, and only the version varies.
  2. **The version only goes up.** 1.1.0 is the version that was refused with the
     full manifest, so the bisection uses 1.1.1+ and the real release is cut later
     as 1.2.0. That leaves room: a successful listing can never accept a lower
     version again.
  3. **A variant must be produced by a real `vsce package`.** Editing `keywords`
     inside an already-built VSIX does nothing, because `vsce` had already copied
     them into `extension.vsixmanifest` as `<Tags>`, which is what the Marketplace
     reads.

Burnt identities, in order: `labwatch-vscode`/"LabWatch", then
`labwatch-gpu`/"LabWatch GPU". The one below is the third attempt and is chosen to
be a name worth keeping if it works.

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

# Declared once. Do not change these between uploads.
EXTENSION_NAME = "labwatch-gpu-status"
DISPLAY_NAME = "LabWatch GPU Status"

NEUTRAL_DESCRIPTION = "Show GPU utilisation, memory and temperature in the VS Code status bar and sidebar."

# Version, label, changes, and what a refusal would mean.
VARIANTS: list[tuple[str, str, dict, str]] = [
    (
        "1.1.1",
        "tags-gpu",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu"]},
        "the description says GPU and the tag list is just `gpu`",
    ),
    (
        "1.1.2",
        "tags-gpu-nvidia",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu", "nvidia"]},
        "adds the tag `nvidia` -> if refused, that tag is the trigger",
    ),
    (
        "1.1.3",
        "tags-gpu-nvidia-cuda",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu", "nvidia", "cuda"]},
        "adds the tag `cuda` -> if refused, that tag is the trigger",
    ),
]

# The pass/fail history that makes this ordering informative:
#   1.1.0 equivalent, no keywords, "graphics accelerator" description -> PASSED
#   1.1.0 equivalent, full keywords, "NVIDIA GPU" description         -> REFUSED
PRIOR = """prior results (different identities, same metadata shapes):
   no tags  + "graphics accelerator"  -> PASSED
   gpu,nvidia,cuda,monitoring + "NVIDIA GPU" -> REFUSED
so 1.1.1 here tests the middle of that range: the word GPU, and the tag `gpu`.
"""


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
        print(f"identity, declared once and never varied: {EXTENSION_NAME} / {DISPLAY_NAME}")
        print(PRIOR)
        for version, label, changes, meaning in VARIANTS:
            candidate = json.loads(original)
            candidate.update(changes)
            candidate["name"] = EXTENSION_NAME
            candidate["version"] = version
            candidate["displayName"] = DISPLAY_NAME
            candidate["categories"] = ["Visualization"]
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
            shown = next(
                (line.strip() for line in vsixmanifest.splitlines() if "<DisplayName>" in line),
                "(no DisplayName)",
            )

            expected = ",".join(changes["keywords"])
            actual = tags.replace("<Tags>", "").replace("</Tags>", "").strip()
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
            print(f"   {shown}")
            print(f"   {tags}")
            print(f"   {meaning}")
    finally:
        PKG.write_text(original, encoding="utf-8")

    print(
        f"\nwrote {len(VARIANTS)} packages to {OUT_DIR}\n"
        "upload 1.1.1 first; every later upload is the same identity with a higher\n"
        "version, so no rename and no delete is ever needed"
    )


if __name__ == "__main__":
    main()
