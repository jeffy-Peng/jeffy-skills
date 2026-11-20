#!/usr/bin/env python3
"""Render a 3d-deep-research Markdown report to HTML or PDF."""

from __future__ import annotations

import argparse
import base64
import mimetypes
import html
import os
import re
import shutil
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from string import Template
from urllib.parse import unquote, urlsplit, urlunsplit

from linkify_sources import linkify_html
from report_artifacts import MediaReferences, local_path, sha256, write_manifest


SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CSS = SKILL_DIR / "assets" / "report.css"
REPORT_FRAME = SKILL_DIR / "assets" / "report.html"
REQUIRED_WEASYPRINT_VERSION = "69.0"
REPORT_FONT = "NotoSerifSC-VF.ttf"


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

    body = "\n".join(lines)
    body = re.sub(r"^>\s*证据契约：3\s*$", "", body, flags=re.MULTILINE)
    return title, meta_line, body


def _resolve_local_media(html_body: str, base_dir: Path | None, embed: bool = False) -> str:
    """Resolve relative image references against the Markdown directory."""
    if base_dir is None:
        return html_body

    attribute = re.compile(
        r'(<(?:img|image|use)\b[^>]*?\b(?:src|href|xlink:href)\s*=\s*)(["\'])(.*?)\2',
        flags=re.IGNORECASE | re.DOTALL,
    )

    def resolve(match: re.Match[str]) -> str:
        value = match.group(3).strip()
        path = local_path(html.unescape(value), base_dir)
        if embed and path is not None:
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            fragment = urlsplit(value).fragment
            uri = f"data:{mime};base64,{encoded}" + (f"#{fragment}" if fragment else "")
            return f"{match.group(1)}{match.group(2)}{uri}{match.group(2)}"
        parsed = urlsplit(value)
        if (
            not value
            or parsed.scheme
            or parsed.netloc
            or value.startswith(("//", "#", "/"))
        ):
            return match.group(0)

        local_uri = (base_dir / unquote(parsed.path)).resolve().as_uri()
        resolved = urlsplit(local_uri)
        rewritten = urlunsplit(
            (resolved.scheme, resolved.netloc, resolved.path, parsed.query, parsed.fragment)
        )
        return f"{match.group(1)}{match.group(2)}{rewritten}{match.group(2)}"

    return attribute.sub(resolve, html_body)


def _font_face_css(font_dir: Path) -> str:
    font = font_dir / REPORT_FONT
    if not font.is_file():
        raise RuntimeError(f"Missing required Noto Serif SC font: {font}")
    return (
        '@font-face {\n'
        '  font-family: "Noto Serif SC";\n'
        f'  src: url("{font.resolve().as_uri()}") format("truetype");\n'
        '  font-style: normal;\n'
        '  font-weight: 200 900;\n'
        '}'
    )


class ReadingOutline(HTMLParser):
    """Number report headings and build a shared desktop/mobile navigation."""

    VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
                 "link", "meta", "param", "source", "track", "wbr"}
    HEADINGS = {"h2": 0, "h3": 1, "h4": 2}
    CHAPTER_PREFIX = re.compile(r"^\s*[一二三四五六七八九十]+、\s*")

    def __init__(self, fragment: str) -> None:
        super().__init__(convert_charrefs=True)
        self.fragment = fragment
        self.lines = [0, *(match.end() for match in re.finditer("\n", fragment))]
        self.stack: list[str] = []
        self.edits: list[tuple[int, int, str]] = []
        self.counts = [0, 0, 0]
        self.chapters: list[list[str]] = []
        self.heading: tuple[int, int, str | None] | None = None
        self.label: list[str] = []
        self.table_start: int | None = None
        self.feed(fragment)
        self.close()

    def source_offset(self) -> int:
        row, column = self.getpos()
        return self.lines[row - 1] + column

    def handle_starttag(self, tag, attrs) -> None:
        if not self.stack:
            if tag in self.HEADINGS:
                start = self.source_offset()
                end = start + len(self.get_starttag_text())
                self.heading = (start, end, dict(attrs).get("id"))
                self.label = []
            if tag == "table":
                self.table_start = self.source_offset()
        if tag not in self.VOID_TAGS:
            self.stack.append(tag)

    def handle_data(self, data) -> None:
        if self.heading is not None:
            self.label.append(data)

    def handle_endtag(self, tag) -> None:
        if self.stack == [tag] and self.heading is not None:
            self.number_heading(tag)
            self.heading = None
        if self.stack == ["table"] and tag == "table" and self.table_start is not None:
            start = self.table_start
            end = self.fragment.index(">", self.source_offset()) + 1
            ledger = re.search(r"<th(?:\s[^>]*)?>\s*(?:Source|Claim) ID\s*</th>",
                               self.fragment[start:end], re.IGNORECASE)
            css_class = "table-wrap ledger-table" if ledger else "table-wrap"
            self.edits.append((start, start, f'<div class="{css_class}" tabindex="0" aria-label="可横向滚动的表格">'))
            self.edits.append((end, end, "</div>"))
            self.table_start = None
        if tag in self.stack:
            index = len(self.stack) - 1 - self.stack[::-1].index(tag)
            del self.stack[index:]

    def number_heading(self, tag: str) -> None:
        depth = self.HEADINGS[tag]
        if depth and not self.counts[depth - 1]:
            return
        self.counts[depth] += 1
        self.counts[depth+1:] = [0] * (2 - depth)
        number = ".".join(map(str, self.counts[:depth+1]))
        start, end, existing_id = self.heading
        anchor = html.escape(existing_id or "heading-" + number.replace(".", "-"), quote=True)
        original_tag = self.fragment[start:end]
        marker = " data-outline"
        if not existing_id:
            marker += f' id="{anchor}"'
        open_tag = original_tag[:-1] + marker + ">"
        label = "".join(self.label).strip()
        if depth == 0:
            end_of_prefix = self.CHAPTER_PREFIX.match(self.fragment[end:self.source_offset()])
            if end_of_prefix:
                end += end_of_prefix.end()
                label = self.CHAPTER_PREFIX.sub("", label)
        self.edits.append((start, end, f'{open_tag}<span class="heading-number">{number}</span>'))
        link = f'<a href="#{anchor}" data-depth="{depth+1}"><span class="toc-num">{number}</span>{html.escape(label)}</a>'
        if depth == 0:
            self.chapters.append([])
        self.chapters[-1].append(link)

    def body(self) -> str:
        fragment = self.fragment
        for start, end, replacement in reversed(self.edits):
            fragment = fragment[:start] + replacement + fragment[end:]
        return fragment

    def toc(self) -> str:
        groups = []
        for index, (chapter, *children) in enumerate(self.chapters):
            opened = " open" if index == 0 else ""
            nested = f'<div class="toc-sub">{"".join(children)}</div>' if children else ""
            groups.append(f"<details{opened}><summary>{chapter}</summary>{nested}</details>")
        return "\n".join(groups)


def build_html(
    md_text: str,
    asset_base: Path | None = None,
    font_dir: Path | None = None,
) -> tuple[str, str, str]:
    report_title, meta_line, body_md = _split_report(md_text)
    html_body, converter = markdown_to_html(body_md)
    html_body = _resolve_local_media(html_body, asset_base, embed=True)

    css = DEFAULT_CSS.read_text(encoding="utf-8")
    if "HEADER_TEXT" not in css:
        raise RuntimeError(f"Missing HEADER_TEXT placeholder in {DEFAULT_CSS}")
    css_header = report_title.replace("\\", "\\\\").replace('"', '\\"')
    css = css.replace("HEADER_TEXT", css_header)
    if font_dir is not None:
        css = _font_face_css(font_dir) + "\n" + css

    subject, separator, headline = report_title.partition("：")
    cover = []
    if separator and headline.strip() and "研究" in subject:
        cover.append(f'<p class="subject">{html.escape(subject)}</p>')
    else:
        headline = report_title
    cover.append(f"<h1>{html.escape(headline.strip())}</h1>")
    if meta_line:
        question, _, dates = meta_line.partition("|")
        cover.append(f'<p class="question">{html.escape(question.strip())}</p>')
        if dates.strip():
            cover.append(f'<p class="date">{html.escape(dates.strip())}</p>')
    outline = ReadingOutline(html_body)
    document = Template(REPORT_FRAME.read_text(encoding="utf-8")).substitute(
        title=html.escape(report_title), css=css, cover="\n".join(cover),
        toc=outline.toc(), body=outline.body(),
    )
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
        help=f"Directory containing {REPORT_FONT}; "
        "relative paths resolve from the Markdown directory",
    )
    return parser.parse_args()


def collect_dependencies(md_text: str, base: Path, font_dir: Path | None) -> tuple[list[Path], list[str]]:
    # Use the converter's actual output, including reference-style Markdown images.
    converted, _ = markdown_to_html(md_text)
    media = MediaReferences()
    media.feed(converted)
    dependencies = [DEFAULT_CSS, REPORT_FRAME, Path(__file__).resolve(),
                    SKILL_DIR / "scripts" / "linkify_sources.py",
                    SKILL_DIR / "scripts" / "report_artifacts.py"]
    remote = []
    for ref in media.refs:
        path = local_path(ref, base)
        if path is not None:
            dependencies.append(path)
        elif ref.startswith(("https://", "http://", "//")):
            remote.append(ref)
    if font_dir is not None:
        dependencies.append(font_dir / REPORT_FONT)
    return dependencies, remote


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
        dependencies, remote = collect_dependencies(md_text, input_path.parent, font_dir)
        expected_inputs = {path: sha256(path) for path in {input_path, *dependencies}}
        # Catch an edit between reading Markdown and taking the resource snapshot.
        if input_path.read_text(encoding="utf-8") != md_text:
            raise ValueError("Markdown changed while preparing render; render again.")
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
        try:
            write_manifest(input_path, output_path, dependencies, remote, expected_inputs)
        except (OSError, ValueError) as exc:
            raise SystemExit(f"Artifact manifest failed; render again: {exc}") from exc
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
    try:
        write_manifest(input_path, output_path, dependencies, remote, expected_inputs)
    except (OSError, ValueError) as exc:
        raise SystemExit(f"Artifact manifest failed; render again: {exc}") from exc
    html_path.unlink(missing_ok=True)
    size_kb = output_path.stat().st_size / 1024
    print(f"[OK] PDF: {output_path} ({size_kb:.1f} KB)")
    print(f"[OK] PDF engine: {selected_engine}")
    print(f"[OK] Markdown converter: {converter}")
    print(f"[OK] Source links: {n_links}; ledger anchors: {n_rows}")
    print(f"[OK] Title: {report_title}")


if __name__ == "__main__":
    main()
