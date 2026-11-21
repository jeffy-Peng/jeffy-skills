#!/usr/bin/env python3
"""Build a checked, portable 3d-deep-research HTML report."""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import mimetypes
import re
from html.parser import HTMLParser
from os.path import relpath
from pathlib import Path
from string import Template
from tempfile import TemporaryDirectory
from urllib.parse import quote, urlsplit, urlunsplit
from xml.etree import ElementTree

from report_artifacts import MediaReferences, local_path, manifest_path, sha256, write_manifest
from validate_report import (
    _configure_utf8_console,
    markdown_to_html,
    validate_html_links,
    validate_markdown,
)

SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CSS = SKILL_DIR / "assets" / "report.css"
REPORT_FRAME = SKILL_DIR / "assets" / "report.html"

SOURCE_ID = r"S\d{2,}"
SKIP_ELEMENTS = {"a", "code", "pre", "script", "style"}
SOURCE_ROW = re.compile(
    rf"<tr\b(?=[^>]*\bid\s*=\s*['\"]src-{SOURCE_ID}['\"])[^>]*>",
    flags=re.IGNORECASE,
)


def linkify_html(
    html_text: str, *, source_dir: Path | None = None, output_dir: Path | None = None
) -> tuple[str, int, int]:
    """Link ``[Sxx]`` citations and return HTML, links added, and ledger rows."""

    row_pattern = re.compile(
        rf"<tr(?P<attrs>[^>]*)>\s*"
        rf"(?P<cells><td(?:\s[^>]*)?>\s*(?P<sid>{SOURCE_ID})\s*</td>.*?</tr>)",
        flags=re.IGNORECASE | re.DOTALL,
    )

    def rebase_link(match: re.Match[str]) -> str:
        ref = html.unescape(match.group(3))
        path = local_path(ref, source_dir)
        if path is None:
            return match.group(0)
        try:
            destination = quote(Path(relpath(path, output_dir)).as_posix())
        except ValueError:  # Different Windows drives have no relative path.
            destination = path.as_uri()
        parsed = urlsplit(ref)
        resolved = urlsplit(destination)
        href = urlunsplit((resolved.scheme, resolved.netloc, resolved.path, parsed.query, parsed.fragment))
        return f"{match.group(1)}{match.group(2)}{html.escape(href, quote=True)}{match.group(2)}"

    def add_anchor(match: re.Match[str]) -> str:
        attrs = match.group("attrs")
        cells = match.group("cells")
        if source_dir is not None and output_dir is not None and source_dir != output_dir:
            cells = re.sub(r"(<a\b[^>]*?\bhref\s*=\s*)(['\"])(.*?)\2", rebase_link, cells, flags=re.I | re.S)
        if not re.search(r"\bid\s*=", attrs, flags=re.IGNORECASE):
            attrs += f' id="src-{match.group("sid")}"'
        return f"<tr{attrs}>{cells}"

    # Limit source anchors to A1 so other report tables can also list Source IDs.
    heading = re.search(
        r'<h3\b[^>]*>(?:<span class="heading-number">[^<]*</span>)?\s*A1\b[^<]*</h3>',
        html_text, flags=re.I,
    )
    if heading:
        tail = html_text[heading.end():]
        table = re.search(r"<table\b[^>]*>.*?</table>", tail, flags=re.I | re.S)
        if table:
            start, end = heading.end() + table.start(), heading.end() + table.end()
            html_text = html_text[:start] + row_pattern.sub(add_anchor, table.group(0)) + html_text[end:]
    else:
        html_text = row_pattern.sub(add_anchor, html_text)

    def citation(match: re.Match[str]) -> str:
        sid = match.group(1)
        return f'<a href="#src-{sid}" class="src-link">[{sid}]</a>'

    output: list[str] = []
    in_ledger_row = False
    skip_depth = 0
    n_links = 0
    for part in re.split(r"(<[^>]+>)", html_text):
        if not part.startswith("<"):
            if in_ledger_row or skip_depth:
                output.append(part)
            else:
                linked, count = re.subn(rf"\[({SOURCE_ID})\]", citation, part)
                output.append(linked)
                n_links += count
            continue

        tag = re.match(r"<\s*(/?)\s*([a-z0-9]+)", part, flags=re.IGNORECASE)
        if tag:
            closing, name = bool(tag.group(1)), tag.group(2).lower()
            if name == "tr":
                in_ledger_row = False if closing else bool(SOURCE_ROW.match(part))
            if name in SKIP_ELEMENTS:
                if closing:
                    skip_depth = max(0, skip_depth - 1)
                elif not part.rstrip().endswith("/>"):
                    skip_depth += 1
        output.append(part)

    return "".join(output), n_links, len(SOURCE_ROW.findall(html_text))


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


def _check_svg_dependencies(path: Path, content: bytes) -> None:
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as exc:
        raise ValueError(f"Cannot embed invalid SVG {path.name}: {exc}") from exc

    references = set()
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        for attr, value in element.attrib.items():
            if tag != "a" and attr.rsplit("}", 1)[-1] == "href" and value.strip():
                references.add(value.strip())
            references.update(re.findall(r"""url\(\s*['"]?([^'")\s]+)""", value, flags=re.I))
        if tag == "style" and element.text:
            references.update(re.findall(r"""url\(\s*['"]?([^'")\s]+)""", element.text, flags=re.I))
            if "@import" in element.text.lower():
                raise ValueError(f"SVG image {path.name} imports CSS. Inline the CSS or export the figure as PNG.")

    external = sorted(ref for ref in references if not ref.lower().startswith(("#", "data:")))
    if external:
        raise ValueError(
            f"SVG image {path.name} is not self-contained: {', '.join(external)}. "
            "Embed those resources in the SVG or export the figure as PNG."
        )


def embed_local_media(html_body: str, base_dir: Path) -> str:
    """Embed images referenced by the HTML using the Markdown directory."""
    attribute = re.compile(
        r'(<(?:img|image|use)\b[^>]*?\b(?:src|href|xlink:href)\s*=\s*)(["\'])(.*?)\2',
        flags=re.IGNORECASE | re.DOTALL,
    )

    def resolve(match: re.Match[str]) -> str:
        value = match.group(3).strip()
        path = local_path(html.unescape(value), base_dir)
        if path is None:
            return match.group(0)
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        content = path.read_bytes()
        if path.suffix.lower() == ".svg":
            _check_svg_dependencies(path, content)
        encoded = base64.b64encode(content).decode("ascii")
        fragment = urlsplit(value).fragment
        uri = f"data:{mime};base64,{encoded}" + (f"#{fragment}" if fragment else "")
        return f"{match.group(1)}{match.group(2)}{uri}{match.group(2)}"

    return attribute.sub(resolve, html_body)


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


def build_html(report_title: str, meta_line: str, html_body: str) -> str:
    css = DEFAULT_CSS.read_text(encoding="utf-8")
    if "HEADER_TEXT" not in css:
        raise RuntimeError(f"Missing HEADER_TEXT placeholder in {DEFAULT_CSS}")
    css_header = report_title.replace("\\", "\\\\").replace('"', '\\"')
    css = css.replace("HEADER_TEXT", css_header)

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
    return Template(REPORT_FRAME.read_text(encoding="utf-8")).substitute(
        title=html.escape(report_title), css=css, cover="\n".join(cover),
        toc=outline.toc(), body=outline.body(),
    )


def collect_dependencies(html_body: str, base: Path) -> tuple[set[Path], list[str]]:
    media = MediaReferences()
    media.feed(html_body)
    media.close()
    dependencies = {
        DEFAULT_CSS,
        REPORT_FRAME,
        Path(__file__).resolve(),
        SKILL_DIR / "scripts" / "report_artifacts.py",
        SKILL_DIR / "scripts" / "validate_report.py",
    }
    remote = []
    for ref in media.refs:
        path = local_path(ref, base)
        if path is not None:
            dependencies.add(path)
        elif ref.startswith(("https://", "http://", "//")):
            remote.append(ref)
    return dependencies, remote


def build_report(source: Path, output: Path, *, require_xyz: bool = False) -> None:
    if source == output:
        raise ValueError("The input report and HTML destination must be different files.")
    source_bytes = source.read_bytes()
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    md_text = source_bytes.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    title, metadata, body = _split_report(md_text)
    html_body = markdown_to_html(body)
    errors, warnings = validate_markdown(
        md_text, source.parent, require_xyz=require_xyz, rendered_body=html_body
    )
    for warning in warnings:
        print(f"[WARN] {warning}")
    if errors:
        raise ValueError("\n".join(errors))

    dependencies, remote = collect_dependencies(html_body, source.parent)
    expected_inputs = {path: sha256(path) for path in dependencies}
    expected_inputs[source] = source_hash
    html_body = embed_local_media(html_body, source.parent)
    document, _, _ = linkify_html(
        build_html(title, metadata, html_body), source_dir=source.parent, output_dir=output.parent
    )
    errors = validate_html_links(document)
    if errors:
        raise ValueError("\n".join(errors))
    if remote:
        print("[WARN] Remote images need a network connection. Check them in the browser.")

    output.parent.mkdir(parents=True, exist_ok=True)
    # Stage both files before publishing and exclude overlapping writes to the same pair.
    lock = output.with_name(f".{output.name}.lock")
    with TemporaryDirectory(prefix=".report-build-", dir=output.parent) as directory:
        staged = Path(directory) / output.name
        staged.write_text(document, encoding="utf-8")
        try:
            lock.touch(exist_ok=False)
        except FileExistsError as exc:
            raise RuntimeError(f"Build lock exists: {lock}. Remove it only if no build is running.") from exc
        try:
            write_manifest(source, staged, sorted(dependencies), remote, expected_inputs)
            staged.replace(output)
            manifest_path(staged).replace(manifest_path(output))
        finally:
            lock.unlink()


def main() -> int:
    _configure_utf8_console()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Input Markdown report")
    parser.add_argument("--output-dir", type=Path, help="Default: Markdown directory")
    parser.add_argument("--require-xyz", action="store_true", help="Check the order of the analysis chapters")
    parser.add_argument("--formats", nargs="+", choices=("html",), help=argparse.SUPPRESS)
    args = parser.parse_args()
    source = args.input.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve() if args.output_dir else source.parent
    output = output_dir / "output.html"
    try:
        build_report(source, output, require_xyz=args.require_xyz)
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"[ERROR] {exc}")
        return 1

    print(f"[OK] HTML built and validated: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
