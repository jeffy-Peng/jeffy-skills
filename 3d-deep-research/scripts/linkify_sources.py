#!/usr/bin/env python3
"""Post-process a 3d-deep-research report: turn [Sxx] citations into source links.

For HTML: each in-text [S04] becomes a clickable link that opens the
original source URL (taken from the matching source-ledger row) in a new
tab. If a ledger row has no URL, the citation falls back to an in-page
anchor jump to the ledger row. Ledger rows also get id="src-S04".
For Markdown/PDF-via-HTML: run after render_report.py generated the HTML,
then re-render PDF from the linked HTML with a headless browser.

Usage:
  python linkify_sources.py report.html          # linkify existing HTML in place
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def linkify_html(html: str) -> tuple[str, int, int]:
    # 1) Ledger rows: | S04 | ... -> add id to the row and a backlink target
    #    Works on rendered HTML table rows whose first cell is Sxx.
    n_rows = 0

    def row_repl(m: re.Match) -> str:
        nonlocal n_rows
        sid = m.group(1)
        n_rows += 1
        return f'<tr id="src-{sid}">{m.group(2)}'

    html, _ = re.subn(
        r"<tr>\s*(<td>\s*(S\d{2})\s*</td>.*?</tr>)",
        lambda m: f'<tr id="src-{m.group(2)}">{m.group(1)}',
        html,
        flags=re.DOTALL,
    )
    n_rows = len(re.findall(r'<tr id="src-S\d{2}">', html))

    # 1b) Map each ledger source id to its original URL (first http(s) link in the row).
    url_map: dict[str, str] = {}
    for m in re.finditer(
        r'<tr id="src-(S\d{2})">(.*?)</tr>', html, flags=re.DOTALL
    ):
        sid, row_html = m.group(1), m.group(2)
        href = re.search(r'href="(https?://[^"]+)"', row_html)
        bare = re.search(r'(?<!["=])(https?://[^\s<)"\]]+)', row_html)
        url = (href or bare).group(1).rstrip(".,;。") if (href or bare) else ""
        if url:
            url_map[sid] = url

    # 2) In-text [S04] / [S04][S19] -> links to the source URL (new tab);
    #    fall back to an in-page anchor when the ledger row has no URL.
    def cite_repl(m: re.Match) -> str:
        sid = m.group(1)
        url = url_map.get(sid)
        if url:
            return (
                f'<a href="{url}" target="_blank" rel="noopener noreferrer" '
                f'class="src-link">[{sid}]</a>'
            )
        return f'<a href="#src-{sid}" class="src-link">[{sid}]</a>'

    # Protect ledger table region from being linkified twice (ids already there):
    # linkify everything, then fix any links inside the id attribute (none) — simpler:
    # avoid linking inside the source-ledger <table> by splitting on appendix header is complex;
    # instead, don't touch [Sxx] occurrences that are inside <td> of a row with id src-
    # Simplest robust approach: linkify only [Sxx] NOT preceded by 'id="src-'.
    pattern = r"(?<![\w\"=-])\[ (S\d{2}) \]|\[(S\d{2})\]"

    def repl(m: re.Match) -> str:
        sid = m.group(1) or m.group(2)
        return f'<a href="#src-{sid}" class="src-link">[{sid}]</a>'

    # Split HTML into segments outside <...> tags to avoid touching attributes
    parts = re.split(r"(<[^>]+>)", html)
    n_links = 0
    out = []
    in_ledger_row = False
    for seg in parts:
        if seg.startswith("<"):
            if seg.startswith('<tr id="src-'):
                in_ledger_row = True
            elif seg.startswith("<tr"):
                in_ledger_row = False
            out.append(seg)
        else:
            if in_ledger_row:
                out.append(seg)
            else:
                new_seg, k = re.subn(r"\[(S\d{2})\]", lambda m: cite_repl(m), seg)
                n_links += k
                out.append(new_seg)
    html = "".join(out)

    # 3) Add small CSS for the links (idempotent: skip if already injected)
    css = "<style>a.src-link{color:#c00000;text-decoration:none;}a.src-link:hover{text-decoration:underline;}tr[id^='src-']{scroll-margin-top:80px;}</style>"
    if "a.src-link" not in html:
        html = html.replace("</head>", css + "\n</head>", 1)
    return html, n_links, n_rows


def main() -> None:
    path = Path(sys.argv[1])
    html = path.read_text(encoding="utf-8")
    html, n_links, n_rows = linkify_html(html)
    path.write_text(html, encoding="utf-8")
    print(f"[OK] linkified {n_links} citations; {n_rows} ledger anchors in {path.name}")


if __name__ == "__main__":
    main()
