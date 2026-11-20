from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))
SPEC = importlib.util.spec_from_file_location("render_report", SCRIPT_DIR / "render_report.py")
assert SPEC and SPEC.loader
render_report = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(render_report)


class RenderReportTests(unittest.TestCase):
    def test_build_html_uses_report_title_and_metadata(self) -> None:
        markdown = """# 自定义报告

> 研究问题：测试 | 资料截止：2026-08-28 | 完成日期：2026-08-29

正文。[S01]
"""
        with mock.patch.object(
            render_report,
            "markdown_to_html",
            return_value=("<p>正文。[S01]</p>", "test-converter"),
        ) as converter:
            document, title, name = render_report.build_html(markdown)

        body_md = converter.call_args.args[0]
        self.assertEqual(title, "自定义报告")
        self.assertEqual(name, "test-converter")
        self.assertIn("研究问题：测试", document)
        self.assertNotIn("研究问题：测试", body_md)
        self.assertNotIn("立体分析法深度研究报告", document)
        self.assertNotIn("作者：jeffy", document)

    def test_relative_media_resolves_against_markdown_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            value = """<img src="images/chart.png">
<svg><image href='assets/map.svg'></image></svg>
<img src="https://example.com/remote.png"><img src="data:image/png;base64,abc">
<svg><image href="#symbol"></image></svg>"""

            output = render_report._resolve_local_media(value, base)

        self.assertIn((base / "images/chart.png").resolve().as_uri(), output)
        self.assertIn((base / "assets/map.svg").resolve().as_uri(), output)
        self.assertIn('src="https://example.com/remote.png"', output)
        self.assertIn('src="data:image/png;base64,abc"', output)
        self.assertIn('href="#symbol"', output)

    def test_pdf_fonts_are_explicitly_embedded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            font_dir = Path(directory)
            (font_dir / render_report.REPORT_FONT).write_bytes(b"font")

            css = render_report._font_face_css(font_dir)

        self.assertIn("NotoSerifSC-VF.ttf", css)
        self.assertIn('font-family: "Noto Serif SC"', css)
        self.assertIn("font-weight: 200 900", css)

    def test_missing_pdf_font_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "Missing required Noto Serif SC font"):
                render_report._font_face_css(Path(directory))

    def test_graphite_reading_layout_preserves_headings_and_links_without_javascript(self) -> None:
        fragment = (
            '<p>前言</p><h2>一、结论</h2><h3>2026 年的 <em>变化</em></h3>'
            '<h4 id="details">细节</h4><blockquote><h3>引用内标题</h3></blockquote>'
            '<h2>二、路径</h2><h3>后来</h3><table><tbody></tbody></table>'
        )
        with mock.patch.object(render_report, "markdown_to_html", return_value=(fragment, "test")):
            document, _, _ = render_report.build_html("# 测试报告")

        self.assertIn('class="print-button"', document)
        self.assertEqual(document.count("<button "), 1)
        self.assertIn('<p>前言</p>', document)
        self.assertIn('<span class="heading-number">1.1</span>2026 年的 <em>变化</em>', document)
        self.assertIn('<span class="heading-number">1.1.1</span>细节', document)
        self.assertIn('href="#details" data-depth="3"', document)
        self.assertIn('<blockquote><h3>引用内标题</h3></blockquote>', document)
        self.assertIn('<span class="heading-number">2.1</span>后来', document)
        self.assertIn('</table></div>', document)

    def test_reference_image_enters_manifest_and_invalidates_cache(self) -> None:
        from report_artifacts import write_manifest, validate_manifest
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output, chart = root / "report.md", root / "output.html", root / "plot.png"
            text = "# Test\n\n![Plot][plot]\n\n[plot]: plot.png\n"
            source.write_text(text, encoding="utf-8")
            output.write_text("artifact", encoding="utf-8")
            chart.write_bytes(b"image version one")
            dependencies, remote = render_report.collect_dependencies(text, root, None)
            self.assertIn(chart, dependencies)
            write_manifest(source, output, dependencies, remote)
            self.assertEqual(validate_manifest(source, output)[0], [])
            chart.write_bytes(b"image version two")
            self.assertTrue(validate_manifest(source, output)[0])


if __name__ == "__main__":
    unittest.main()
