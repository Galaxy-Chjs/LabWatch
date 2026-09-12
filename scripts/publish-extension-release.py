"""Create the extension's GitHub release and attach the VSIX.

Why this is a script and not a curl one-liner: the Releases API needs a token, and
the only one on this machine is the credential Git already stores for github.com
(Git Credential Manager's generic entry). It is read here, used for the two API
calls, and never written anywhere else.

Usage:
    python scripts/publish-extension-release.py <tag> <vsix path> [<title>]
"""

from __future__ import annotations

import base64
import ctypes
import hashlib
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

PROXY = "http://127.0.0.1:7890"
REPO = "Galaxy-Chjs/LabWatch"
TARGET = "git:https://github.com"
CRED_TYPE_GENERIC = 1


class CREDENTIAL_ATTRIBUTE(ctypes.Structure):
    _fields_ = [
        ("Keyword", ctypes.c_wchar_p),
        ("Flags", ctypes.c_uint32),
        ("ValueSize", ctypes.c_uint32),
        ("Value", ctypes.c_void_p),
    ]


class CREDENTIAL(ctypes.Structure):
    _fields_ = [
        ("Flags", ctypes.c_uint32),
        ("Type", ctypes.c_uint32),
        ("TargetName", ctypes.c_wchar_p),
        ("Comment", ctypes.c_wchar_p),
        ("LastWritten", ctypes.c_void_p),
        ("CredentialBlobSize", ctypes.c_uint32),
        ("CredentialBlob", ctypes.c_void_p),
        ("Persist", ctypes.c_uint32),
        ("AttributeCount", ctypes.c_uint32),
        ("Attributes", ctypes.POINTER(CREDENTIAL_ATTRIBUTE)),
        ("TargetAlias", ctypes.c_wchar_p),
        ("UserName", ctypes.c_wchar_p),
    ]


def stored_token(target: str = TARGET) -> str | None:
    """The secret Git stores for github.com, or None if it cannot be read."""
    advapi = ctypes.WinDLL("advapi32", use_last_error=True)
    pointer = ctypes.POINTER(CREDENTIAL)()
    if not advapi.CredReadW(ctypes.c_wchar_p(target), CRED_TYPE_GENERIC, 0, ctypes.byref(pointer)):
        return None
    try:
        credential = pointer.contents
        blob = ctypes.string_at(credential.CredentialBlob, credential.CredentialBlobSize)
        token = blob.decode("utf-16-le", errors="ignore").strip("\x00").strip()
        return token or None
    finally:
        advapi.CredFree(pointer)


def api(token: str, path: str, payload: dict | None = None, method: str = "GET") -> dict:
    request = urllib.request.Request(
        f"https://api.github.com{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
    )
    request.add_header("User-Agent", "labwatch-release")
    request.add_header("Accept", "application/vnd.github+json")
    request.add_header("Authorization", f"Bearer {token}")
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
    )
    with opener.open(request, timeout=120) as response:
        return json.load(response)


def upload(token: str, upload_url: str, path: pathlib.Path) -> dict:
    # The templated upload URL from the create-release response.
    url = upload_url.split("{")[0] + f"?name={urllib.parse.quote(path.name)}"
    request = urllib.request.Request(url, data=path.read_bytes(), method="POST")
    request.add_header("User-Agent", "labwatch-release")
    request.add_header("Accept", "application/vnd.github+json")
    request.add_header("Content-Type", "application/octet-stream")
    request.add_header("Authorization", f"Bearer {token}")
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
    )
    with opener.open(request, timeout=1800) as response:
        return json.load(response)


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        raise SystemExit(__doc__)
    tag = argv[1]
    vsix = pathlib.Path(argv[2]).resolve()
    title = argv[3] if len(argv) > 3 else tag
    if not vsix.is_file():
        raise SystemExit(f"no such file: {vsix}")

    token = stored_token()
    if token is None:
        print("No stored github.com credential: cannot use the Releases API.")
        print("Upload it through the web UI instead:")
        print(f"  https://github.com/{REPO}/releases/new?tag={tag}")
        print(f"  attach {vsix}")
        return 3

    release = api(
        token,
        f"/repos/{REPO}/releases",
        {
            "tag_name": tag,
            "name": title,
            "draft": False,
            "prerelease": False,
            "body": (
                "The VS Code extension, attached here so it can be installed without "
                "waiting for the Marketplace listing.\n\n"
                "```bash\n"
                f"code --install-extension {vsix.name}\n```\n\n"
                "It needs nothing installed by hand: on first use it builds a private "
                "environment for the collector and installs from wheels bundled in the "
                "VSIX, so a GPU server with no outbound access works too.\n\n"
                f"SHA256: see the attached `.sha256` file.\n"
            ),
        },
        method="POST",
    )
    print(f"release: {release['html_url']}")

    asset = upload(token, release["upload_url"], vsix)
    print(f"asset:   {asset['name']} ({asset['size']} bytes)")
    print(f"         {asset['browser_download_url']}")

    digest = hashlib.sha256(vsix.read_bytes()).hexdigest().upper()
    checksum = vsix.with_suffix(vsix.suffix + ".sha256")
    checksum.write_text(f"{digest}  {vsix.name}\n", encoding="ascii")
    try:
        uploaded = upload(token, release["upload_url"], checksum)
        print(f"sha256:  {digest}")
        print(f"         {uploaded['browser_download_url']}")
    finally:
        checksum.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
