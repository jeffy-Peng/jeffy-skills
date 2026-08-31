#!/usr/bin/env python3
"""Render a 3d-deep-research Markdown report to HTML or PDF."""

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
from urllib.parse import unquote, urlsplit, urlunsplit

from linkify_sources import linkify_html


SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CSS = SKILL_DIR / "assets" / "report.css"


def _configure_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")


def _marked_command() -> list[str] | None:
    node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")
    modules = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE_MODULES")
    if node and modules:
        cli = Path(modules) / "marked" / "bin" / "marked.js"
        if Path(node).is_file() and cli.is_file():
            return [node, str(cli)]

    marked = shutil.which("marked")
    return [marked] if marked else None


def markdown_to_html(md_text: str) -> tuple[str, str]:
    """Return rendered HTML and the converter name."""
    try:
        import markdown  # type: ignore

        rendered = markdown.markdown(
            md_text,
            extensions=["tables", "fenced_code", "sane_lists"],
            output_format="html5",
        )
        version = getattr(markdown, "__version__", "")
        return rendered, f"python-markdown {version}".strip()
    except ModuleNotFoundError:
        pass

    command = _marked_command()
    if command:
        result = subprocess.run(
            [*command, "--gfm"],
            input=md_text,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=False,
            timeout=60,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout, "marked"
        detail = result.stderr.strip() or f"exit code {result.returncode}"
        raise RuntimeError(f"marked failed: {detail}")

    raise RuntimeError(
        "No Markdown converter found. Install Python-Markdown or expose "
        "marked on PATH."
    )


def _split_report(md_text: str) -> tuple[str, str, str]:
    lines = md_text.splitlines()
    first_content = next(
        (index for index, line in enumerate(lines) if line.strip()),
        None,
    )
    if first_content is None:
        raise RuntimeError("The report is empty.")

    title_match = re.fullmatch(r"#\s+(.+?)\s*", lines[first_content])
    if not title_match:
        raise RuntimeError("The report must start with an H1 title.")
    title = title_match.group(1)
    lines[first_content] = ""

    meta_line = ""
    for index in range(first_content + 1, min(len(lines), first_content + 12)):
        line = lines[index].lstrip()
        if line.startswith(">"):
            meta_line = line[1:].strip()
            lines[index] = ""
            break

    return title, meta_line, "\n".join(lines)


def _resolve_local_media(html_body: str, base_dir: Path | None) -> str:
    """Resolve relative image references against the Markdown directory."""
    if base_dir is None:
        return html_body

    attribute = re.compile(
        r'(<(?:img|image)\b[^>]*?\b(?:src|href|xlink:href)\s*=\s*)(["\'])(.*?)\2',
        flags=re.IGNORECASE | re.DOTALL,
    )

    def resolve(match: re.Match[str]) -> str:
        value = match.group(3).strip()
        parsed = urlsplit(value)
        if (
            not value
            or parsed.scheme
            or parsed.netloc
            or value.startswith(("//", "#", "/"))
        ):
            return match.group(0)

        local_path = (base_dir / unquote(parsed.path)).resolve().as_uri()
        resolved = urlsplit(local_path)
        rewritten = urlunsplit(
            (resolved.scheme, resolved.netloc, resolved.path, parsed.query, parsed.fragment)
        )
        return f"{match.group(1)}{match.group(2)}{rewritten}{match.group(2)}"

    return attribute.sub(resolve, html_body)


def build_html(
    md_text: str,
    asset_base: Path | None = None,
) -> tuple[str, str, str]:
    report_title, meta_line, body_md = _split_report(md_text)
    html_body, converter = markdown_to_html(body_md)
    html_body = _resolve_local_media(html_body, asset_base)

    css = DEFAULT_CSS.read_text(encoding="utf-8")
    if "HEADER_TEXT" not in css:
        raise RuntimeError(f"Missing HEADER_TEXT placeholder in {DEFAULT_CSS}")
    css_header = report_title.replace("\\", "\\\\").replace('"', '\\"')
    css = css.replace("HEADER_TEXT", css_header)

    safe_title = html.escape(report_title, quote=True)
    meta_html = (
        f'<div class="meta">{html.escape(meta_line, quote=True)}</div>'
        if meta_line
        else ""
    )
    cover = f"""
<div class="cover">
  <h1 style="page-break-before: avoid; border: none;">{safe_title}</h1>
  {meta_html}
  <hr class="divider">
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
        result = subprocess.run(
            [
                str(browser),
                "--headless",
                "--disable-gpu",
                "--no-pdf-header-footer",
                "--allow-file-access-from-files",
                "--run-all-compositor-stages-before-draw",
                f"--user-data-dir={profile}",
                f"--print-to-pdf={output_path.resolve()}",
                html_path.resolve().as_uri(),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=120,
        )

    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"Chromium exited with {result.returncode}: {detail}")
    if not output_path.is_file() or output_path.stat().st_size < 1024:
        raise RuntimeError("Chromium did not create a valid PDF.")
    return f"chromium ({browser.name})"


def render_with_weasyprint(html_text: str, input_path: Path, output_path: Path) -> str:
    try:
        from weasyprint import HTML  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"WeasyPrint is unavailable: {exc}") from exc

    HTML(string=html_text, base_url=str(input_path.parent)).write_pdf(str(output_path))
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
        description="Render 3d-deep-research Markdown to HTML or PDF."
    )
    parser.add_argument("input", help="Input Markdown path")
    parser.add_argument("output", help="Output .html or .pdf path")
    parser.add_argument(
        "--engine",
        choices=["auto", "chromium", "weasyprint"],
        default="auto",
        help="PDF engine (default: auto)",
    )
    return parser.parse_args()


def main() -> None:
    _configure_utf8_console()
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not input_path.is_file():
        raise SystemExit(f"Input Markdown not found: {input_path}")
    if output_path.suffix.lower() not in {".html", ".pdf"}:
        raise SystemExit("Output path must end in .html or .pdf.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    md_text = input_path.read_text(encoding="utf-8")
    try:
        rendered_html, report_title, converter = build_html(
            md_text,
            asset_base=input_path.parent,
        )
        rendered_html, n_links, n_rows = linkify_html(rendered_html)
    except (OSError, RuntimeError, ValueError) as exc:
        raise SystemExit(f"HTML rendering failed: {exc}") from exc

    if output_path.suffix.lower() == ".html":
        output_path.write_text(rendered_html, encoding="utf-8")
        print(f"[OK] HTML: {output_path}")
        print(f"[OK] Markdown converter: {converter}")
        print(f"[OK] Source links: {n_links}; ledger anchors: {n_rows}")
        return

    html_path = output_path.with_name(
        f".{output_path.name}.{os.getpid()}.rendering.html"
    )
    temporary_pdf = output_path.with_name(
        f".{output_path.name}.{os.getpid()}.rendering.pdf"
    )
    html_path.write_text(rendered_html, encoding="utf-8")

    failures: list[str] = []
    selected_engine = ""
    for engine in _engine_order(args.engine):
        temporary_pdf.unlink(missing_ok=True)
        try:
            if engine == "chromium":
                selected_engine = render_with_chromium(html_path, temporary_pdf)
            else:
                selected_engine = render_with_weasyprint(
                    rendered_html, input_path, temporary_pdf
                )
            break
        except Exception as exc:
            failures.append(f"{engine}: {exc}")

    if not selected_engine:
        temporary_pdf.unlink(missing_ok=True)
        details = "\n".join(f"- {failure}" for failure in failures)
        raise SystemExit(
            "PDF rendering failed. Intermediate HTML was kept for debugging:\n"
            f"{html_path}\n{details}"
        )

    os.replace(temporary_pdf, output_path)
    html_path.unlink(missing_ok=True)
    size_kb = output_path.stat().st_size / 1024
    print(f"[OK] PDF: {output_path} ({size_kb:.1f} KB)")
    print(f"[OK] PDF engine: {selected_engine}")
    print(f"[OK] Markdown converter: {converter}")
    print(f"[OK] Source links: {n_links}; ledger anchors: {n_rows}")
    print(f"[OK] Title: {report_title}")


if __name__ == "__main__":
    main()
