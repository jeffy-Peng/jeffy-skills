from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))
import build_report
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

    def test_reference_image_enters_manifest_and_detects_changed_image(self) -> None:
        from report_artifacts import write_manifest, validate_manifest
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output, chart = root / "report.md", root / "output.html", root / "plot.png"
            text = "# Test\n\n![Plot][plot]\n\n[plot]: plot.png\n"
            source.write_text(text, encoding="utf-8")
            output.write_text("artifact", encoding="utf-8")
            chart.write_bytes(b"image version one")
            dependencies, remote = build_report.collect_dependencies(markdown_to_html(text), root)
            self.assertIn(chart, dependencies)
            write_manifest(source, output, dependencies, remote)
            self.assertEqual(validate_manifest(source, output)[0], [])
            chart.write_bytes(b"image version two")
            self.assertTrue(validate_manifest(source, output)[0])


if __name__ == "__main__":
    unittest.main()
