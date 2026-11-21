#!/usr/bin/env python3
"""Validate machine-checkable parts of a 3d-deep-research report."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from html import unescape
from html.parser import HTMLParser
from math import isfinite
from pathlib import Path
from urllib.parse import unquote

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
    r"\]\(\s*URL\s*\)",
    r"\b(?:href|src)\s*=\s*[\"']URL[\"']",
    r"^\s*(?:#{1,6}\s*)?\[[^\]\n]+\]\s*$",
    r"\|\s*\[[^|\n]+\]\s*(?=\|)",
)
def _configure_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")


def markdown_to_html(md_text: str) -> str:
    try:
        import markdown
    except ModuleNotFoundError as exc:
        raise RuntimeError("Install Python-Markdown: python -m pip install Markdown") from exc

    return markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "sane_lists"],
        output_format="html5",
    )


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
            break
        table_lines.append(line)
    if len(table_lines) < 2:
        return [], [], 0

    header = _split_row(table_lines[0])
    separator = _split_row(table_lines[1])
    if len(header) != len(separator) or not _is_separator(separator):
        return [], [], 0

    rows: list[list[str]] = []
    # A blank line closes the rendered table. Reject rows detached from the ledger.
    malformed = sum(line.lstrip().startswith("|") for line in lines[start + len(table_lines):])
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


def _validate_metadata(md_text: str) -> tuple[date | None, date | None, list[str]]:
    lines = md_text.splitlines()
    first_content = next(
        (index for index, line in enumerate(lines) if line.strip()),
        None,
    )
    if first_content is None:
        return None, None, ["The report metadata line is missing or malformed."]

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
        return None, None, ["The report metadata line is missing or malformed."]

    try:
        cutoff = date.fromisoformat(match.group("cutoff"))
        completed = date.fromisoformat(match.group("completed"))
    except ValueError:
        return None, None, ["The report metadata contains an invalid ISO date."]
    if completed < cutoff:
        return cutoff, completed, ["The report completion date cannot precede the source cutoff date."]
    return cutoff, completed, []


def _is_filled(value: str) -> bool:
    return bool(_plain_text(value).strip("-—[]（）()。.;；:： "))


def _validate_sources(
    rows: list[list[str]],
    legacy_schema: bool = False,
    *,
    cutoff: date | None = None,
    completed: date | None = None,
    base_dir: Path | None = None,
) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    source_ids: set[str] = set()
    location_pattern = re.compile(
        r"https?://[^\s)<>]+|(?:^|[\s(])(?P<file>[^\s)]+\."
        r"(?:pdf|html?|md|txt|csv|xlsx?|docx?))(?=$|[\s)#？?；;。])",
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
        link = re.search(r"\]\(\s*(?:<([^>\n]+)>|([^\s)]+))", details)
        if link:
            location = link.group(1) or link.group(2)
        else:
            match = location_pattern.search(f"{details} {limits}")
            location = (match.group("file") or match.group(0)) if match else ""
        online = bool(re.match(r"https?://|//", location, flags=re.I))
        try:
            path = local_path(unescape(location), base_dir or Path.cwd()) if location and not online else None
        except ValueError:
            path = None
        if not online and path is None:
            errors.append(f"Source {source_id} has no URL or file location.")
        elif path is not None and base_dir is not None and not path.is_file():
            errors.append(f"Source {source_id} local evidence file not found: {location}.")
        if legacy_schema:
            dates = re.findall(r"\b\d{4}-\d{2}-\d{2}\b", details)
            if not dates:
                errors.append(f"Source {source_id} has no ISO date.")
            for value in dates:
                try:
                    date.fromisoformat(value)
                except ValueError:
                    errors.append(f"Source {source_id} has an invalid ISO date: {value}.")
        else:
            fields = _labeled_fields(details)
            if not _is_filled(fields.get("发布者", "")):
                errors.append(f"Source {source_id} is missing 发布者.")
            if online and fields.get("访问") == "不适用":
                errors.append(f"Online source {source_id} requires an actual access date.")
            dated = {}
            for label, unknown in (("发布", "未知"), ("访问", "不适用")):
                value = fields.get(label, "")
                if value == unknown:
                    continue
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                    errors.append(f"Source {source_id} {label} must be an ISO date or {unknown}.")
                    continue
                try:
                    dated[label] = date.fromisoformat(value)
                except ValueError:
                    errors.append(f"Source {source_id} has an invalid ISO date: {value}.")
            published = dated.get("发布")
            accessed = dated.get("访问")
            if published and cutoff and published > cutoff:
                errors.append(f"Source {source_id} was published after the source cutoff.")
            if accessed and completed and accessed > completed:
                errors.append(f"Source {source_id} was accessed after report completion.")
            if published and accessed and accessed < published:
                errors.append(f"Source {source_id} was accessed before publication.")
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
) -> tuple[list[str], set[str], set[str]]:
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
        claim_sources = set(re.findall(r"S\d{2,}", evidence + " " + claim_type + " " + row[5]))
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

    return errors, used_sources, claim_ids


class _SVGAttributes(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.items: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "svg":
            self.items.append(dict(attrs))


class _RenderedReport(MediaReferences):
    def __init__(self) -> None:
        super().__init__()
        self.figure_depth = 0
        self.outside = False
        self.anchors: set[str] = set()
        self.fragment_links: set[str] = set()
        self.mislinked_citations: set[str] = set()
        self.link: tuple[str, list[str]] | None = None
        self.heading: list[str] | None = None
        self.in_appendix = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        anchor = attributes.get("id") or (attributes.get("name") if tag == "a" else None)
        if anchor:
            self.anchors.add(anchor)
        href = attributes.get("href") or ""
        if tag == "a" and href:
            if href.startswith("#") and len(href) > 1:
                self.fragment_links.add(unquote(href[1:]))
            if not self.in_appendix:
                self.link = (href, [])
        if tag == "h2":
            self.heading = []
        if tag == "figure":
            self.figure_depth += 1
        if tag in {"img", "image", "svg"} and self.figure_depth == 0:
            self.outside = True
        super().handle_starttag(tag, attrs)

    def handle_data(self, data: str) -> None:
        if self.link is not None:
            self.link[1].append(data)
        if self.heading is not None:
            self.heading.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.link is not None:
            href, parts = self.link
            match = re.fullmatch(r"\[(S\d{2,})\]|(S\d{2,})", "".join(parts).strip())
            if match:
                source_id = match.group(1) or match.group(2)
                if href != f"#src-{source_id}":
                    self.mislinked_citations.add(source_id)
            self.link = None
        if tag == "h2" and self.heading is not None:
            if "".join(self.heading).lstrip().startswith("附录"):
                self.in_appendix = True
            self.heading = None
        if tag == "figure":
            self.figure_depth = max(0, self.figure_depth - 1)


def _internal_link_errors(markup: _RenderedReport) -> list[str]:
    return [
        f"Internal link has no rendered target: #{target}"
        for target in sorted(markup.fragment_links - markup.anchors)
    ]


def validate_html_links(html_text: str) -> list[str]:
    markup = _RenderedReport()
    markup.feed(html_text)
    markup.close()
    return _internal_link_errors(markup)


def _validate_rendered_markup(
    md_text: str, base_dir: Path | None, rendered_body: str | None, *, check_citations: bool
) -> list[str]:
    markup_hint = r'<(?:figure|img|svg|image|a)\b|!\[|\]\(#|\]:\s*#'
    citation_hint = r'\[S\d{2,}\]\s*(?:\(|\[|:)'
    if rendered_body is None and not re.search(f"{markup_hint}|{citation_hint}", md_text, re.I):
        return []

    if rendered_body is None:
        try:
            rendered_body = markdown_to_html(md_text)
        except RuntimeError as exc:
            return [f"Cannot validate rendered Markdown: {exc}"]

    markup = _RenderedReport()
    markup.feed(rendered_body)
    markup.close()
    errors = _internal_link_errors(markup)
    if check_citations and markup.mislinked_citations:
        ids = ", ".join(sorted(markup.mislinked_citations))
        errors.append(f"Use plain [Sxx] citations linked to the A1 ledger, not custom URLs: {ids}.")
    if markup.outside:
        errors.append("An image or SVG appears outside a <figure> element.")

    figures = re.finditer(r"<figure\b.*?</figure>", rendered_body, flags=re.I | re.S)

    for index, match in enumerate(figures, start=1):
        figure = match.group(0)
        if not re.search(r"<figcaption\b[^>]*>\s*.+?</figcaption>", figure, re.I | re.S):
            errors.append(f"Figure {index} has no non-empty figcaption.")
        if not re.search(r"\[S\d{2,}\]", figure):
            errors.append(f"Figure {index} has no Source ID.")
        parser = _SVGAttributes()
        parser.feed(figure)
        image = MediaReferences()
        image.feed(figure)
        if not parser.items and not image.refs:
            errors.append(f"Figure {index} has no rendered image or SVG.")
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

    if base_dir is not None:
        for ref in sorted(set(markup.refs)):
            candidate = local_path(ref, base_dir)
            if candidate is not None and not candidate.is_file():
                errors.append(f"Image file not found: {ref}")

    return errors


def validate_markdown(
    md_text: str,
    base_dir: Path | None = None,
    legacy_schema: bool = False,
    *,
    require_xyz: bool = False,
    rendered_body: str | None = None,
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    md_text = re.sub(r"<!--.*?-->", lambda match: "\n" * match[0].count("\n"), md_text, flags=re.S)

    first_content = next((line for line in md_text.splitlines() if line.strip()), "")
    h1 = re.findall(r"^#\s+.+$", md_text, flags=re.MULTILINE)
    if len(h1) != 1 or first_content != h1[0]:
        errors.append("The report must start with exactly one H1 title.")
    cutoff, completed, metadata_errors = _validate_metadata(md_text)
    errors.extend(metadata_errors)
    if legacy_schema:
        warnings.append("Legacy schema mode: evidence contract 3 is not enforced.")
    elif not re.search(r"^>\s*证据契约：3\s*$", md_text, re.M):
        errors.append("New reports require > 证据契约：3; use --legacy-schema only for historical reports.")

    placeholders: set[tuple[int, str]] = set()
    for pattern in PLACEHOLDER_PATTERNS:
        for match in re.finditer(pattern, md_text, flags=re.IGNORECASE | re.MULTILINE):
            line = md_text.count("\n", 0, match.start()) + 1
            placeholders.add((line, match.group(0).strip()[:100]))
    for line, value in sorted(placeholders):
        errors.append(f"Unresolved template placeholder at line {line}: {value!r}.")
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

    source_errors, source_ids = _validate_sources(
        a1_rows, legacy_schema, cutoff=cutoff, completed=completed, base_dir=base_dir
    )
    claim_errors, claim_source_ids, claim_ids = _validate_claims(a2_rows, source_ids, a2_header, legacy_schema)
    errors.extend(source_errors)
    errors.extend(claim_errors)
    if not legacy_schema:
        for row in a1_rows:
            if len(row) == 4:
                undefined_claims = set(re.findall(r"(?<![A-Za-z0-9])C\d{2,}(?![A-Za-z0-9])", row[2])) - claim_ids
                if undefined_claims:
                    ids = ", ".join(sorted(undefined_claims))
                    errors.append(f"Source {row[0]} references undefined Claim IDs: {ids}.")

    # Fenced examples do not count as chapter content or source citations.
    analysis = re.sub(r"^ {0,3}(\x60{3,}|~{3,})[^\n]*\n.*?^ {0,3}\1[ \t]*$",
                      "", body_text, flags=re.M | re.S)
    if require_xyz or legacy_schema:
        chapters = re.findall(r"^##[ \t]+([一二三四五六七八九十]+)、[ \t]*\S", analysis, flags=re.M)
        if chapters not in (REQUIRED_MAIN_SECTIONS, [*REQUIRED_MAIN_SECTIONS, "五"]):
            errors.append(
                "Expected the conclusion and X, Y, Z chapters numbered 一 through 四 "
                f"in template order, with 五 optional. Found: {chapters or 'none'}."
            )
    body_source_ids = set(re.findall(r"\[(S\d{2,})\]", analysis))
    all_sources = set(re.findall(r"\[(S\d{2,})\]", md_text))
    missing_body_sources = body_source_ids - source_ids
    if missing_body_sources:
        errors.append("Report body references undefined Source IDs: " + ", ".join(sorted(missing_body_sources)) + ".")
    missing_other_sources = all_sources - source_ids - body_source_ids
    if missing_other_sources:
        errors.append("Report references undefined Source IDs: " + ", ".join(sorted(missing_other_sources)))
    sections = re.findall(r"^(##[ \t]+[^\n]+)\n(.*?)(?=^##[ \t]+|\Z)", analysis, re.M | re.S)
    if not sections:
        errors.append("The report body must contain an analysis section.")
    for heading, content in sections:
        content = re.sub(r"^#{3,6}[ \t]+.*$", "", content, flags=re.M)
        content = re.sub(r"\[S\d{2,}\]", "", content)
        if not _is_filled(content):
            errors.append(f"Empty analysis section: {heading}")
    if not body_source_ids:
        errors.append("The report body has no [Sxx] citations.")
    unused_sources = source_ids - body_source_ids - claim_source_ids
    if unused_sources:
        warnings.append(
            "Source ledger entries are unused: " + ", ".join(sorted(unused_sources)) + "."
        )

    a3_text = _section_text(appendix_text, "A3")
    if a3_text is None or not _is_filled(a3_text):
        errors.append("A3 must describe evidence boundaries.")

    errors.extend(_validate_rendered_markup(md_text, base_dir, rendered_body, check_citations=not legacy_schema))
    return errors, warnings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a 3d-deep-research report.")
    parser.add_argument("markdown", help="Markdown report path")
    parser.add_argument("--html", help="Optional rendered HTML path")
    parser.add_argument("--legacy-schema", action="store_true", help="Read historical evidence ledgers; does not certify current contract")
    parser.add_argument("--require-xyz", action="store_true", help="Require the three analysis chapters in template order")
    return parser.parse_args()


def main() -> None:
    _configure_utf8_console()
    args = parse_args()
    markdown_path = Path(args.markdown).expanduser().resolve()
    if not markdown_path.is_file():
        raise SystemExit(f"Markdown report not found: {markdown_path}")

    md_text = markdown_path.read_text(encoding="utf-8")
    errors, warnings = validate_markdown(md_text, base_dir=markdown_path.parent,
                                         legacy_schema=args.legacy_schema, require_xyz=args.require_xyz)
    if args.html:
        artifact = Path(args.html).expanduser().resolve()
        try:
            errors.extend(validate_html_links(artifact.read_text(encoding="utf-8")))
        except (OSError, UnicodeError) as exc:
            errors.append(f"Cannot read HTML artifact: {exc}")
        if args.legacy_schema:
            warnings.append("Legacy artifact identity is not verified; render again for current-contract delivery.")
        else:
            identity_errors, identity_warnings = validate_manifest(markdown_path, artifact)
            errors.extend(identity_errors)
            warnings.extend(identity_warnings)
    for error in errors:
        print(f"[ERROR] {error}")
    for warning in warnings:
        print(f"[WARN] {warning}")
    passed = not errors
    print("[OK] Structure and artifact consistency checks passed; content and visual review remain separate." if passed else "[FAIL] Structure or artifact consistency checks failed.")
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
