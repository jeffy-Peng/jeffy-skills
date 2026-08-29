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

SOURCE_PROVENANCE = {
    "primary",
    "independent-secondary",
    "community",
    "lead-only",
}
EVIDENCE_ROLES = {"fact", "behavior", "context", "user-voice", "counterevidence"}
SOURCE_INDEPENDENCE = {"independent", "shared-origin", "unknown"}
CLAIM_TYPES = {"fact", "causal", "mechanism", "market", "forecast"}
CLAIM_IMPORTANCE = {"load-bearing", "supporting"}
CONFIDENCE_LEVELS = {"high", "medium", "low", "高", "中", "低"}
CLAIM_INDEPENDENCE = SOURCE_INDEPENDENCE | {"mixed"}
REVISIT_STATUSES = {
    "未到期",
    "已到期待复核",
    "已复核仍成立",
    "已推翻",
    "部分修正",
    "not-due",
    "due",
    "revisited-holds",
    "overturned",
    "partially-revised",
}
EMPTY_AUDIT_VALUES = {
    "",
    "-",
    "—",
    "无",
    "没有",
    "空",
    "略",
    "同上",
    "n/a",
    "na",
    "none",
    "null",
}


def _configure_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")


def _read_pdf(pdf_path: Path) -> tuple[int, str]:
    try:
        from pypdf import PdfReader  # type: ignore
    except ModuleNotFoundError:
        try:
            from PyPDF2 import PdfReader  # type: ignore
        except ModuleNotFoundError as exc:
            raise RuntimeError("Install pypdf or PyPDF2 to validate PDF content.") from exc

    reader = PdfReader(str(pdf_path))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    return len(reader.pages), text


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


def _split_markdown_row(line: str) -> list[str]:
    """Split a pipe-table row while preserving escaped pipes."""
    value = line.strip()
    if not value.startswith("|"):
        return []
    if value.endswith("|"):
        value = value[1:-1]
    else:
        value = value[1:]
    return [cell.replace(r"\|", "|").strip() for cell in re.split(r"(?<!\\)\|", value)]


def _is_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def _extract_appendix_table(
    md_text: str,
    section_id: str,
) -> tuple[list[str], list[list[str]]]:
    section = re.search(
        rf"^###\s+{re.escape(section_id)}\b[^\n]*\n(.*?)(?=^###\s+|^##\s+|\Z)",
        md_text,
        flags=re.MULTILINE | re.DOTALL,
    )
    if not section:
        return [], []

    table_lines = [
        line for line in section.group(1).splitlines() if line.strip().startswith("|")
    ]
    if len(table_lines) < 2:
        return [], []

    header = _split_markdown_row(table_lines[0])
    separator = _split_markdown_row(table_lines[1])
    if len(header) != len(separator) or not _is_separator_row(separator):
        return [], []

    rows: list[list[str]] = []
    for line in table_lines[2:]:
        cells = _split_markdown_row(line)
        if len(cells) == len(header):
            rows.append(cells)
    return header, rows


def _plain_cell(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"!?(?:\[([^]]*)\])\([^)]+\)", r"\1", value)
    value = re.sub(r"[`*_~]", "", value)
    return re.sub(r"\s+", " ", value).strip()


def _is_empty_audit_value(value: str) -> bool:
    plain = _plain_cell(value).strip("[]（）()。.;；:： ").lower()
    if plain in EMPTY_AUDIT_VALUES:
        return True
    return bool(re.fullmatch(r"(?:待补|todo|tbd|placeholder)(?:充|写|核验)?", plain))


def _contains_enum(value: str, allowed: set[str]) -> bool:
    lowered = value.lower()
    return any(
        re.search(rf"(?<![\w-]){re.escape(item.lower())}(?![\w-])", lowered)
        for item in allowed
    )


def _marked_detail(value: str, labels: tuple[str, ...]) -> str | None:
    label_pattern = "|".join(re.escape(label) for label in labels)
    match = re.search(
        rf"(?:{label_pattern})\s*[:：]?\s*(.*?)(?=(?:；|;)\s*[^；;]+[:：]|$)",
        value,
        flags=re.IGNORECASE,
    )
    return match.group(1).strip() if match else None


def _validate_evidence_consistency(
    md_text: str,
    body_text: str,
) -> list[str]:
    """Validate machine-checkable evidence-loop invariants.

    These checks reject empty or internally inconsistent ledgers. They do not
    establish that an external source is true or that a quotation entails a
    report claim.
    """
    issues: list[str] = []

    tables = {
        section_id: _extract_appendix_table(md_text, section_id)
        for section_id in ("A1", "A2", "A5", "A6")
    }
    for section_id, label in (
        ("A1", "source ledger"),
        ("A2", "Claim evidence matrix"),
        ("A5", "quotation archive"),
        ("A6", "attribution and number audit"),
    ):
        header, rows = tables[section_id]
        if not header:
            issues.append(f"{section_id} {label} table was not found or is malformed.")
        elif not rows:
            issues.append(f"{section_id} {label} has no data rows.")

    _, source_rows = tables["A1"]
    source_ids: set[str] = set()
    for row_no, row in enumerate(source_rows, start=1):
        source_id = row[0].strip()
        if not re.fullmatch(r"S\d{2,}", source_id):
            issues.append(f"A1 row {row_no} has an invalid Source ID: {source_id or '<empty>'}.")
            continue
        if source_id in source_ids:
            issues.append(f"A1 has duplicate Source ID {source_id}.")
        source_ids.add(source_id)

        if len(row) < 4:
            issues.append(f"Source {source_id} does not contain the four required ledger fields.")
            continue
        source_and_date, provenance_role_independence, file_and_limits = row[1:4]
        if _is_empty_audit_value(source_and_date):
            issues.append(f"Source {source_id} has no title, publisher, or date details.")
        location_pattern = (
            r"https?://|(?:^|[\s(])[^\s)]+\."
            r"(?:pdf|html?|md|txt|csv|xlsx?|docx?)\b"
        )
        if not re.search(
            location_pattern,
            source_and_date + " " + file_and_limits,
            flags=re.IGNORECASE,
        ):
            issues.append(f"Source {source_id} has no verifiable URL or file location.")
        if not re.search(r"\b\d{4}-\d{2}-\d{2}\b", source_and_date):
            issues.append(f"Source {source_id} has no ISO publication/access date.")
        if not _contains_enum(provenance_role_independence, SOURCE_PROVENANCE):
            issues.append(f"Source {source_id} has no valid provenance type.")
        if not _contains_enum(provenance_role_independence, EVIDENCE_ROLES):
            issues.append(f"Source {source_id} has no valid evidence role.")
        if not _contains_enum(provenance_role_independence, SOURCE_INDEPENDENCE):
            issues.append(f"Source {source_id} has no valid independence value.")
        if _is_empty_audit_value(file_and_limits):
            issues.append(f"Source {source_id} has no file/access limitations.")

    _, claim_rows = tables["A2"]
    claim_ids: set[str] = set()
    load_bearing_ids: set[str] = set()
    claim_support_ids: dict[str, set[str]] = {}
    claim_source_ids: set[str] = set()
    for row_no, row in enumerate(claim_rows, start=1):
        claim_id = row[0].strip()
        if not re.fullmatch(r"C\d{2,}", claim_id):
            issues.append(f"A2 row {row_no} has an invalid Claim ID: {claim_id or '<empty>'}.")
            continue
        if claim_id in claim_ids:
            issues.append(f"A2 has duplicate Claim ID {claim_id}.")
        claim_ids.add(claim_id)

        if len(row) < 8:
            issues.append(f"Claim {claim_id} does not contain all eight matrix fields.")
            continue
        statement = row[1]
        type_importance = row[2]
        support_counter = row[3]
        confidence_independence = row[4]
        gap_disconfirmation = row[5]
        stale_after = row[6]
        revisit_status = row[7]

        if _is_empty_audit_value(statement):
            issues.append(f"Claim {claim_id} has no falsifiable statement.")
        if not _contains_enum(type_importance, CLAIM_TYPES):
            issues.append(f"Claim {claim_id} has no valid Claim type.")
        is_load_bearing = _contains_enum(type_importance, {"load-bearing"})
        if not _contains_enum(type_importance, CLAIM_IMPORTANCE):
            issues.append(f"Claim {claim_id} has no valid importance value.")
        if is_load_bearing:
            load_bearing_ids.add(claim_id)

        counter_detail = _marked_detail(
            support_counter,
            (
                "反向",
                "反向材料",
                "反向证据",
                "反向检索",
                "counter",
                "counterevidence",
            ),
        )
        support_part = support_counter
        counter_marker = re.search(
            r"反向(?:材料|证据|检索)?|counter(?:evidence)?",
            support_counter,
            flags=re.IGNORECASE,
        )
        if counter_marker:
            support_part = support_counter[: counter_marker.start()]
        supporting_ids = set(re.findall(r"S\d{2,}", support_part))
        all_claim_sources = set(re.findall(r"S\d{2,}", support_counter))
        claim_support_ids[claim_id] = supporting_ids
        claim_source_ids.update(all_claim_sources)
        if is_load_bearing and not supporting_ids:
            issues.append(f"Load-bearing Claim {claim_id} has no supporting Source ID.")
        if is_load_bearing and (
            counter_detail is None or _is_empty_audit_value(counter_detail)
        ):
            issues.append(
                f"Load-bearing Claim {claim_id} has no counterevidence Source ID "
                "or concrete reverse-search note."
            )

        if not _contains_enum(confidence_independence, CONFIDENCE_LEVELS):
            issues.append(f"Claim {claim_id} has no calibrated confidence value.")
        if not _contains_enum(confidence_independence, CLAIM_INDEPENDENCE):
            issues.append(f"Claim {claim_id} has no valid independence value.")
        if is_load_bearing and _contains_enum(confidence_independence, {"low", "低"}):
            issues.append(
                f"Load-bearing Claim {claim_id} cannot retain low confidence "
                "as a firm conclusion."
            )

        gap_detail = _marked_detail(gap_disconfirmation, ("缺口", "evidence gap"))
        disconfirmation_detail = _marked_detail(
            gap_disconfirmation,
            ("反证条件", "disconfirmation condition"),
        )
        if gap_detail is None or _is_empty_audit_value(gap_detail):
            issues.append(f"Claim {claim_id} has no concrete evidence gap.")
        if disconfirmation_detail is None or _is_empty_audit_value(disconfirmation_detail):
            issues.append(f"Claim {claim_id} has no concrete disconfirmation condition.")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", stale_after.strip()):
            issues.append(f"Claim {claim_id} has no valid stale_after date.")
        if _plain_cell(revisit_status).lower() not in {item.lower() for item in REVISIT_STATUSES}:
            issues.append(f"Claim {claim_id} has no valid revisit status.")

    dangling_claim_sources = claim_source_ids - source_ids
    if dangling_claim_sources:
        issues.append(
            "Claim matrix references undefined Source IDs: "
            + ", ".join(sorted(dangling_claim_sources))
            + "."
        )

    body_source_ids = set(re.findall(r"\[(S\d{2,})\]", body_text))
    if not body_source_ids:
        issues.append("The report body has no [Sxx] source citations.")
    dangling_body_sources = body_source_ids - source_ids
    if dangling_body_sources:
        issues.append(
            "Report body references undefined Source IDs: "
            + ", ".join(sorted(dangling_body_sources))
            + "."
        )

    for section_id, minimum_cells in (("A5", 4), ("A6", 5)):
        _, audit_rows = tables[section_id]
        audit_ids: set[str] = set()
        for row_no, row in enumerate(audit_rows, start=1):
            claim_id = row[0].strip()
            if not re.fullmatch(r"C\d{2,}", claim_id):
                issues.append(
                    f"{section_id} row {row_no} has an invalid Claim ID: "
                    f"{claim_id or '<empty>'}."
                )
                continue
            if claim_id in audit_ids:
                issues.append(f"{section_id} has duplicate Claim ID {claim_id}.")
            audit_ids.add(claim_id)
            if claim_id not in claim_ids:
                issues.append(f"{section_id} references undefined Claim ID {claim_id}.")
            if len(row) < minimum_cells or any(
                _is_empty_audit_value(cell) for cell in row[1:minimum_cells]
            ):
                issues.append(f"{section_id} audit row for {claim_id} is incomplete or empty.")
                continue
            if section_id == "A5":
                excerpt_sources = set(re.findall(r"S\d{2,}", row[1]))
                if not excerpt_sources:
                    issues.append(f"A5 excerpt for {claim_id} has no Source ID.")
                elif not excerpt_sources.issubset(source_ids):
                    issues.append(f"A5 excerpt for {claim_id} references an undefined Source ID.")
                elif claim_id in claim_support_ids and not (
                    excerpt_sources & claim_support_ids[claim_id]
                ):
                    issues.append(
                        f"A5 excerpt for {claim_id} does not cite one of its supporting sources."
                    )

        missing_audit = load_bearing_ids - audit_ids
        if missing_audit:
            issues.append(
                f"{section_id} is missing load-bearing Claims: "
                + ", ".join(sorted(missing_audit))
                + "."
            )

    return issues


def validate_markdown(
    md_text: str,
    base_dir: Path | None = None,
    strict: bool = False,
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

    _, a1_rows = _extract_appendix_table(md_text, "A1")
    source_definitions = {
        row[0].strip()
        for row in a1_rows
        if row and re.fullmatch(r"S\d{2,}", row[0].strip())
    }
    source_references = set(re.findall(r"\[(S\d{2,})\]", md_text))
    if not source_references:
        errors.append("No [Sxx] source references found in the report.")
    unresolved_sources = source_references - source_definitions
    if unresolved_sources:
        errors.append(
            "Source references missing from the source ledger: "
            + ", ".join(sorted(unresolved_sources))
        )
    _, a2_rows_for_usage = _extract_appendix_table(md_text, "A2")
    _, a5_rows_for_usage = _extract_appendix_table(md_text, "A5")
    ledger_source_uses = {
        source_id
        for row in a2_rows_for_usage + a5_rows_for_usage
        for source_id in re.findall(r"S\d{2,}", " | ".join(row[1:]))
    }
    unused_sources = source_definitions - source_references - ledger_source_uses
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

    evidence_issues = _validate_evidence_consistency(md_text, body_text)
    if strict:
        errors.extend(evidence_issues)
    else:
        warnings.extend(evidence_issues)

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
    errors, warnings, stats = validate_markdown(
        md_text,
        base_dir=markdown_path.parent,
        strict=args.strict,
    )

    if args.pdf:
        pdf_path = Path(args.pdf).expanduser().resolve()
        if not pdf_path.is_file() or pdf_path.stat().st_size < 1024:
            errors.append(f"PDF is missing or too small: {pdf_path}")
        else:
            try:
                pages, pdf_text = _read_pdf(pdf_path)
                stats["pdf_pages"] = pages
                stats["pdf_text_characters"] = len(pdf_text)
                if pages < 1:
                    errors.append("PDF has no pages.")
                if len(pdf_text.strip()) < 100:
                    warnings.append("PDF text extraction returned very little text.")
                if "\ufffd" in pdf_text:
                    warnings.append("PDF text contains Unicode replacement characters.")
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
