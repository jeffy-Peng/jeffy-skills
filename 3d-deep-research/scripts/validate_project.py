#!/usr/bin/env python3
"""Validate a complete 3d-deep-research project directory.

The project validator checks the required research contract, retrieval map and
report together. It verifies machine-checkable cross-file consistency, then
delegates report structure and evidence-ledger checks to validate_report.py.
It does not establish that external sources are true.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from validate_report import (
    _extract_appendix_table,
    _is_empty_audit_value,
    _is_separator_row,
    _plain_cell,
    _split_markdown_row,
    validate_markdown,
)


CONTRACT_FIELDS = {
    "研究对象",
    "对象类型",
    "用户决策问题",
    "特别关注点",
    "时间基准",
    "范围边界",
    "交付要求",
    "深度档位",
}
SUBJECT_TYPES = {
    "product",
    "company",
    "technology",
    "concept",
    "person",
    "event",
    "industry",
    "other",
}
DEPTH_LEVELS = {"quick", "standard", "deep"}
QUESTION_STATUSES = {"已解决", "部分", "未解决"}


def _configure_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")


def _extract_heading_section(text: str, heading_pattern: str) -> str:
    match = re.search(
        rf"^##\s+{heading_pattern}[^\n]*\n(.*?)(?=^##\s+|\Z)",
        text,
        flags=re.MULTILINE | re.DOTALL,
    )
    return match.group(1) if match else ""


def _first_table(text: str) -> tuple[list[str], list[list[str]]]:
    table_lines = [line for line in text.splitlines() if line.strip().startswith("|")]
    if len(table_lines) < 2:
        return [], []
    header = _split_markdown_row(table_lines[0])
    separator = _split_markdown_row(table_lines[1])
    if len(header) != len(separator) or not _is_separator_row(separator):
        return [], []
    rows = []
    for line in table_lines[2:]:
        cells = _split_markdown_row(line)
        if len(cells) == len(header):
            rows.append(cells)
    return header, rows


def _has_placeholder(value: str) -> bool:
    return _is_empty_audit_value(value) or bool(re.search(r"\[[^]]+\]", value))


def _normalise(value: str) -> str:
    return re.sub(r"[\s，。；：、,.!?！？:;]+", "", _plain_cell(value)).lower()


def _report_metadata(report_text: str) -> dict[str, str]:
    for raw_line in report_text.splitlines():
        line = raw_line.strip().lstrip(">").strip()
        if "时间基准" not in line or "深度档位" not in line:
            continue
        result: dict[str, str] = {}
        for item in line.split("|"):
            pair = re.match(r"\s*([^：:]+)[：:]\s*(.+?)\s*$", item)
            if pair:
                result[_plain_cell(pair.group(1))] = _plain_cell(pair.group(2))
        return result
    return {}


def _validate_contract(
    contract_text: str,
    report_text: str,
) -> tuple[list[str], dict[str, str], int]:
    issues: list[str] = []
    # The contract template places its primary field table before the first H2.
    header, rows = _first_table(contract_text.split("## 资源预算", 1)[0])
    if not header or len(header) < 3:
        return ["Research contract table was not found or is malformed."], {}, 0

    values: dict[str, str] = {}
    unconfirmed = 0
    for row in rows:
        if len(row) < 3:
            continue
        field = _plain_cell(row[0])
        if field not in CONTRACT_FIELDS:
            continue
        value = _plain_cell(row[1])
        confirmation = _plain_cell(row[2])
        values[field] = value
        if _has_placeholder(row[1]):
            issues.append(f"Research contract field {field} is empty or unresolved.")
        if confirmation not in {"已确认", "未确认"}:
            issues.append(
                f"Research contract field {field} has invalid confirmation status."
            )
        elif confirmation == "未确认":
            unconfirmed += 1

    missing_fields = CONTRACT_FIELDS - values.keys()
    if missing_fields:
        issues.append(
            "Research contract is missing fields: "
            + ", ".join(sorted(missing_fields))
            + "."
        )

    if "对象类型" in values and values["对象类型"].lower() not in SUBJECT_TYPES:
        issues.append("Research contract has an invalid subject type.")
    if "时间基准" in values and not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}", values["时间基准"]
    ):
        issues.append("Research contract has an invalid time baseline.")
    if "深度档位" in values and values["深度档位"].lower() not in DEPTH_LEVELS:
        issues.append("Research contract has an invalid depth level.")

    metadata = _report_metadata(report_text)
    if not metadata:
        issues.append("Report metadata line was not found or is malformed.")
    else:
        comparisons = {
            "用户决策问题": "研究问题",
            "时间基准": "时间基准",
            "深度档位": "深度档位",
        }
        for contract_field, report_field in comparisons.items():
            if contract_field not in values:
                continue
            report_value = metadata.get(report_field, "")
            if not report_value or _normalise(values[contract_field]) != _normalise(
                report_value
            ):
                issues.append(
                    f"Research contract {contract_field} does not match report "
                    f"{report_field}."
                )

    if "研究对象" in values:
        h1 = re.search(r"^#\s+(.+)$", report_text, flags=re.MULTILINE)
        if not h1 or _normalise(values["研究对象"]) not in _normalise(h1.group(1)):
            issues.append("Research subject does not match the report title.")

    return issues, values, unconfirmed


def _appendix_text(report_text: str, section_id: str) -> str:
    match = re.search(
        rf"^###\s+{re.escape(section_id)}\b[^\n]*\n(.*?)(?=^###\s+|^##\s+|\Z)",
        report_text,
        flags=re.MULTILINE | re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def _validate_retrieval_map(
    retrieval_text: str,
    report_text: str,
) -> tuple[list[str], int, int]:
    issues: list[str] = []
    _, source_rows = _extract_appendix_table(report_text, "A1")
    _, claim_rows = _extract_appendix_table(report_text, "A2")
    source_ids = {
        row[0].strip()
        for row in source_rows
        if row and re.fullmatch(r"S\d{2,}", row[0].strip())
    }
    claim_ids = {
        row[0].strip()
        for row in claim_rows
        if row and re.fullmatch(r"C\d{2,}", row[0].strip())
    }
    load_bearing_ids = {
        row[0].strip()
        for row in claim_rows
        if len(row) >= 3 and "load-bearing" in row[2].lower()
    }

    mapped_claims: set[str] = set()
    unresolved_count = 0
    question_count = 0
    group_patterns = (
        ("第一组", "facts"),
        ("第二组", "causes and mechanisms"),
        ("第三组", "counterevidence"),
    )
    for heading, label in group_patterns:
        section = _extract_heading_section(retrieval_text, rf"{heading}[:：]")
        header, rows = _first_table(section)
        if not header:
            issues.append(f"Retrieval-map {label} table was not found or is malformed.")
            continue
        if not rows:
            issues.append(f"Retrieval-map {label} table has no questions.")
            continue

        for row_no, row in enumerate(rows, start=1):
            question_count += 1
            if len(row) < 5:
                issues.append(
                    f"Retrieval-map {label} row {row_no} does not have five fields."
                )
                continue
            question, direction, searched_sources, status, related_claims = row[:5]
            if _has_placeholder(question):
                issues.append(f"Retrieval-map {label} row {row_no} has no question.")
            if _has_placeholder(direction):
                issues.append(
                    f"Retrieval-map {label} row {row_no} has no search direction."
                )

            clean_status = _plain_cell(status)
            if clean_status not in QUESTION_STATUSES:
                issues.append(
                    f"Retrieval-map {label} row {row_no} has invalid status "
                    f"{clean_status or '<empty>'}."
                )
            if clean_status == "未解决":
                unresolved_count += 1

            row_sources = set(re.findall(r"S\d{2,}", searched_sources))
            row_claims = set(re.findall(r"C\d{2,}", related_claims))
            mapped_claims.update(row_claims)
            if clean_status == "已解决" and not row_sources:
                issues.append(
                    f"Resolved retrieval-map {label} row {row_no} has no Source ID."
                )
            if clean_status == "部分" and not (row_sources or row_claims):
                issues.append(
                    f"Partial retrieval-map {label} row {row_no} has no Source/Claim ID."
                )

            dangling_sources = row_sources - source_ids
            if dangling_sources:
                issues.append(
                    f"Retrieval-map {label} row {row_no} references undefined sources: "
                    + ", ".join(sorted(dangling_sources))
                    + "."
                )
            dangling_claims = row_claims - claim_ids
            if dangling_claims:
                issues.append(
                    f"Retrieval-map {label} row {row_no} references undefined Claims: "
                    + ", ".join(sorted(dangling_claims))
                    + "."
                )

    missing_load_bearing = load_bearing_ids - mapped_claims
    if missing_load_bearing:
        issues.append(
            "Load-bearing Claims are not mapped to retrieval questions: "
            + ", ".join(sorted(missing_load_bearing))
            + "."
        )

    if unresolved_count:
        unresolved_section = _extract_heading_section(retrieval_text, "未解决清单")
        if _has_placeholder(unresolved_section):
            issues.append(
                "Retrieval map has unresolved questions but no unresolved-list record."
            )
        report_boundaries = _appendix_text(report_text, "A3")
        if _has_placeholder(report_boundaries):
            issues.append(
                "Retrieval map has unresolved questions but report A3 has no "
                "material-boundary record."
            )

    return issues, question_count, unresolved_count


def validate_project(
    project_dir: Path,
    *,
    contract_name: str = "research-contract.md",
    retrieval_map_name: str = "retrieval-map.md",
    report_name: str = "report.md",
    strict: bool = False,
) -> tuple[list[str], list[str], dict[str, int]]:
    errors: list[str] = []
    warnings: list[str] = []
    stats: dict[str, int] = {}

    paths = {
        "research contract": project_dir / contract_name,
        "retrieval map": project_dir / retrieval_map_name,
        "report": project_dir / report_name,
    }
    missing = [label for label, path in paths.items() if not path.is_file()]
    if missing:
        errors.append("Project is missing required files: " + ", ".join(missing) + ".")
        return errors, warnings, stats

    contract_text = paths["research contract"].read_text(encoding="utf-8")
    retrieval_text = paths["retrieval map"].read_text(encoding="utf-8")
    report_text = paths["report"].read_text(encoding="utf-8")

    project_issues: list[str] = []
    contract_issues, _, unconfirmed = _validate_contract(contract_text, report_text)
    project_issues.extend(contract_issues)
    retrieval_issues, questions, unresolved = _validate_retrieval_map(
        retrieval_text,
        report_text,
    )
    project_issues.extend(retrieval_issues)
    if strict:
        errors.extend(project_issues)
    else:
        warnings.extend(project_issues)

    report_errors, report_warnings, report_stats = validate_markdown(
        report_text,
        base_dir=paths["report"].parent,
        strict=strict,
    )
    errors.extend(f"Report: {message}" for message in report_errors)
    warnings.extend(f"Report: {message}" for message in report_warnings)
    stats.update({f"report_{key}": value for key, value in report_stats.items()})
    stats.update(
        {
            "contract_unconfirmed_fields": unconfirmed,
            "retrieval_questions": questions,
            "retrieval_unresolved": unresolved,
        }
    )
    return errors, warnings, stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a complete 3d-deep-research project directory."
    )
    parser.add_argument("project_dir", help="Directory containing the research project")
    parser.add_argument("--contract", default="research-contract.md")
    parser.add_argument("--retrieval-map", default="retrieval-map.md")
    parser.add_argument("--report", default="report.md")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat project consistency issues and report warnings as failures",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON result")
    return parser.parse_args()


def main() -> None:
    _configure_utf8_console()
    args = parse_args()
    project_dir = Path(args.project_dir).expanduser().resolve()
    if not project_dir.is_dir():
        raise SystemExit(f"Research project directory not found: {project_dir}")

    errors, warnings, stats = validate_project(
        project_dir,
        contract_name=args.contract,
        retrieval_map_name=args.retrieval_map,
        report_name=args.report,
        strict=args.strict,
    )
    passed = not errors and not (args.strict and warnings)
    result = {
        "passed": passed,
        "external_fact_truth": "not-verified",
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
        print("[OK] Project validation passed." if passed else "[FAIL] Project validation failed.")
        print("[INFO] External fact truth was not verified by this script.")
        print("[INFO] " + json.dumps(stats, ensure_ascii=False))

    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
