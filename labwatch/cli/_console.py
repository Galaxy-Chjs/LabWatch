"""Terminal output helpers for the CLI.

Deliberately dependency-free: ``labwatch --help``, ``labwatch version`` and
``labwatch doctor`` must work even when a third-party dependency failed to
install or NVML is unavailable.
"""

from __future__ import annotations

import os
import sys

_CODES = {
    "reset": "\033[0m",
    "bold": "\033[1m",
    "dim": "\033[2m",
    "red": "\033[31m",
    "green": "\033[32m",
    "yellow": "\033[33m",
    "blue": "\033[34m",
    "cyan": "\033[36m",
}


def supports_color(stream=None) -> bool:
    """Whether ANSI colour should be emitted for this stream."""
    stream = stream or sys.stdout
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    if os.environ.get("TERM") == "dumb":
        return False
    return bool(getattr(stream, "isatty", lambda: False)())


def _can_encode(stream, text: str) -> bool:
    """Whether the stream's encoding can represent ``text``.

    Windows consoles default to a legacy code page (GBK, cp1252, …) that cannot
    encode the check marks, so the CLI degrades to ASCII rather than crashing on
    a successful run.
    """
    encoding = getattr(stream, "encoding", None) or "ascii"
    try:
        text.encode(encoding)
    except (UnicodeEncodeError, LookupError):
        return False
    return True


#: Unicode markers, used when the terminal can render them.
MARKERS_UNICODE = {"ok": "✓", "warn": "!", "fail": "✗", "bullet": "·", "emdash": "—"}
#: ASCII fallbacks for legacy code pages.
MARKERS_ASCII = {"ok": "+", "warn": "!", "fail": "x", "bullet": "-", "emdash": "-"}


class Console:
    """Minimal pretty-printer: colour when it helps, plain text when piped."""

    def __init__(self, color: bool | None = None, stream=None) -> None:
        self.stream = stream or sys.stdout
        self.color = supports_color(self.stream) if color is None else color
        self.markers = MARKERS_UNICODE if _can_encode(self.stream, "✓✗·—") else MARKERS_ASCII

    # -- primitives --------------------------------------------------------
    def marker(self, name: str) -> str:
        """The status marker for ``name``, in whatever alphabet the terminal supports."""
        return self.markers.get(name, "")

    def paint(self, text: str, *styles: str) -> str:
        """Wrap ``text`` in ANSI styles, or return it unchanged when colour is off."""
        if not self.color or not styles:
            return text
        prefix = "".join(_CODES.get(style, "") for style in styles)
        return f"{prefix}{text}{_CODES['reset']}"

    def write(self, text: str = "") -> None:
        """Print one line."""
        print(text, file=self.stream)

    def blank(self) -> None:
        """Print an empty line."""
        print(file=self.stream)

    # -- semantic helpers --------------------------------------------------
    def ok(self, text: str) -> None:
        """A successful check."""
        self.write(f"{self.paint(self.marker('ok'), 'green')} {text}")

    def warn(self, text: str) -> None:
        """Something worth noticing, but not fatal."""
        self.write(f"{self.paint(self.marker('warn'), 'yellow')} {text}")

    def fail(self, text: str) -> None:
        """A failed check."""
        self.write(f"{self.paint(self.marker('fail'), 'red')} {text}")

    def info(self, text: str) -> None:
        """Neutral detail, indented under a check."""
        self.write(f"  {self.paint(text, 'dim')}")

    def heading(self, text: str) -> None:
        """A section title."""
        self.write(self.paint(text, "bold"))

    def banner(self) -> None:
        """The product banner shown when the server starts."""
        label = self.paint("LabWatch", "bold", "cyan")
        tagline = self.paint(f"{self.marker('emdash')} GPU server monitor", "dim")
        self.write(f"{label} {tagline}")
        self.blank()

    def url(self, url: str) -> None:
        """The dashboard address, made prominent."""
        self.write(f"  {self.paint(url, 'bold', 'blue')}")

    def hint(self, text: str) -> None:
        """A follow-up instruction, dimmed."""
        self.write(self.paint(f"  {text}", "dim"))


def exit_code(ok: bool, *, soft: bool = False) -> int:
    """Map a check result to a process exit status."""
    if ok:
        return 0
    return 1 if not soft else 0
