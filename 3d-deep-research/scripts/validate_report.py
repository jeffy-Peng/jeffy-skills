#!/usr/bin/env python3
"""Validate machine-checkable parts of a 3d-deep-research report."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path


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


def _configure_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")


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
    return any(
        re.search(
            rf"(?<![\w-]){re.escape(marker)}(?![\w-])",
            value,
            flags=re.IGNORECASE,
        )
        for marker in markers
    )


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
        if not re.search(r"\b\d{4}-\d{2}-\d{2}\b", details):
            errors.append(f"Source {source_id} has no ISO date.")
        if not _is_filled(role):
            errors.append(f"Source {source_id} has no evidence role.")
        elif not _contains_enum(role, INDEPENDENCE_MARKERS):
            errors.append(f"Source {source_id} does not state source independence.")
        if not _is_filled(limits):
            errors.append(f"Source {source_id} has no limitations.")

    return errors, source_ids


def _validate_claims(
    rows: list[list[str]],
    source_ids: set[str],
) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    claim_ids: set[str] = set()
    used_sources: set[str] = set()

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

        statement, claim_type, evidence, confidence, gap = row[1:6]
        if not _is_filled(statement):
            errors.append(f"Claim {claim_id} has no statement.")
        if not _contains_enum(claim_type, CLAIM_TYPES):
            errors.append(f"Claim {claim_id} has no recognized type.")

        reverse_marker = re.search(
            r"反向|替代|未解决|counter",
            evidence,
            flags=re.IGNORECASE,
        )
        support_part = evidence[: reverse_marker.start()] if reverse_marker else evidence
        supporting_sources = set(re.findall(r"S\d{2,}", support_part))
        claim_sources = set(re.findall(r"S\d{2,}", evidence))
        used_sources.update(claim_sources)
        if not supporting_sources:
            errors.append(f"Claim {claim_id} has no supporting Source ID.")
        if not reverse_marker:
            errors.append(f"Claim {claim_id} has no counterevidence or reverse-search note.")
        undefined = claim_sources - source_ids
        if undefined:
            errors.append(
                f"Claim {claim_id} references undefined Source IDs: "
                + ", ".join(sorted(undefined))
                + "."
            )

        if not _contains_enum(confidence, CONFIDENCE_LEVELS):
            errors.append(f"Claim {claim_id} has no confidence level.")
        if not _contains_enum(confidence, INDEPENDENCE_MARKERS):
            errors.append(f"Claim {claim_id} does not state evidence independence.")
        if not _is_filled(gap):
            errors.append(f"Claim {claim_id} has no evidence gap or disconfirmation condition.")

    return errors, used_sources


def _inside(position: int, ranges: list[tuple[int, int]]) -> bool:
    return any(start <= position < end for start, end in ranges)


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
        for svg in re.finditer(r"<svg\b([^>]*)>", figure, flags=re.IGNORECASE | re.DOTALL):
            attributes = svg.group(1).lower()
            for required in ("viewbox", "role=", "aria-label="):
                if required not in attributes:
                    errors.append(f"Figure {index} SVG is missing {required}.")

    media = list(re.finditer(r"<img\b[^>]*>", md_text, flags=re.IGNORECASE))
    media += list(re.finditer(r"!\[[^\]]*\]\([^)]+\)", md_text))
    media += list(re.finditer(r"<svg\b[^>]*>", md_text, flags=re.IGNORECASE))
    for match in media:
        if not _inside(match.start(), ranges):
            errors.append("An image or SVG appears outside a <figure> element.")

    if base_dir is not None:
        refs = re.findall(r"<img[^>]+src=[\"']([^\"']+)[\"']", md_text, re.I)
        refs += re.findall(r"!\[[^\]]*\]\(([^)\s]+)", md_text)
        for ref in sorted(set(refs)):
            if re.match(r"^(https?://|data:)", ref):
                continue
            candidate = Path(ref)
            if not candidate.is_absolute():
                candidate = base_dir / candidate
            if not candidate.is_file():
                errors.append(f"Image file not found: {ref}")

    return errors


def validate_markdown(
    md_text: str,
    base_dir: Path | None = None,
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    first_content = next((line for line in md_text.splitlines() if line.strip()), "")
    h1 = re.findall(r"^#\s+.+$", md_text, flags=re.MULTILINE)
    if len(h1) != 1 or first_content != h1[0]:
        errors.append("The report must start with exactly one H1 title.")
    errors.extend(_validate_metadata(md_text))

    main_sections = re.findall(
        r"^##\s+([一二三四五六七八九十]+)、.+$",
        md_text,
        flags=re.MULTILINE,
    )
    valid_sequences = [REQUIRED_MAIN_SECTIONS, [*REQUIRED_MAIN_SECTIONS, "五"]]
    if main_sections not in valid_sequences:
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

    source_errors, source_ids = _validate_sources(a1_rows)
    claim_errors, claim_source_ids = _validate_claims(a2_rows, source_ids)
    errors.extend(source_errors)
    errors.extend(claim_errors)

    body_source_ids = set(re.findall(r"\[(S\d{2,})\]", body_text))
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
    return parser.parse_args()


def main() -> None:
    _configure_utf8_console()
    args = parse_args()
    markdown_path = Path(args.markdown).expanduser().resolve()
    if not markdown_path.is_file():
        raise SystemExit(f"Markdown report not found: {markdown_path}")

    md_text = markdown_path.read_text(encoding="utf-8")
    errors, warnings = validate_markdown(md_text, base_dir=markdown_path.parent)
    for error in errors:
        print(f"[ERROR] {error}")
    for warning in warnings:
        print(f"[WARN] {warning}")
    passed = not errors
    print("[OK] Report validation passed." if passed else "[FAIL] Report validation failed.")
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
