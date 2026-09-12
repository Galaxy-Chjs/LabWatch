"""Build the metadata bisection variants for one fixed extension identity.

Facts established so far, each one paid for with a failed upload:

  * An inert probe extension uploads fine under this publisher, so the account is
    not the problem.
  * **A vendor-free description with an empty tag list passes.** That was variant
    `kw0-neutral`, and it is now published (unpublished in the portal) as
    `labwatch-gpu` 1.1.0.
  * **The extension name and the display name are reserved permanently, and
    changing either one means starting a new listing.** An earlier attempt to keep
    the name `labwatch-gpu` but give the next variant a different display name was
    refused as "display name is taken"; renaming the extension to get around it
    would refuse as "extension already exists". So the only way to iterate is to
    keep one identity and raise the version.

    Consequence: **choose the identity once, before the first upload of a series.**
    Both halves are already reserved to this publisher, so they are reused here and
    never changed again:

        name        : labwatch-gpu
        displayName : LabWatch GPU

  * `vsce` copies `keywords` into `extension.vsixmanifest` as `<Tags>` when it
    packages, so a variant has to be produced by a real `vsce package` - editing
    the keywords inside a built VSIX changes nothing.

Versions must increase for each upload, so the sequence starts at 1.1.1 (1.1.0 is
already on the listing) and the real release is cut later as 1.2.0.

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
DISPLAY_NAME = "LabWatch GPU"

NEUTRAL_DESCRIPTION = (
    "Show graphics accelerator utilisation, memory and temperature in the VS Code status bar and sidebar."
)
VENDOR_DESCRIPTION = (
    "Show NVIDIA GPU utilisation, memory and temperature in the VS Code status bar and sidebar."
)

# Nothing here changes the identity: only the two free-text fields under test, and
# the version, which must increase. Ordered by upload sequence.
VARIANTS: list[tuple[str, str, dict, str]] = [
    (
        "kw5-vendor-description",
        "1.1.1",
        {"description": VENDOR_DESCRIPTION, "keywords": []},
        "description names the vendor -> if refused, the description vocabulary is the trigger",
    ),
    (
        "kw1-gpu",
        "1.1.2",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu"]},
        "tag `gpu` alone -> if refused, that tag is the trigger",
    ),
    (
        "kw2-gpu-nvidia",
        "1.1.3",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu", "nvidia"]},
        "adds tag `nvidia`",
    ),
    (
        "kw3-gpu-nvidia-cuda",
        "1.1.4",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu", "nvidia", "cuda"]},
        "adds tag `cuda`",
    ),
    (
        "kw4-monitoring",
        "1.1.5",
        {"description": NEUTRAL_DESCRIPTION, "keywords": ["gpu", "monitoring"]},
        "adds tag `monitoring`",
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
        print(f"identity (never varied): {EXTENSION_NAME} / {DISPLAY_NAME}\n")
        for label, version, changes, meaning in VARIANTS:
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
            print(f"   tags: {actual or '(none)'}")
            print(f"   {meaning}")
    finally:
        PKG.write_text(original, encoding="utf-8")

    print(
        f"\nwrote {len(VARIANTS)} packages to {OUT_DIR}\n"
        "identity is fixed for all of them: upload by version, never rename"
    )


if __name__ == "__main__":
    main()
