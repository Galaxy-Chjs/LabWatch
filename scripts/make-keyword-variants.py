"""Build keyword variants of the extension to test the Marketplace blocklist.

Context. Another project (`veralang.vera-language`) was refused with the same
"Your extension has suspicious content" message, twice, with materially different
package *contents*. Marketplace Support answered on 20 July 2026:

    "Due to the widespread use of certain keywords in spam or malicious content,
     we have blocked a few words from the Marketplace."

So the check is a string match against the metadata, not a scan of the files. In
that project the suspects were `llm` and `contracts`. Here they are the GPU terms.

This matters because our earlier stages never tested it: every stage kept
`keywords = ["gpu", "nvidia", "cuda", ...]`, which `vsce` copies into the VSIX
manifest as `<Tags>gpu,nvidia,cuda,monitoring,remote-ssh</Tags>`. When stage 1
was refused, that did not exonerate the keywords - it never varied them.

Each variant starts from the stage-1 manifest (minimal metadata) and changes only
the keyword list, so a single upload identifies the blocked term. The manifest is
patched inside the VSIX copy only; the repository is untouched.

Usage:
    python scripts/make-keyword-variants.py
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

STAGE1_DESCRIPTION = (
    "Show NVIDIA GPU utilisation, memory and temperature in the VS Code status bar and sidebar."
)
# Same thing said without naming the vendor or the hardware, in case the check
# reads the description and not only the tags.
NEUTRAL_DESCRIPTION = (
    "Show graphics accelerator utilisation, memory and temperature in the VS Code status bar and sidebar."
)

VARIANTS = [
    ("kw0-neutral", [], "no keywords and a description that names no vendor or hardware", NEUTRAL_DESCRIPTION),
    ("kw0-none", [], "no keywords, but the description still says NVIDIA GPU", STAGE1_DESCRIPTION),
    ("kw1-gpu", ["gpu"], "the single most generic term", STAGE1_DESCRIPTION),
    ("kw2-gpu-nvidia", ["gpu", "nvidia"], "adds the vendor name", STAGE1_DESCRIPTION),
    ("kw3-gpu-nvidia-cuda", ["gpu", "nvidia", "cuda"], "adds the compute platform", STAGE1_DESCRIPTION),
    ("kw4-all", ["gpu", "nvidia", "cuda", "monitoring", "remote-ssh"], "the current shipping set", STAGE1_DESCRIPTION),
]


def build(name: str, keywords: list[str], description: str) -> pathlib.Path:
    OUT_DIR.mkdir(exist_ok=True)
    target = OUT_DIR / f"labwatch-vscode-1.1.0-{name}.vsix"

    with zipfile.ZipFile(BASE_VSIX) as source:
        items = {info.filename: source.read(info.filename) for info in source.infolist()}

    manifest = json.loads(items["extension/package.json"])
    manifest["description"] = description
    manifest["categories"] = ["Visualization"]
    manifest["keywords"] = keywords
    manifest["contributes"].pop("viewsWelcome", None)
    manifest["contributes"].pop("configuration", None)
    items["extension/package.json"] = json.dumps(manifest, indent=2).encode()

    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as out:
        for entry, payload in items.items():
            out.writestr(entry, payload)

    return target


def main() -> None:
    if not BASE_VSIX.is_file():
        raise SystemExit(f"build the base package first: {BASE_VSIX}")
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)

    print("upload order: stop at the first refusal\n")
    for name, keywords, note, description in VARIANTS:
        path = build(name, keywords, description)
        tags = ",".join(keywords) if keywords else "(none)"
        print(f"{path.name}  ({path.stat().st_size} bytes)")
        print(f"   tags: {tags}")
        print(f"   description: {description}")
        print(f"   {note}")


if __name__ == "__main__":
    main()
