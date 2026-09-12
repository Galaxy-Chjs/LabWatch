"""Build keyword variants correctly, by repackaging rather than patching.

Why this exists twice. The first attempt (`make-keyword-variants.py`) edited
`keywords` in the package.json *inside* an already-built VSIX. That does not work:
`vsce` had already copied the keywords into `extension.vsixmanifest` as `<Tags>`,
and the Marketplace reads that file. Every variant therefore uploaded the same
`<Tags>gpu,nvidia,cuda,monitoring,remote-ssh</Tags>` and the experiment tested
nothing - which is why variant 1 was refused exactly like the full manifest.

This version writes a candidate `package.json`, runs a real `vsce package` so the
whole manifest is regenerated coherently, and restores the repository copy
afterwards. It refuses to leave the repository modified.

Usage:
    python scripts/make-keyword-variants.py
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import zipfile

REPO = pathlib.Path(__file__).resolve().parent.parent
EXT = REPO / "vscode-extension"
PKG = EXT / "package.json"
OUT_DIR = REPO / "dist-vsix"

# Every variant is the minimal metadata set plus one difference, so the only
# thing that changes between uploads is the variable under test.
BASE_DESCRIPTION = (
    "Show graphics accelerator utilisation, memory and temperature in the VS Code status bar and sidebar."
)
VENDOR_DESCRIPTION = (
    "Show NVIDIA GPU utilisation, memory and temperature in the VS Code status bar and sidebar."
)

VARIANTS: list[tuple[str, dict]] = [
    (
        "kw0-neutral",
        {"description": BASE_DESCRIPTION, "keywords": []},
    ),
    (
        "kw1-gpu",
        {"description": BASE_DESCRIPTION, "keywords": ["gpu"]},
    ),
    (
        "kw2-gpu-nvidia",
        {"description": BASE_DESCRIPTION, "keywords": ["gpu", "nvidia"]},
    ),
    (
        "kw3-gpu-nvidia-cuda",
        {"description": BASE_DESCRIPTION, "keywords": ["gpu", "nvidia", "cuda"]},
    ),
    (
        "kw4-monitoring",
        {"description": BASE_DESCRIPTION, "keywords": ["gpu", "monitoring"]},
    ),
    (
        "kw5-vendor-description",
        {"description": VENDOR_DESCRIPTION, "keywords": []},
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
    manifest = json.loads(original)
    OUT_DIR.mkdir(exist_ok=True)

    try:
        for name, changes in VARIANTS:
            candidate = json.loads(original)
            candidate.update(changes)
            # Minimal contributions, same as the successful probe's shape.
            candidate["categories"] = ["Visualization"]
            candidate["contributes"].pop("viewsWelcome", None)
            candidate["contributes"].pop("configuration", None)
            candidate.pop("scripts", None)
            candidate.pop("devDependencies", None)

            PKG.write_text(json.dumps(candidate, indent=2) + "\n", encoding="utf-8")
            vsce("package", "--no-dependencies", "--out", str(OUT_DIR / f"labwatch-vscode-1.1.0-{name}.vsix"))

            # Confirm the regenerated manifest really says what we intended.
            with zipfile.ZipFile(OUT_DIR / f"labwatch-vscode-1.1.0-{name}.vsix") as archive:
                vsixmanifest = archive.read("extension.vsixmanifest").decode("utf-8")
            tags = next(
                (line.strip() for line in vsixmanifest.splitlines() if "<Tags>" in line),
                "(no Tags element)",
            )
            print(f"{name}")
            print(f"   keywords : {changes['keywords']}")
            print(f"   {tags}")
            if changes["keywords"]:
                expected = ",".join(changes["keywords"])
                if expected not in tags:
                    raise SystemExit(f"manifest tags do not match: expected {expected!r} in {tags!r}")
            elif "<Tags>" in tags and tags.replace("<Tags>", "").replace("</Tags>", "").strip():
                raise SystemExit(f"expected no tags, got {tags!r}")
    finally:
        PKG.write_text(original, encoding="utf-8")

    print(f"\nwrote {len(VARIANTS)} packages to {OUT_DIR}")
    print("repository package.json restored; upload in order and stop at the first refusal")


if __name__ == "__main__":
    main()
