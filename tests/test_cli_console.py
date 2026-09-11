"""Tests for the terminal output helpers.

The CLI is the first thing a new user touches, so its degradation behaviour
matters: a Windows console with a legacy code page must not crash on a successful
run, and piping into a file must not leave ANSI escapes in the output.
"""

from __future__ import annotations

import io

from labwatch.cli._console import MARKERS_ASCII, MARKERS_UNICODE, Console, supports_color


def test_colour_is_off_for_a_non_tty() -> None:
    assert supports_color(io.StringIO()) is False


def test_no_color_environment_disables_colour(monkeypatch) -> None:
    monkeypatch.setenv("NO_COLOR", "1")
    assert supports_color(io.StringIO()) is False


def test_paint_returns_plain_text_without_colour() -> None:
    console = Console(color=False)
    assert console.paint("hello", "bold", "green") == "hello"


def test_paint_wraps_when_colour_is_enabled() -> None:
    console = Console(color=True)
    painted = console.paint("hello", "bold")
    assert "\033[1m" in painted
    assert painted.endswith("\033[0m")


def test_markers_fall_back_to_ascii_on_a_legacy_code_page() -> None:
    """The Windows GBK console cannot encode a check mark.

    Emitting one raised UnicodeEncodeError mid-doctor-report, which is a crash on
    the happy path. The console must detect this and degrade.
    """
    legacy = io.TextIOWrapper(io.BytesIO(), encoding="gbk", errors="strict")
    console = Console(color=False, stream=legacy)
    assert console.markers == MARKERS_ASCII
    assert console.marker("ok") == "+"
    assert console.marker("fail") == "x"


def test_markers_use_unicode_on_a_utf8_stream() -> None:
    utf8 = io.TextIOWrapper(io.BytesIO(), encoding="utf-8", errors="strict")
    console = Console(color=False, stream=utf8)
    assert console.markers == MARKERS_UNICODE
    assert console.marker("ok") == "✓"


def test_markers_fall_back_when_the_stream_has_no_encoding() -> None:
    """A stream that cannot report its encoding must be treated as unencodable.

    Guessing would risk the same UnicodeEncodeError crash this guards against, so
    the safe answer is ASCII.
    """
    console = Console(color=False, stream=io.StringIO())
    assert console.markers == MARKERS_ASCII


def test_semantic_helpers_write_one_line_each() -> None:
    stream = io.StringIO()
    console = Console(color=False, stream=stream)

    console.ok("all good")
    console.warn("careful")
    console.fail("broken")
    console.info("detail")
    console.heading("Title")
    console.blank()
    console.url("http://127.0.0.1:8123")
    console.hint("a hint")

    lines = stream.getvalue().splitlines()
    assert lines[0] == "+ all good"
    assert lines[1] == "! careful"
    assert lines[2] == "x broken"
    assert lines[3] == "  detail"
    assert lines[4] == "Title"
    assert lines[5] == ""
    assert "http://127.0.0.1:8123" in lines[6]
    assert lines[7] == "  a hint"


def test_banner_renders_without_error() -> None:
    stream = io.StringIO()
    Console(color=False, stream=stream).banner()
    assert "LabWatch" in stream.getvalue()
