#!/usr/bin/env python3
"""Validate machine-checkable parts of a 3d-deep-research report."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from html.parser import HTMLParser
from math import isfinite
from pathlib import Path

from report_artifacts import MediaReferences, local_path, validate_manifest


REQUIRED_MAIN_SECTIONS = ["一", "二", "三", "四"]
CLAIM_TYPES = {
    "fact",
    "causal",
    "mechanism",
    "market",
    "forecast",
    "事实",
    "因果",
    "机制",
    "市场",
    "预测",
}
MECHANISM_STATUSES = {
    "机制可行",
    "案例中运行",
    "解释力已确认",
    "解释力未确认",
    "possible",
    "operating",
    "confirmed",
    "unconfirmed",
}
CONFIDENCE_LEVELS = {"high", "medium", "low", "高", "中", "低"}
INDEPENDENCE_MARKERS = {
    "independent",
    "shared-origin",
    "unknown",
    "mixed",
    "独立",
    "非独立",
    "同源",
    "未知",
}
PLACEHOLDER_PATTERNS = (
    r"\[研究对象\]",
    r"\[YYYY(?:-MM-DD)?\]",
    r"\[一句话(?:问题|判断)?\]",
    r"\{\{[^}]+\}\}",
    r"\bTODO\b",
    r"\bTBD\b",
    r"\bURL\b",
    r"^\s*(?:#{1,6}\s*)?\[[^\]\n]+\]\s*$",
    r"\|\s*\[[^|\n]+\]\s*(?=\|)",
)
A4_WIDTH_POINTS = 595.28
A4_HEIGHT_POINTS = 841.89
PAGE_SIZE_TOLERANCE_POINTS = 5.0
REQUIRED_PDF_PRODUCER = "WeasyPrint 69.0"
REQUIRED_PDF_FONTS = {
    "Noto-Sans-CJK-SC",
    "Noto-Sans-CJK-SC-Bold",
}
LITERAL_HTML_PATTERN = re.compile(
    r"</?(?:br|figure|figcaption|svg|div|span|table|thead|tbody|tr|td|th)\b[^>]*>",
    flags=re.IGNORECASE,
)


def _configure_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")


def _read_pdf(
    pdf_path: Path,
) -> tuple[str, list[tuple[float, float]], str, set[str]]:
    try:
        from pypdf import PdfReader  # type: ignore
    except ModuleNotFoundError:
        try:
            from PyPDF2 import PdfReader  # type: ignore
        except ModuleNotFoundError as exc:
            raise RuntimeError("Install pypdf or PyPDF2 to validate PDF output.") from exc

    reader = PdfReader(str(pdf_path))
    text_parts: list[str] = []
    page_sizes: list[tuple[float, float]] = []
    font_names: set[str] = set()
    for page in reader.pages:
        text_parts.append(page.extract_text() or "")
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        rotation = int(page.get("/Rotate", 0) or 0) % 360
        if rotation in (90, 270):
            width, height = height, width
        page_sizes.append((width, height))
        resources = page.get("/Resources")
        resources = resources.get_object() if resources else None
        fonts = resources.get("/Font") if resources else None
        fonts = fonts.get_object() if fonts else {}
        for font_ref in fonts.values():
            font = font_ref.get_object()
            base_font = str(font.get("/BaseFont", ""))
            descendants = font.get("/DescendantFonts", [])
            candidates = [font, *(item.get_object() for item in descendants)]
            embedded = False
            for candidate in candidates:
                descriptor = candidate.get("/FontDescriptor")
                descriptor = descriptor.get_object() if descriptor else {}
                for key in ("/FontFile", "/FontFile2", "/FontFile3"):
                    stream = descriptor.get(key)
                    if stream and stream.get_object().get_data():
                        embedded = True
            if base_font and embedded:
                font_names.add(base_font.lstrip("/").split("+")[-1])
    metadata = reader.metadata or {}
    producer = str(metadata.get("/Producer", ""))
    return "\n".join(text_parts), page_sizes, producer, font_names


def _validate_pdf_data(
    pdf_text: str,
    page_sizes: list[tuple[float, float]],
    producer: str,
    font_names: set[str],
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not page_sizes:
        errors.append("PDF has no pages.")
    if producer != REQUIRED_PDF_PRODUCER:
        errors.append(
            f"PDF producer is {producer or '<missing>'}; expected {REQUIRED_PDF_PRODUCER}."
        )
    missing_fonts = REQUIRED_PDF_FONTS - font_names
    if missing_fonts:
        errors.append(
            "PDF does not embed required Noto CJK fonts: "
            + ", ".join(sorted(missing_fonts))
            + "."
        )
    for page_number, (width, height) in enumerate(page_sizes, start=1):
        if width > height:
            errors.append(f"PDF page {page_number} is landscape; expected A4 portrait.")
            continue
        if (
            abs(width - A4_WIDTH_POINTS) > PAGE_SIZE_TOLERANCE_POINTS
            or abs(height - A4_HEIGHT_POINTS) > PAGE_SIZE_TOLERANCE_POINTS
        ):
            errors.append(
                f"PDF page {page_number} is {width:.1f} x {height:.1f} pt; "
                "expected A4 portrait."
            )
    literal_tag = LITERAL_HTML_PATTERN.search(pdf_text)
    if literal_tag:
        errors.append(f"PDF contains a literal HTML tag: {literal_tag.group(0)!r}.")
    if len(pdf_text.strip()) < 100:
        warnings.append("PDF text extraction returned very little text.")
    if "\ufffd" in pdf_text:
        warnings.append("PDF text contains Unicode replacement characters.")
    return errors, warnings


def validate_pdf(pdf_path: Path) -> tuple[list[str], list[str]]:
    if not pdf_path.is_file() or pdf_path.stat().st_size < 1024:
        return [f"PDF is missing or too small: {pdf_path}"], []
    try:
        pdf_text, page_sizes, producer, font_names = _read_pdf(pdf_path)
    except Exception as exc:
        return [f"PDF validation failed: {exc}"], []
    return _validate_pdf_data(pdf_text, page_sizes, producer, font_names)


def _split_body_and_appendix(md_text: str) -> tuple[str, str]:
    match = re.search(r"^##\s+附录\b", md_text, flags=re.MULTILINE)
    if not match:
        return md_text, ""
    return md_text[: match.start()], md_text[match.start() :]


def _section_text(md_text: str, section_id: str) -> str | None:
    match = re.search(
        rf"^###\s+{re.escape(section_id)}\b[^\n]*\n(.*?)(?=^###\s+|^##\s+|\Z)",
        md_text,
        flags=re.MULTILINE | re.DOTALL,
    )
    return match.group(1) if match else None


def _split_row(line: str) -> list[str]:
    value = line.strip()
    if not value.startswith("|"):
        return []
    value = value[1:-1] if value.endswith("|") else value[1:]
    return [cell.replace(r"\|", "|").strip() for cell in re.split(r"(?<!\\)\|", value)]


def _is_separator(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def _extract_table(
    md_text: str,
    section_id: str,
) -> tuple[list[str], list[list[str]], int]:
    section = _section_text(md_text, section_id)
    if section is None:
        return [], [], 0

    lines = section.splitlines()
    start = next(
        (index for index, line in enumerate(lines) if line.strip().startswith("|")),
        None,
    )
    if start is None:
        return [], [], 0

    table_lines: list[str] = []
    for line in lines[start:]:
        if not line.strip().startswith("|"):
            if table_lines:
                break
            continue
        table_lines.append(line)
    if len(table_lines) < 2:
        return [], [], 0

    header = _split_row(table_lines[0])
    separator = _split_row(table_lines[1])
    if len(header) != len(separator) or not _is_separator(separator):
        return [], [], 0

    rows: list[list[str]] = []
    malformed = 0
    for line in table_lines[2:]:
        cells = _split_row(line)
        if len(cells) == len(header):
            rows.append(cells)
        else:
            malformed += 1
    return header, rows, malformed


def _plain_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"!?\[([^]]*)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"[`*_~]", "", value)
    return re.sub(r"\s+", " ", value).strip()


def _contains_enum(value: str, markers: set[str]) -> bool:
    for marker in markers:
        boundary = r"A-Za-z0-9_-" if marker.isascii() else r"\w-"
        if re.search(rf"(?<![{boundary}]){re.escape(marker)}(?![{boundary}])", value, re.I):
            return True
    return False


def _validate_metadata(md_text: str) -> list[str]:
    lines = md_text.splitlines()
    first_content = next(
        (index for index, line in enumerate(lines) if line.strip()),
        None,
    )
    if first_content is None:
        return ["The report metadata line is missing or malformed."]

    next_content = next(
        (line.strip() for line in lines[first_content + 1 :] if line.strip()),
        "",
    )
    match = re.fullmatch(
        r">\s*研究问题\s*[：:]\s*(?P<question>.+?)\s*\|\s*"
        r"资料截止\s*[：:]\s*(?P<cutoff>\d{4}-\d{2}-\d{2})\s*\|\s*"
        r"完成日期\s*[：:]\s*(?P<completed>\d{4}-\d{2}-\d{2})\s*",
        next_content,
    )
    if not match or not _is_filled(match.group("question") if match else ""):
        return ["The report metadata line is missing or malformed."]

    try:
        cutoff = date.fromisoformat(match.group("cutoff"))
        completed = date.fromisoformat(match.group("completed"))
    except ValueError:
        return ["The report metadata contains an invalid ISO date."]
    if completed < cutoff:
        return ["The report completion date cannot precede the source cutoff date."]
    return []


def _is_filled(value: str) -> bool:
    return bool(_plain_text(value).strip("-—[]（）()。.;；:： "))


def _validate_sources(
    rows: list[list[str]],
    legacy_schema: bool = False,
) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    source_ids: set[str] = set()
    location_pattern = re.compile(
        r"https?://|(?:^|[\s(])[^\s)]+\."
        r"(?:pdf|html?|md|txt|csv|xlsx?|docx?)\b",
        flags=re.IGNORECASE,
    )

    for row_no, row in enumerate(rows, start=1):
        if len(row) != 4:
            errors.append(f"A1 row {row_no} must have four columns.")
            continue
        source_id = row[0].strip()
        if not re.fullmatch(r"S\d{2,}", source_id):
            errors.append(f"A1 row {row_no} has an invalid Source ID: {source_id or '<empty>'}.")
            continue
        if source_id in source_ids:
            errors.append(f"A1 has duplicate Source ID {source_id}.")
        source_ids.add(source_id)

        details, role, limits = row[1:4]
        if not _is_filled(details):
            errors.append(f"Source {source_id} has no source details.")
        if not location_pattern.search(details + " " + limits):
            errors.append(f"Source {source_id} has no URL or file location.")
        if legacy_schema and not re.search(r"\b\d{4}-\d{2}-\d{2}\b", details):
            errors.append(f"Source {source_id} has no ISO date.")
        for value in re.findall(r"\b\d{4}-\d{2}-\d{2}\b", details):
            try:
                date.fromisoformat(value)
            except ValueError:
                errors.append(f"Source {source_id} has an invalid ISO date: {value}.")
        if not legacy_schema:
            fields = _labeled_fields(details)
            for label in ("发布者", "发布", "访问"):
                if not _is_filled(fields.get(label, "")):
                    errors.append(f"Source {source_id} is missing {label}.")
            for label, unknown in (("发布", "未知"), ("访问", "不适用")):
                value = fields.get(label, "")
                if value != unknown and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                    errors.append(f"Source {source_id} {label} must be an ISO date or {unknown}.")
        if not _is_filled(role):
            errors.append(f"Source {source_id} has no evidence role.")
        elif not _contains_enum(role, INDEPENDENCE_MARKERS):
            errors.append(f"Source {source_id} does not state source independence.")
        if not _is_filled(limits):
            errors.append(f"Source {source_id} has no limitations.")

    return errors, source_ids


def _labeled_fields(value: str) -> dict[str, str]:
    fields = {}
    for part in re.split(r"[；;]|<br\s*/?>", value):
        match = re.match(r"\s*([^：:]+)[：:]\s*(.*?)\s*$", part)
        if match:
            fields[match.group(1)] = match.group(2)
    return fields


def _validate_claims(
    rows: list[list[str]],
    source_ids: set[str],
    header: list[str] | None = None,
    legacy_schema: bool = False,
) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    claim_ids: set[str] = set()
    used_sources: set[str] = set()

    new_schema = bool(
        header
        and len(header) == 6
        and ("机制状态" in header[2] or "证据范围" in header[2] or "mechanism status" in header[2].lower())
    )

    for row_no, row in enumerate(rows, start=1):
        if len(row) != 6:
            errors.append(f"A2 row {row_no} must have six columns.")
            continue
        claim_id = row[0].strip()
        if not re.fullmatch(r"C\d{2,}", claim_id):
            errors.append(f"A2 row {row_no} has an invalid Claim ID: {claim_id or '<empty>'}.")
            continue
        if claim_id in claim_ids:
            errors.append(f"A2 has duplicate Claim ID {claim_id}.")
        claim_ids.add(claim_id)

        statement = row[1]
        claim_type = row[2]
        if not _is_filled(statement):
            errors.append(f"Claim {claim_id} has no statement.")
        if not _contains_enum(claim_type, CLAIM_TYPES):
            errors.append(f"Claim {claim_id} has no recognized type.")
        elif not legacy_schema and re.split(r"[；;]", claim_type)[0].strip().lower() not in CLAIM_TYPES:
            errors.append(f"Claim {claim_id} must have exactly one type before its evidence fields.")

        if new_schema:
            support_part, counterevidence, confidence_gap = row[3:6]
            evidence = f"{support_part} {counterevidence}"
            confidence = confidence_gap
            gap = confidence_gap
            if not _is_filled(counterevidence):
                errors.append(
                    f"Claim {claim_id} has no counterevidence, alternative explanation, "
                    "or reverse-search note."
                )
            causal_or_mechanism = _contains_enum(
                claim_type, {"causal", "mechanism", "因果", "机制"}
            )
            if not legacy_schema:
                fields = _labeled_fields(confidence_gap)
                for label in ("置信度", "缺口", "修订条件"):
                    if not _is_filled(fields.get(label, "")):
                        errors.append(f"Claim {claim_id} is missing {label}.")
                confidence = fields.get("置信度", "")
                gap = fields.get("缺口", "")
                if causal_or_mechanism:
                    scope = _labeled_fields(claim_type)
                    for label in ("过程", "归因"):
                        if not _is_filled(scope.get(label, "")):
                            errors.append(f"Claim {claim_id} is missing mechanism evidence scope: {label}.")
            elif causal_or_mechanism and not _contains_enum(
                claim_type, MECHANISM_STATUSES
            ):
                errors.append(f"Claim {claim_id} has no mechanism evidence status.")
        else:
            if not legacy_schema:
                errors.append("Legacy A2 schema requires --legacy-schema; migrate new reports to contract 3.")
            evidence, confidence, gap = row[3:6]
            reverse_marker = re.search(
                r"反向|替代|未解决|counter",
                evidence,
                flags=re.IGNORECASE,
            )
            support_part = evidence[: reverse_marker.start()] if reverse_marker else evidence
            if not reverse_marker:
                errors.append(
                    f"Claim {claim_id} has no counterevidence or reverse-search note."
                )

        supporting_sources = set(re.findall(r"S\d{2,}", support_part))
        claim_sources = set(re.findall(r"S\d{2,}", evidence))
        used_sources.update(claim_sources)
        if not supporting_sources:
            errors.append(f"Claim {claim_id} has no supporting Source ID.")
        undefined = claim_sources - source_ids
        if undefined:
            errors.append(
                f"Claim {claim_id} references undefined Source IDs: "
                + ", ".join(sorted(undefined))
                + "."
            )

        confidence_valid = (
            _contains_enum(confidence, CONFIDENCE_LEVELS)
            if legacy_schema else confidence.strip().lower() in CONFIDENCE_LEVELS
        )
        if not confidence_valid:
            errors.append(f"Claim {claim_id} has no confidence level.")
        independence_value = support_part if new_schema else confidence
        if not _contains_enum(independence_value, INDEPENDENCE_MARKERS):
            errors.append(f"Claim {claim_id} does not state evidence independence.")
        if not _is_filled(gap):
            errors.append(f"Claim {claim_id} has no evidence gap or disconfirmation condition.")

    return errors, used_sources


def _inside(position: int, ranges: list[tuple[int, int]]) -> bool:
    return any(start <= position < end for start, end in ranges)


class _SVGAttributes(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.items: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "svg":
            self.items.append(dict(attrs))


def _validate_figures(md_text: str, base_dir: Path | None) -> list[str]:
    errors: list[str] = []
    figures = list(
        re.finditer(r"<figure\b.*?</figure>", md_text, flags=re.IGNORECASE | re.DOTALL)
    )
    ranges = [(figure.start(), figure.end()) for figure in figures]

    for index, match in enumerate(figures, start=1):
        figure = match.group(0)
        if not re.search(r"<figcaption\b[^>]*>\s*.+?</figcaption>", figure, re.I | re.S):
            errors.append(f"Figure {index} has no non-empty figcaption.")
        if not re.search(r"\[S\d{2,}\]", figure):
            errors.append(f"Figure {index} has no Source ID.")
        parser = _SVGAttributes()
        parser.feed(figure)
        for attributes in parser.items:
            try:
                box = [float(x) for x in re.split(r"[\s,]+", attributes.get("viewbox", "").strip())]
                valid_box = len(box) == 4 and all(isfinite(x) for x in box) and box[2] > 0 and box[3] > 0
            except (ValueError, AttributeError):
                valid_box = False
            if not valid_box:
                errors.append(f"Figure {index} SVG has missing or invalid viewbox.")
            if attributes.get("role") != "img":
                errors.append(f"Figure {index} SVG requires role=img.")
            if not (attributes.get("aria-label") or "").strip():
                errors.append(f"Figure {index} SVG requires a non-empty aria-label= value.")

    media = list(re.finditer(r"<(?:img|image)\b[^>]*>", md_text, flags=re.IGNORECASE))
    media += list(re.finditer(r"!\[[^\]]*\]\([^)]+\)", md_text))
    media += list(re.finditer(r"<svg\b[^>]*>", md_text, flags=re.IGNORECASE))
    for match in media:
        if not _inside(match.start(), ranges):
            errors.append("An image or SVG appears outside a <figure> element.")

    if base_dir is not None:
        media_parser = MediaReferences()
        media_parser.feed(md_text)
        refs = media_parser.refs
        refs += re.findall(r"!\[[^\]]*\]\(([^)\s]+)", md_text)
        for ref in sorted(set(refs)):
            candidate = local_path(ref, base_dir)
            if candidate is not None and not candidate.is_file():
                errors.append(f"Image file not found: {ref}")

    return errors


def validate_markdown(
    md_text: str,
    base_dir: Path | None = None,
    legacy_schema: bool = False,
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    first_content = next((line for line in md_text.splitlines() if line.strip()), "")
    h1 = re.findall(r"^#\s+.+$", md_text, flags=re.MULTILINE)
    if len(h1) != 1 or first_content != h1[0]:
        errors.append("The report must start with exactly one H1 title.")
    errors.extend(_validate_metadata(md_text))
    if legacy_schema:
        warnings.append("Legacy schema mode: evidence contract 3 is not enforced.")
    elif not re.search(r"^>\s*证据契约：3\s*$", md_text, re.M):
        errors.append("New reports require > 证据契约：3; use --legacy-schema only for historical reports.")

    main_sections = re.findall(
        r"^##\s+([一二三四五六七八九十]+)、.+$",
        md_text,
        flags=re.MULTILINE,
    )
    valid_sequences = [REQUIRED_MAIN_SECTIONS, [*REQUIRED_MAIN_SECTIONS, "五"]]
    if legacy_schema and main_sections not in valid_sequences:
        errors.append(
            "Main sections must be 一 through 四, with 五 optional. "
            f"Found: {main_sections or 'none'}."
        )

    placeholders: list[str] = []
    for pattern in PLACEHOLDER_PATTERNS:
        placeholders.extend(re.findall(pattern, md_text, flags=re.IGNORECASE | re.MULTILINE))
    if placeholders:
        errors.append("Unresolved template placeholders were found.")
    if re.search(r"```\s*mermaid\b", md_text, flags=re.IGNORECASE):
        errors.append("Unrendered Mermaid source found.")

    body_text, appendix_text = _split_body_and_appendix(md_text)
    if not appendix_text:
        errors.append("The report has no appendix.")

    a1_header, a1_rows, a1_malformed = _extract_table(appendix_text, "A1")
    a2_header, a2_rows, a2_malformed = _extract_table(appendix_text, "A2")
    if len(a1_header) != 4 or not a1_rows:
        errors.append("A1 must contain a four-column source ledger with data rows.")
    if a1_malformed:
        errors.append(f"A1 has {a1_malformed} malformed data row(s).")
    if len(a2_header) != 6 or not a2_rows:
        errors.append("A2 must contain a six-column Claim ledger with data rows.")
    if a2_malformed:
        errors.append(f"A2 has {a2_malformed} malformed data row(s).")

    source_errors, source_ids = _validate_sources(a1_rows, legacy_schema)
    claim_errors, claim_source_ids = _validate_claims(a2_rows, source_ids, a2_header, legacy_schema)
    errors.extend(source_errors)
    errors.extend(claim_errors)

    body_source_ids = set(re.findall(r"\[(S\d{2,})\]", body_text))
    all_sources = set(re.findall(r"\[(S\d{2,})\]", md_text))
    if all_sources - source_ids:
        errors.append("Report references undefined Source IDs: " + ", ".join(sorted(all_sources - source_ids)))
    for heading, content in re.findall(r"^(##\s+[^\n]+)\n(.*?)(?=^##\s+|\Z)", body_text, re.M | re.S):
        content = re.sub(r"^#{3,6}\s+.*$", "", content, flags=re.M)
        if not _is_filled(content):
            errors.append(f"Empty analysis section: {heading}")
    if not body_source_ids:
        errors.append("The report body has no [Sxx] citations.")
    undefined_body_sources = body_source_ids - source_ids
    if undefined_body_sources:
        errors.append(
            "Report body references undefined Source IDs: "
            + ", ".join(sorted(undefined_body_sources))
            + "."
        )
    unused_sources = source_ids - body_source_ids - claim_source_ids
    if unused_sources:
        warnings.append(
            "Source ledger entries are unused: " + ", ".join(sorted(unused_sources)) + "."
        )

    a3_text = _section_text(appendix_text, "A3")
    if a3_text is None or not _is_filled(a3_text):
        errors.append("A3 must describe evidence boundaries.")

    errors.extend(_validate_figures(md_text, base_dir))
    return errors, warnings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a 3d-deep-research report.")
    parser.add_argument("markdown", help="Markdown report path")
    parser.add_argument("--pdf", help="Optional rendered PDF path")
    parser.add_argument("--html", help="Optional rendered HTML path")
    parser.add_argument("--legacy-schema", action="store_true", help="Read historical evidence ledgers; does not certify current contract")
    return parser.parse_args()


def main() -> None:
    _configure_utf8_console()
    args = parse_args()
    markdown_path = Path(args.markdown).expanduser().resolve()
    if not markdown_path.is_file():
        raise SystemExit(f"Markdown report not found: {markdown_path}")

    md_text = markdown_path.read_text(encoding="utf-8")
    errors, warnings = validate_markdown(md_text, base_dir=markdown_path.parent, legacy_schema=args.legacy_schema)
    if args.pdf:
        pdf_errors, pdf_warnings = validate_pdf(Path(args.pdf).expanduser().resolve())
        errors.extend(pdf_errors)
        warnings.extend(pdf_warnings)
    for artifact in (args.pdf, args.html):
        if artifact:
            if args.legacy_schema:
                warnings.append("Legacy artifact identity is not verified; render again for current-contract delivery.")
            else:
                identity_errors, identity_warnings = validate_manifest(markdown_path, Path(artifact).expanduser().resolve())
                errors.extend(identity_errors)
                warnings.extend(identity_warnings)
    for error in errors:
        print(f"[ERROR] {error}")
    for warning in warnings:
        print(f"[WARN] {warning}")
    passed = not errors
    print("[OK] Report validation passed." if passed else "[FAIL] Report validation failed.")
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
