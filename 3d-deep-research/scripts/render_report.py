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
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit

from linkify_sources import linkify_html


SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CSS = SKILL_DIR / "assets" / "report.css"
REQUIRED_WEASYPRINT_VERSION = "69.0"
FONT_FILES = {
    400: "NotoSansCJKsc-Regular.otf",
    700: "NotoSansCJKsc-Bold.otf",
}


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


def _font_face_css(font_dir: Path) -> str:
    missing = [name for name in FONT_FILES.values() if not (font_dir / name).is_file()]
    if missing:
        raise RuntimeError(
            f"Missing required Noto CJK font(s) in {font_dir}: "
            + ", ".join(missing)
        )
    rules = []
    for weight, filename in FONT_FILES.items():
        font_uri = (font_dir / filename).resolve().as_uri()
        rules.append(
            '@font-face {\n'
            '  font-family: "Noto Sans CJK SC";\n'
            f'  src: url("{font_uri}") format("opentype");\n'
            '  font-style: normal;\n'
            f'  font-weight: {weight};\n'
            '}'
        )
    return "\n".join(rules)


def build_html(
    md_text: str,
    asset_base: Path | None = None,
    font_dir: Path | None = None,
) -> tuple[str, str, str]:
    report_title, meta_line, body_md = _split_report(md_text)
    html_body, converter = markdown_to_html(body_md)
    html_body = _resolve_local_media(html_body, asset_base)

    css = DEFAULT_CSS.read_text(encoding="utf-8")
    if "HEADER_TEXT" not in css:
        raise RuntimeError(f"Missing HEADER_TEXT placeholder in {DEFAULT_CSS}")
    css_header = report_title.replace("\\", "\\\\").replace('"', '\\"')
    css = css.replace("HEADER_TEXT", css_header)
    if font_dir is not None:
        css = _font_face_css(font_dir) + "\n" + css

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


def render_with_weasyprint(html_text: str, input_path: Path, output_path: Path) -> str:
    try:
        import weasyprint  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"WeasyPrint is unavailable: {exc}") from exc

    version = getattr(weasyprint, "__version__", "unknown")
    if version != REQUIRED_WEASYPRINT_VERSION:
        raise RuntimeError(
            f"WeasyPrint {REQUIRED_WEASYPRINT_VERSION} is required; found {version}. "
            f"Install with `python -m pip install weasyprint=={REQUIRED_WEASYPRINT_VERSION}`."
        )

    weasyprint.HTML(
        string=html_text,
        base_url=str(input_path.parent),
    ).write_pdf(str(output_path))
    if not output_path.is_file() or output_path.stat().st_size < 1024:
        raise RuntimeError("WeasyPrint did not create a valid PDF.")
    return f"weasyprint {version}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render 3d-deep-research Markdown to HTML or PDF."
    )
    parser.add_argument("input", help="Input Markdown path")
    parser.add_argument("output", help="Output .html or .pdf path")
    parser.add_argument(
        "--font-dir",
        default="fonts",
        help="Directory containing NotoSansCJKsc-Regular.otf and Bold.otf; "
        "relative paths resolve from the Markdown directory",
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

    font_dir: Path | None = None
    if output_path.suffix.lower() == ".pdf":
        font_dir = Path(args.font_dir).expanduser()
        if not font_dir.is_absolute():
            font_dir = input_path.parent / font_dir
        font_dir = font_dir.resolve()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    md_text = input_path.read_text(encoding="utf-8")
    try:
        rendered_html, report_title, converter = build_html(
            md_text,
            asset_base=input_path.parent,
            font_dir=font_dir,
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

    temporary_pdf.unlink(missing_ok=True)
    try:
        selected_engine = render_with_weasyprint(
            rendered_html,
            input_path,
            temporary_pdf,
        )
    except Exception as exc:
        temporary_pdf.unlink(missing_ok=True)
        raise SystemExit(
            "PDF rendering failed. Intermediate HTML was kept for debugging:\n"
            f"{html_path}\n- {exc}"
        ) from exc

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
