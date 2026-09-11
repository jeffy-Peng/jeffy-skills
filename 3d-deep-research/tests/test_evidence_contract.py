from __future__ import annotations

import base64
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from report_artifacts import manifest_path, sha256, validate_manifest, write_manifest
from render_report import _resolve_local_media
from test_validate_report import VALID_REPORT, validate_report


class EvidenceContractTests(unittest.TestCase):
    def check_rejected(self, report: str, expected: str) -> None:
        errors, _ = validate_report.validate_markdown(report)
        self.assertTrue(any(expected in error for error in errors), errors)

    def test_confidence_does_not_substitute_for_gap(self):
        row = next(line for line in VALID_REPORT.splitlines() if line.startswith("| C01"))
        cells = row.split("|")
        cells[-2] = " high "
        self.check_rejected(VALID_REPORT.replace(row, "|".join(cells)), "缺口")

    def test_explicit_no_known_gap_is_valid(self):
        report = VALID_REPORT.replace("缺口：缺少原位储量测量", "缺口：无重大已知缺口")
        self.assertEqual(validate_report.validate_markdown(report)[0], [])

    def test_confidence_and_type_are_single_values(self):
        self.check_rejected(VALID_REPORT.replace("置信度：high", "置信度：high / low"), "confidence level")
        self.check_rejected(VALID_REPORT.replace("| fact |", "| fact / causal |"), "exactly one type")

    def test_english_independence_can_touch_chinese(self):
        report = VALID_REPORT.replace("independent", "来源为shared-origin且非独立复验")
        self.assertEqual(validate_report.validate_markdown(report)[0], [])
        self.assertFalse(validate_report._contains_enum("non-independent", {"independent"}))

    def test_invalid_source_date_is_rejected(self):
        self.check_rejected(VALID_REPORT.replace("2026-08-01", "2026-99-99"), "invalid ISO date")

    def test_missing_publisher_is_rejected(self):
        self.check_rejected(VALID_REPORT.replace("发布者：NASA；", ""), "发布者")

    def test_unknown_publication_is_explicitly_allowed(self):
        self.assertEqual(validate_report.validate_markdown(VALID_REPORT.replace("发布：2026-08-01", "发布：未知"))[0], [])

    def test_offline_unknown_date_does_not_need_invented_date(self):
        report = VALID_REPORT.replace("发布：2026-08-01；访问：2026-08-29", "发布：未知；访问：不适用")
        self.assertEqual(validate_report.validate_markdown(report)[0], [])

    def test_missing_contract_requires_explicit_legacy_mode(self):
        report = VALID_REPORT.replace("> 证据契约：3\n", "")
        self.check_rejected(report, "证据契约")
        errors, warnings = validate_report.validate_markdown(report, legacy_schema=True)
        self.assertEqual(errors, [])
        self.assertTrue(any("Legacy" in warning for warning in warnings))

    def test_process_and_attribution_are_independent(self):
        report = VALID_REPORT.replace("| fact |", "| mechanism；过程：部分连接已观察；归因：结果贡献未知 |")
        self.assertEqual(validate_report.validate_markdown(report)[0], [])
        self.check_rejected(report.replace("；归因：结果贡献未知", ""), "归因")

    def test_undefined_appendix_reference_is_rejected(self):
        self.check_rejected(VALID_REPORT + "\n附加限制：[S99]\n", "undefined Source IDs")

    def test_empty_chapter_is_rejected(self):
        self.check_rejected(VALID_REPORT.replace("早期观测推动了后续直接测量。[S01]", ""), "Empty analysis section")

    def test_question_led_sections_need_no_chronology(self):
        appendix = VALID_REPORT[VALID_REPORT.index("## 附录"):]
        metadata = VALID_REPORT[:VALID_REPORT.index("## 一")]
        report = metadata + "## 哪种观测更可靠\n\n比较口径与测量。[S01]\n\n## 误差如何产生\n\n误差边界。[S01]\n\n" + appendix
        self.assertEqual(validate_report.validate_markdown(report)[0], [])

    def test_missing_svg_image_is_rejected(self):
        figure = '<figure><svg viewBox="0 0 10 10" role="img" aria-label="test"><image href="absent.png"/></svg><figcaption>图 1 [S01]</figcaption></figure>'
        with tempfile.TemporaryDirectory() as directory:
            errors, _ = validate_report.validate_markdown(VALID_REPORT + figure, Path(directory))
        self.assertTrue(any("Image file not found" in error for error in errors), errors)

    def test_substring_attributes_do_not_satisfy_svg_contract(self):
        report = VALID_REPORT + '<figure><svg data-viewbox="0 0 10 10" role="presentation" aria-label=""></svg><figcaption>图 1 [S01]</figcaption></figure>'
        for expected in ("viewbox", "role=", "aria-label="):
            self.check_rejected(report, expected)

    def test_portable_media_preserves_local_image_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = b"test-image-bytes"
            (root / "chart.png").write_bytes(data)
            output = _resolve_local_media('<img src="chart.png">', root, embed=True)
            self.assertNotIn("file:///", output)
            self.assertIn(base64.b64encode(data).decode(), output)
            (root / "chart.png").unlink()
            self.assertIn("data:image/png;base64,", output)

    def test_manifest_binds_source_output_and_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output, resource = [root / name for name in ("report.md", "output.pdf", "figure.svg")]
            source.write_text("version A")
            output.write_bytes(b"artifact A")
            resource.write_text("figure A")
            write_manifest(source, output, [resource], [])
            self.assertEqual(validate_manifest(source, output), ([], []))
            source.write_text("version B")
            self.assertIn("different Markdown", " ".join(validate_manifest(source, output)[0]))
            source.write_text("version A")
            output.write_bytes(b"artifact B")
            self.assertIn("does not match", " ".join(validate_manifest(source, output)[0]))
            output.write_bytes(b"artifact A")
            resource.write_text("figure B")
            self.assertIn("dependency", " ".join(validate_manifest(source, output)[0]))

    def test_missing_manifest_and_remote_resource_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root / "report.md", root / "output.html"
            source.write_text("source")
            output.write_text("output")
            self.assertTrue(validate_manifest(source, output)[0])
            write_manifest(source, output, [], ["https://example.com/image.png"])
            errors, warnings = validate_manifest(source, output)
            self.assertEqual(errors, [])
            self.assertTrue(warnings)
            manifest_path(output).write_text("{}")
            self.assertTrue(validate_manifest(source, output)[0])

    def test_edit_during_render_cannot_certify_wrong_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root / "report.md", root / "output.pdf"
            source.write_text("input A")
            expected = {source: sha256(source)}
            source.write_text("input B")
            output.write_bytes(b"render of input A")
            with self.assertRaisesRegex(ValueError, "changed during rendering"):
                write_manifest(source, output, [], [], expected)

    def test_pdf_font_names_alone_do_not_prove_embedding(self):
        try:
            from pypdf import PdfWriter
            from pypdf.generic import DictionaryObject, NameObject
        except ImportError:
            self.skipTest("pypdf is needed for the PDF resource regression")
        with tempfile.TemporaryDirectory() as directory:
            writer = PdfWriter()
            page = writer.add_blank_page(width=595.28, height=841.89)
            fonts = DictionaryObject()
            for index, name in enumerate(validate_report.REQUIRED_PDF_FONTS):
                fonts[NameObject(f"/F{index}")] = DictionaryObject({
                    NameObject("/Type"): NameObject("/Font"),
                    NameObject("/Subtype"): NameObject("/Type1"),
                    NameObject("/BaseFont"): NameObject("/" + name),
                })
            page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): fonts})
            path = Path(directory) / "names-only.pdf"
            writer.write(path)
            self.assertEqual(validate_report._read_pdf(path)[3], set())


if __name__ == "__main__":
    unittest.main()
