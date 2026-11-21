from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))
import build_report
from build_report import linkify_html
from validate_report import markdown_to_html


class RenderReportTests(unittest.TestCase):
    def test_build_html_uses_report_title_and_metadata(self) -> None:
        markdown = """# 自定义报告

> 研究问题：测试 | 资料截止：2026-08-28 | 完成日期：2026-08-29

正文。[S01]
"""
        title, metadata, body_md = build_report._split_report(markdown)
        document = build_report.build_html(title, metadata, markdown_to_html(body_md))

        self.assertEqual(title, "自定义报告")
        self.assertIn("研究问题：测试", document)
        self.assertNotIn("研究问题：测试", body_md)
        self.assertNotIn("立体分析法深度研究报告", document)
        self.assertNotIn("作者：jeffy", document)

    def test_graphite_reading_layout_preserves_headings_and_links_without_javascript(self) -> None:
        fragment = (
            '<p>前言</p><h2>一、结论</h2><h3>2026 年的 <em>变化</em></h3>'
            '<h4 id="details">细节</h4><blockquote><h3>引用内标题</h3></blockquote>'
            '<h2>二、路径</h2><h3>后来</h3><table><tbody></tbody></table>'
        )
        document = build_report.build_html("测试报告", "", fragment)

        self.assertIn('class="print-button"', document)
        self.assertEqual(document.count("<button "), 1)
        self.assertIn('<p>前言</p>', document)
        self.assertIn('<span class="heading-number">1.1</span>2026 年的 <em>变化</em>', document)
        self.assertIn('<span class="heading-number">1.1.1</span>细节', document)
        self.assertIn('href="#details" data-depth="3"', document)
        self.assertIn('<blockquote><h3>引用内标题</h3></blockquote>', document)
        self.assertIn('<span class="heading-number">2.1</span>后来', document)
        self.assertIn('</table></div>', document)

    def test_reference_image_enters_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            chart = root / "plot.png"
            text = "![Plot][plot]\n\n[plot]: plot.png\n"
            dependencies, _ = build_report.collect_dependencies(markdown_to_html(text), root)
            self.assertIn(chart, dependencies)


class LinkifySourcesTests(unittest.TestCase):
    def test_citations_open_the_ledger_and_preserve_its_original_url(self) -> None:
        value = """<p>结论 [S01]</p>
<table><tr><td>S01</td><td><a href="https://example.com/source">来源</a></td></tr></table>"""

        output, links, rows = linkify_html(value)

        self.assertIn('id="src-S01"', output)
        self.assertIn('<a href="#src-S01" class="src-link">[S01]</a>', output)
        self.assertIn('href="https://example.com/source"', output)
        self.assertEqual(links, 1)
        self.assertEqual(rows, 1)

    def test_protected_contexts_and_ledger_are_not_relinked(self) -> None:
        value = """<p>[S01]</p><a href="#existing">[S01]</a><code>[S01]</code>
<pre>[S01]</pre><table><tr><td>S01</td><td>[S01]</td></tr></table>"""

        output, links, _ = linkify_html(value)

        self.assertEqual(links, 1)
        self.assertIn('<a href="#existing">[S01]</a>', output)
        self.assertIn('<code>[S01]</code>', output)
        self.assertIn('<pre>[S01]</pre>', output)

    def test_missing_source_url_uses_ledger_anchor(self) -> None:
        value = "<p>结论 [S01]</p><table><tr><td>S01</td><td>离线材料</td></tr></table>"

        output, links, rows = linkify_html(value)

        self.assertIn('href="#src-S01"', output)
        self.assertEqual((links, rows), (1, 1))

    def test_second_pass_is_idempotent(self) -> None:
        value = "<p>结论 [S01]</p><table><tr><td>S01</td><td>离线材料</td></tr></table>"
        first, _, _ = linkify_html(value)

        second, links, rows = linkify_html(first)

        self.assertEqual(second, first)
        self.assertEqual(links, 0)
        self.assertEqual(rows, 1)


if __name__ == "__main__":
    unittest.main()
