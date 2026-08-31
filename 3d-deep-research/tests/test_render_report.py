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
            for filename in render_report.FONT_FILES.values():
                (font_dir / filename).write_bytes(b"font")

            css = render_report._font_face_css(font_dir)

        self.assertIn("NotoSansCJKsc-Regular.otf", css)
        self.assertIn("NotoSansCJKsc-Bold.otf", css)
        self.assertIn("font-weight: 400", css)
        self.assertIn("font-weight: 700", css)

    def test_missing_pdf_font_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "Missing required Noto CJK font"):
                render_report._font_face_css(Path(directory))


if __name__ == "__main__":
    unittest.main()
