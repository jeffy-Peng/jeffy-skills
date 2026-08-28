#!/usr/bin/env python3
"""Render a 3d-deep-research Markdown report to HTML and PDF.

The renderer has no mandatory PDF engine dependency:
- On Windows, auto mode prefers an installed Chromium browser.
- On other platforms, auto mode prefers WeasyPrint when available.
- Markdown conversion uses Python-Markdown when installed and falls back to
  Codex's bundled Node.js + marked runtime when available.
"""

from __future__ import annotations

import argparse
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CSS = SKILL_DIR / "assets" / "report.css"

# Turning [Sxx] citations into clickable anchors is part of the standard
# render pipeline; linkify_sources.py ships with this skill.
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from linkify_sources import linkify_html
except Exception:  # pragma: no cover - script missing or broken
    linkify_html = None


def _configure_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")


def _strip_html(value: str) -> str:
    return re.sub(r"<[^>]+>", "", html.unescape(value)).strip()


def _extract_markdown_title(md_text: str) -> str | None:
    match = re.search(r"^#\s+(.+?)\s*$", md_text, flags=re.MULTILINE)
    if not match:
        return None
    value = re.sub(r"[*_`~]", "", match.group(1))
    return value.strip() or None


def _find_bundled_marked() -> tuple[Path, Path] | None:
    runtime_root = (
        Path.home()
        / ".cache"
        / "codex-runtimes"
        / "codex-primary-runtime"
        / "dependencies"
        / "node"
    )
    node_names = ["node.exe", "node"] if os.name == "nt" else ["node", "node.exe"]
    for node_name in node_names:
        node = runtime_root / "bin" / node_name
        cli = runtime_root / "node_modules" / "marked" / "bin" / "marked.js"
        if node.is_file() and cli.is_file():
            return node, cli
    return None


def markdown_to_html(md_text: str) -> tuple[str, str]:
    """Return (html, converter_name)."""
    try:
        import markdown  # type: ignore

        rendered = markdown.markdown(
            md_text,
            extensions=["tables", "fenced_code", "sane_lists"],
            output_format="html5",
        )
        return rendered, f"python-markdown {getattr(markdown, '__version__', '')}".strip()
    except ModuleNotFoundError:
        pass

    marked = _find_bundled_marked()
    if marked:
        node, cli = marked
        result = subprocess.run(
            [str(node), str(cli), "--gfm"],
            input=md_text,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=False,
            timeout=60,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout, "bundled marked"
        detail = result.stderr.strip() or f"exit code {result.returncode}"
        raise RuntimeError(f"Bundled marked failed: {detail}")

    raise RuntimeError(
        "No Markdown converter found. Install Python-Markdown with "
        "`python -m pip install markdown`, or use the Codex bundled runtime "
        "that includes Node.js + marked."
    )


def _extract_meta_line(md_text: str) -> str:
    for raw_line in md_text.splitlines():
        line = raw_line.strip().lstrip(">").strip()
        if any(key in line for key in ("研究时间", "时间基准", "研究对象类型")):
            return line
    return ""


def build_html(
    md_text: str,
    *,
    input_path: Path,
    title: str | None = None,
    subtitle: str = "立体分析法深度研究报告",
    author: str = "jeffy",
    css_path: Path = DEFAULT_CSS,
) -> tuple[str, str, str]:
    html_body, converter = markdown_to_html(md_text)

    first_h1 = re.search(
        r"<h1(?:\s[^>]*)?>(.*?)</h1>",
        html_body,
        flags=re.IGNORECASE | re.DOTALL,
    )
    extracted_title = _extract_markdown_title(md_text)
    if first_h1:
        extracted_title = extracted_title or _strip_html(first_h1.group(1))
        html_body = html_body[: first_h1.start()] + html_body[first_h1.end() :]

    report_title = title or extracted_title or "立体分析报告"
    css = css_path.read_text(encoding="utf-8")
    css_header = report_title.replace("\\", "\\\\").replace('"', '\\"')
    css = css.replace("HEADER_TEXT", f"{css_header}  |  立体分析法深度研究报告")

    safe_title = html.escape(report_title, quote=True)
    safe_subtitle = html.escape(subtitle, quote=True)
    safe_author = html.escape(author, quote=True)
    meta_line = _extract_meta_line(md_text)
    meta_html = (
        f"<div class=\"meta\">{html.escape(meta_line, quote=True)}</div>"
        if meta_line
        else ""
    )
    cover = f"""
<div class="cover">
  <h1 style="page-break-before: avoid; border: none;">{safe_title}</h1>
  <div class="subtitle">{safe_subtitle}</div>
  {meta_html}
  <hr class="divider">
  <div class="meta">作者：{safe_author}</div>
</div>
""".strip()

    document = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{safe_title}</title>
  <style>{css}</style>
</head>
<body>
{cover}
{html_body}
</body>
</html>
"""
    return document, report_title, converter


def _browser_candidates() -> list[Path]:
    candidates: list[Path] = []
    for name in ("chrome", "google-chrome", "chromium", "chromium-browser", "msedge"):
        resolved = shutil.which(name)
        if resolved:
            candidates.append(Path(resolved))

    if os.name == "nt":
        candidates.extend(
            Path(path)
            for path in (
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            )
        )
    elif sys.platform == "darwin":
        candidates.extend(
            [
                Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
                Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
            ]
        )

    seen: set[str] = set()
    unique: list[Path] = []
    for candidate in candidates:
        key = str(candidate).lower()
        if candidate.is_file() and key not in seen:
            unique.append(candidate)
            seen.add(key)
    return unique


def render_with_chromium(html_path: Path, output_path: Path) -> str:
    browsers = _browser_candidates()
    if not browsers:
        raise RuntimeError("No Chrome, Chromium, or Edge executable was found.")

    browser = browsers[0]
    with tempfile.TemporaryDirectory(
        prefix="3d-deep-research-chromium-",
        ignore_cleanup_errors=True,
    ) as profile:
        command = [
            str(browser),
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--allow-file-access-from-files",
            "--run-all-compositor-stages-before-draw",
            f"--user-data-dir={profile}",
            f"--print-to-pdf={output_path.resolve()}",
            html_path.resolve().as_uri(),
        ]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=120,
        )

    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"Chromium failed with exit code {result.returncode}: {detail}")
    if not output_path.is_file() or output_path.stat().st_size < 1024:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"Chromium did not create a valid PDF. {detail}".strip())
    return f"chromium ({browser.name})"


def render_with_weasyprint(html_text: str, input_path: Path, output_path: Path) -> str:
    try:
        from weasyprint import HTML  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"WeasyPrint is unavailable: {exc}") from exc

    HTML(
        string=html_text,
        base_url=str(input_path.parent.resolve()),
    ).write_pdf(str(output_path))
    if not output_path.is_file() or output_path.stat().st_size < 1024:
        raise RuntimeError("WeasyPrint did not create a valid PDF.")
    return "weasyprint"


def _engine_order(requested: str) -> list[str]:
    if requested != "auto":
        return [requested]
    if os.name == "nt":
        return ["chromium", "weasyprint"]
    return ["weasyprint", "chromium"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render 3d-deep-research Markdown to HTML and PDF."
    )
    parser.add_argument("input", help="Input Markdown path")
    parser.add_argument("output", help="Output PDF path")
    parser.add_argument("--title", default=None, help="Cover title; defaults to first H1")
    parser.add_argument(
        "--subtitle",
        default="立体分析法深度研究报告",
        help="Cover subtitle",
    )
    parser.add_argument("--author", default="jeffy", help="Cover author")
    parser.add_argument(
        "--engine",
        choices=["auto", "chromium", "weasyprint"],
        default="auto",
        help="PDF engine",
    )
    parser.add_argument("--css", default=str(DEFAULT_CSS), help="CSS file path")
    parser.add_argument(
        "--no-linkify",
        action="store_true",
        help="Do not turn [Sxx] citations into clickable anchors",
    )
    parser.add_argument("--no-html", action="store_true", help="Do not keep HTML")
    parser.add_argument(
        "--html-only",
        action="store_true",
        help="Generate HTML and skip PDF rendering",
    )
    return parser.parse_args()


def main() -> None:
    _configure_utf8_console()
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    css_path = Path(args.css).expanduser().resolve()

    if not input_path.is_file():
        raise SystemExit(f"Input Markdown not found: {input_path}")
    if not css_path.is_file():
        raise SystemExit(f"CSS file not found: {css_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    html_path = output_path.with_suffix(".html")
    md_text = input_path.read_text(encoding="utf-8")
    rendered_html, report_title, converter = build_html(
        md_text,
        input_path=input_path,
        title=args.title,
        subtitle=args.subtitle,
        author=args.author,
        css_path=css_path,
    )

    # Linkify [Sxx] citations so both the HTML and the PDF printed from it
    # carry clickable jumps to the source ledger.
    if linkify_html is not None and not args.no_linkify:
        rendered_html, n_links, n_rows = linkify_html(rendered_html)
        print(f"[OK] Source citations linked: {n_links} links, {n_rows} ledger anchors")

    # Chromium needs a physical HTML file. In --no-html mode it is removed
    # only after successful PDF rendering.
    html_path.write_text(rendered_html, encoding="utf-8")
    print(f"[OK] HTML generated: {html_path}")
    print(f"[OK] Markdown converter: {converter}")

    if args.html_only:
        return

    failures: list[str] = []
    selected_engine = ""
    temporary_pdf = output_path.with_name(
        f".{output_path.name}.{os.getpid()}.rendering.pdf"
    )
    for engine in _engine_order(args.engine):
        temporary_pdf.unlink(missing_ok=True)
        try:
            if engine == "chromium":
                selected_engine = render_with_chromium(html_path, temporary_pdf)
            else:
                selected_engine = render_with_weasyprint(
                    rendered_html,
                    input_path,
                    temporary_pdf,
                )
            break
        except Exception as exc:
            failures.append(f"{engine}: {exc}")

    if not selected_engine:
        temporary_pdf.unlink(missing_ok=True)
        details = "\n".join(f"- {failure}" for failure in failures)
        raise SystemExit(
            "PDF rendering failed. The generated HTML was kept for debugging:\n"
            f"{html_path}\n{details}"
        )

    os.replace(temporary_pdf, output_path)

    if args.no_html:
        html_path.unlink(missing_ok=True)
        print(f"[OK] HTML removed (--no-html): {html_path}")

    size_kb = output_path.stat().st_size / 1024
    print(f"[OK] PDF: {output_path} ({size_kb:.1f} KB)")
    print(f"[OK] PDF engine: {selected_engine}")
    print(f"[OK] Title: {report_title}")


if __name__ == "__main__":
    main()
