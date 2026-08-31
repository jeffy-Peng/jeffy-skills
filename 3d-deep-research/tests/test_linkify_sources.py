from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "linkify_sources.py"
SPEC = importlib.util.spec_from_file_location("linkify_sources", SCRIPT)
assert SPEC and SPEC.loader
linkify_sources = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(linkify_sources)


class LinkifySourcesTests(unittest.TestCase):
    def test_ledger_url_links_citations_and_adds_anchor(self) -> None:
        value = """<p>结论 [S01]</p>
<table><tr><td>S01</td><td><a href="https://example.com/source">来源</a></td></tr></table>"""

        output, links, rows = linkify_sources.linkify_html(value)

        self.assertIn('id="src-S01"', output)
        self.assertIn('href="https://example.com/source"', output)
        self.assertEqual(links, 1)
        self.assertEqual(rows, 1)

    def test_protected_contexts_and_ledger_are_not_relinked(self) -> None:
        value = """<p>[S01]</p><a href="#existing">[S01]</a><code>[S01]</code>
<pre>[S01]</pre><table><tr><td>S01</td><td>[S01]</td></tr></table>"""

        output, links, _ = linkify_sources.linkify_html(value)

        self.assertEqual(links, 1)
        self.assertIn('<a href="#existing">[S01]</a>', output)
        self.assertIn('<code>[S01]</code>', output)
        self.assertIn('<pre>[S01]</pre>', output)

    def test_missing_source_url_uses_ledger_anchor(self) -> None:
        value = "<p>结论 [S01]</p><table><tr><td>S01</td><td>离线材料</td></tr></table>"

        output, links, rows = linkify_sources.linkify_html(value)

        self.assertIn('href="#src-S01"', output)
        self.assertEqual((links, rows), (1, 1))

    def test_second_pass_is_idempotent(self) -> None:
        value = "<p>结论 [S01]</p><table><tr><td>S01</td><td>离线材料</td></tr></table>"
        first, _, _ = linkify_sources.linkify_html(value)

        second, links, rows = linkify_sources.linkify_html(first)

        self.assertEqual(second, first)
        self.assertEqual(links, 0)
        self.assertEqual(rows, 1)


if __name__ == "__main__":
    unittest.main()
