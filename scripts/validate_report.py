#!/usr/bin/env python3
"""Validate a 3d-deep-research Markdown report and optionally its PDF.

Structural checks cover sections, citations, placeholders, readability and
chart-allocation patches. Evidence-loop checks (confidence calibration and
the attribution-audit / excerpt-archive appendix sections) enforce the
traces of the pre-delivery fact audit; they cannot verify the facts
themselves.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


CHINESE_NUMERALS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6}

# Jargon blacklist from references/readability-style.md (rule 1 translation
# table, left column). These terms must not appear in the report body; they
# are only allowed in appendices and figure footnotes.
JARGON_BLACKLIST = [
    "承重判断",
    "load-bearing",
    "shared-origin",
    "证据门控",
    "反证条件",
    "user-voice",
    "置信度",
]

# Paragraphs in the report body longer than this many characters must be
# split (references/readability-style.md, rule 4).
MAX_PARAGRAPH_CHARS = 300

PLACEHOLDER_PATTERNS = [
    r"\[研究对象\]",
    r"\[YYYY(?:-MM-DD)?\]",
    r"\[一句话(?:问题|判断)?\]",
    r"\[来源\]",
    r"\[待补\]",
    r"\{\{[^}]+\}\}",
    r"\bTODO\b",
    r"\bTBD\b",
]

A4_WIDTH_POINTS = 595.28
A4_HEIGHT_POINTS = 841.89
PAGE_SIZE_TOLERANCE_POINTS = 5.0
LITERAL_HTML_PATTERN = re.compile(
    r"</?(?:br|figure|figcaption|svg|div|span|table|thead|tbody|tr|td|th)\b[^>]*>",
    flags=re.IGNORECASE,
)


def _configure_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")


def _read_pdf(pdf_path: Path) -> tuple[int, str, list[tuple[float, float]]]:
    try:
        from pypdf import PdfReader  # type: ignore
    except ModuleNotFoundError:
        try:
            from PyPDF2 import PdfReader  # type: ignore
        except ModuleNotFoundError as exc:
            raise RuntimeError("Install pypdf or PyPDF2 to validate PDF content.") from exc

    reader = PdfReader(str(pdf_path))
    text_parts: list[str] = []
    page_sizes: list[tuple[float, float]] = []
    for page in reader.pages:
        text_parts.append(page.extract_text() or "")
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        rotation = int(page.get("/Rotate", 0) or 0) % 360
        if rotation in (90, 270):
            width, height = height, width
        page_sizes.append((width, height))
    return len(reader.pages), "\n".join(text_parts), page_sizes


def _split_body_and_appendix(md_text: str) -> tuple[str, str]:
    """Split report into main body (before appendices) and appendix text."""
    appendix_match = re.search(r"^##\s+附录", md_text, flags=re.MULTILINE)
    if appendix_match:
        return md_text[: appendix_match.start()], md_text[appendix_match.start() :]
    return md_text, ""


def _prose_lines(text: str) -> list[tuple[int, str]]:
    """Return (line_no, line) pairs of body prose, excluding headings, tables,
    code fences, HTML blocks, blockquotes, lists, and image lines."""
    lines: list[tuple[int, str]] = []
    in_code = False
    for line_no, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not stripped:
            continue
        if re.match(r"^(#|\||<|>|[-*]\s|!\[|\d+\.\s)", stripped):
            continue
        lines.append((line_no, stripped))
    return lines


def validate_markdown(
    md_text: str,
    base_dir: Path | None = None,
) -> tuple[list[str], list[str], dict[str, int]]:
    errors: list[str] = []
    warnings: list[str] = []

    h1 = re.findall(r"^#\s+.+$", md_text, flags=re.MULTILINE)
    if len(h1) != 1:
        errors.append(f"Expected exactly one H1 title, found {len(h1)}.")

    main_sections = re.findall(
        r"^##\s+([一二三四五六])、(.+)$",
        md_text,
        flags=re.MULTILINE,
    )
    sequence = [CHINESE_NUMERALS[item[0]] for item in main_sections]
    if sequence != [1, 2, 3, 4, 5, 6]:
        errors.append(
            "Main sections must appear exactly once in order: 一、 through 六、. "
            f"Found: {sequence or 'none'}."
        )

    current_main: int | None = None
    in_appendix = False
    for line_no, line in enumerate(md_text.splitlines(), start=1):
        main_match = re.match(r"^##\s+([一二三四五六])、", line)
        if main_match:
            current_main = CHINESE_NUMERALS[main_match.group(1)]
            in_appendix = False
            continue
        if re.match(r"^##\s+附录", line):
            current_main = None
            in_appendix = True
            continue
        sub_match = re.match(r"^###\s+(\d+)\.(\d+)\b", line)
        if sub_match:
            prefix = int(sub_match.group(1))
            if current_main is None or prefix != current_main:
                errors.append(
                    f"Line {line_no}: subsection {sub_match.group(0)!r} "
                    "does not match its main section."
                )
        appendix_match = re.match(r"^###\s+A\d+\b", line)
        if appendix_match and not in_appendix:
            errors.append(f"Line {line_no}: appendix subsection appears outside appendix.")

    placeholders: list[str] = []
    for pattern in PLACEHOLDER_PATTERNS:
        placeholders.extend(re.findall(pattern, md_text, flags=re.IGNORECASE))
    if placeholders:
        errors.append(
            "Unresolved template placeholders: "
            + ", ".join(sorted(set(placeholders))[:10])
        )

    if re.search(r"```\s*mermaid\b", md_text, flags=re.IGNORECASE):
        errors.append("Unrendered Mermaid source found; render it to SVG first.")

    source_definitions = set(
        re.findall(r"^\|\s*(S\d{2,})\s*\|", md_text, flags=re.MULTILINE)
    )
    source_references = set(re.findall(r"\[(S\d{2,})\]", md_text))
    if not source_references:
        errors.append("No [Sxx] source references found in the report.")
    unresolved_sources = source_references - source_definitions
    if unresolved_sources:
        errors.append(
            "Source references missing from the source ledger: "
            + ", ".join(sorted(unresolved_sources))
        )
    unused_sources = source_definitions - source_references
    if unused_sources:
        warnings.append(
            "Source ledger entries are not cited in the report: "
            + ", ".join(sorted(unused_sources))
        )

    if "Claim ID" not in md_text or not re.search(
        r"^\|\s*C\d{2,}\s*\|",
        md_text,
        flags=re.MULTILINE,
    ):
        errors.append("Claim evidence matrix with Cxx rows was not found.")

    # --- Evidence-loop checks (references/evidence-protocol.md:
    # --- confidence calibration, attribution audit, excerpt archive) ---

    # Every Cxx row of the A2 claim matrix must carry a calibrated
    # confidence level in its 置信度/独立性 cell (the 5th cell of the row).
    # Scope the scan to the A2 section so that Cxx rows in A5/A6 audit
    # tables are not mistaken for matrix rows.
    a2_match = re.search(
        r"^###\s+A2\b[^\n]*\n(.*?)(?=^###\s|\Z)",
        md_text,
        flags=re.MULTILINE | re.DOTALL,
    )
    a2_text = a2_match.group(1) if a2_match else ""
    claim_rows = list(
        re.finditer(r"^\|\s*C\d{2,}\s*\|[^\n]*", a2_text, flags=re.MULTILINE)
    )
    for row in claim_rows:
        cells = [cell.strip() for cell in row.group(0).strip("|").split("|")]
        if len(cells) < 5:
            continue
        confidence_cell = cells[4]
        if not re.search(
            r"(?:高|中|低|high|medium|low)", confidence_cell, flags=re.IGNORECASE
        ):
            claim_id = re.search(r"(C\d{2,})", row.group(0))
            warnings.append(
                f"Claim row {claim_id.group(1) if claim_id else '?'} has no "
                "calibrated confidence level (高/中/低 or high/medium/low) "
                "in its 置信度 cell; see evidence-protocol.md 「置信度标定」."
            )

    figures = re.findall(
        r"<figure\b.*?</figure>",
        md_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    for index, figure in enumerate(figures, start=1):
        if "<figcaption" not in figure.lower():
            errors.append(f"Figure {index} has no figcaption.")
        svg_match = re.search(
            r"<svg\b([^>]*)>",
            figure,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if svg_match:
            attributes = svg_match.group(1)
            for required in ("viewBox", "role=", "aria-label="):
                if required.lower() not in attributes.lower():
                    errors.append(f"Figure {index} SVG is missing {required}.")

    # --- Patch-aware rules (references/chart-allocation.md and
    # --- references/readability-style.md) ---

    body_text, appendix_text = _split_body_and_appendix(md_text)

    # Evidence loop: the appendix must carry the attribution-audit log and
    # the excerpt archive (assets/report-template.md A5/A6). These are the
    # only machine-checkable traces of the pre-delivery fact audit.
    for marker, label in (
        ("引用摘录存档", "A5 引用摘录存档"),
        ("归属审计", "A6 归属审计与数字复核记录"),
    ):
        if appendix_text and marker not in appendix_text:
            warnings.append(
                f"Appendix is missing the {label} section "
                "(evidence-protocol.md: 归属审计 / 摘录存档)."
            )

    # Image existence: every local image referenced by <img src> or ![]()
    # must resolve relative to the report file.
    if base_dir is not None:
        image_refs = re.findall(
            r"<img[^>]+src=[\"']([^\"']+)[\"']", md_text, flags=re.IGNORECASE
        )
        image_refs += re.findall(r"!\[[^\]]*\]\(([^)\s]+)", md_text)
        for ref in sorted(set(image_refs)):
            if re.match(r"^(https?://|data:)", ref):
                continue
            candidate = Path(ref)
            if not candidate.is_absolute():
                candidate = base_dir / ref
            if not candidate.is_file():
                errors.append(f"Image file not found: {ref}")

    # Readability rule 2: each of the six main chapters ends with a
    # 「本章判断的成色」 block.
    chapter_matches = list(
        re.finditer(r"^##\s+([一二三四五六])、(.+)$", body_text, flags=re.MULTILINE)
    )
    for pos, chapter in enumerate(chapter_matches):
        end = (
            chapter_matches[pos + 1].start()
            if pos + 1 < len(chapter_matches)
            else len(body_text)
        )
        chapter_text = body_text[chapter.start() : end]
        if "本章判断的成色" not in chapter_text:
            warnings.append(
                f"Chapter {chapter.group(1)}（{chapter.group(2).strip()}）"
                " has no 「本章判断的成色」 closing block."
            )

    # Readability rule 1: framework jargon must not appear in body prose.
    jargon_hits: dict[str, list[int]] = {}
    for line_no, line in _prose_lines(body_text):
        for term in JARGON_BLACKLIST:
            if term.lower() in line.lower():
                jargon_hits.setdefault(term, []).append(line_no)
    for term, line_numbers in jargon_hits.items():
        shown = ", ".join(str(n) for n in line_numbers[:5])
        warnings.append(
            f"Jargon {term!r} appears in the report body "
            f"(lines {shown}); translate it per readability-style.md."
        )

    # Chart-allocation binding rule 2: every data chart (figure with <img>)
    # states the question it answers ("本图回答的问题：……").
    for index, figure in enumerate(figures, start=1):
        if "<img" not in figure.lower():
            continue
        figure_end = md_text.find(figure) + len(figure)
        context = md_text[figure_end : figure_end + 400]
        if "本图回答" not in figure and "本图回答" not in context:
            warnings.append(
                f"Data-chart figure {index} does not state "
                "「本图回答的问题」 near the chart."
            )

    # Readability rule 4: body paragraphs over 300 characters must be split.
    paragraph_start: int | None = None
    paragraph_len = 0
    prose = _prose_lines(body_text)
    for index, (line_no, line) in enumerate(prose):
        if paragraph_start is None:
            paragraph_start = line_no
        paragraph_len += len(re.sub(r"\s", "", line))
        is_last = index + 1 == len(prose)
        continues = not is_last and prose[index + 1][0] == line_no + 1
        if not continues:
            if paragraph_len > MAX_PARAGRAPH_CHARS:
                warnings.append(
                    f"Paragraph starting at line {paragraph_start} has "
                    f"{paragraph_len} characters (> {MAX_PARAGRAPH_CHARS}); split it."
                )
            paragraph_start = None
            paragraph_len = 0

    stats = {
        "main_sections": len(main_sections),
        "source_definitions": len(source_definitions),
        "source_references": len(source_references),
        "claim_rows": len(claim_rows),
        "figures": len(figures),
        "characters": len(md_text),
    }
    return errors, warnings, stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a 3d-deep-research report.")
    parser.add_argument("markdown", help="Markdown report path")
    parser.add_argument("--pdf", help="Optional rendered PDF path")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as failures",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON result")
    return parser.parse_args()


def main() -> None:
    _configure_utf8_console()
    args = parse_args()
    markdown_path = Path(args.markdown).expanduser().resolve()
    if not markdown_path.is_file():
        raise SystemExit(f"Markdown report not found: {markdown_path}")

    md_text = markdown_path.read_text(encoding="utf-8")
    errors, warnings, stats = validate_markdown(md_text, base_dir=markdown_path.parent)

    if args.pdf:
        pdf_path = Path(args.pdf).expanduser().resolve()
        if not pdf_path.is_file() or pdf_path.stat().st_size < 1024:
            errors.append(f"PDF is missing or too small: {pdf_path}")
        else:
            try:
                pages, pdf_text, page_sizes = _read_pdf(pdf_path)
                stats["pdf_pages"] = pages
                stats["pdf_text_characters"] = len(pdf_text)
                if pages < 1:
                    errors.append("PDF has no pages.")
                for page_number, (width, height) in enumerate(page_sizes, start=1):
                    if width > height:
                        errors.append(
                            f"PDF page {page_number} is landscape; expected A4 portrait."
                        )
                        continue
                    if (
                        abs(width - A4_WIDTH_POINTS) > PAGE_SIZE_TOLERANCE_POINTS
                        or abs(height - A4_HEIGHT_POINTS) > PAGE_SIZE_TOLERANCE_POINTS
                    ):
                        errors.append(
                            f"PDF page {page_number} is {width:.1f} x {height:.1f} pt; "
                            "expected A4 portrait."
                        )
                if len(pdf_text.strip()) < 100:
                    warnings.append("PDF text extraction returned very little text.")
                if "\ufffd" in pdf_text:
                    warnings.append("PDF text contains Unicode replacement characters.")
                literal_tag = LITERAL_HTML_PATTERN.search(pdf_text)
                if literal_tag:
                    errors.append(
                        "PDF contains a literal HTML tag: "
                        f"{literal_tag.group(0)!r}."
                    )
            except Exception as exc:
                errors.append(f"PDF validation failed: {exc}")

    passed = not errors and not (args.strict and warnings)
    result = {
        "passed": passed,
        "errors": errors,
        "warnings": warnings,
        "stats": stats,
    }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for error in errors:
            print(f"[ERROR] {error}")
        for warning in warnings:
            print(f"[WARN] {warning}")
        print("[OK] Report validation passed." if passed else "[FAIL] Report validation failed.")
        print("[INFO] " + json.dumps(stats, ensure_ascii=False))

    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
