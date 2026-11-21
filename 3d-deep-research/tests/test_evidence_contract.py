from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from report_artifacts import manifest_path, validate_manifest, write_manifest
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

    def test_offline_unknown_date_requires_an_available_file(self):
        report = VALID_REPORT.replace("https://example.com/moon", "<record 01.pdf>")
        report = report.replace("发布：2026-08-01；访问：2026-08-29", "发布：未知；访问：不适用")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            errors, _ = validate_report.validate_markdown(report, root)
            self.assertTrue(any("local evidence file not found" in error for error in errors), errors)
            (root / "record 01.pdf").touch()
            self.assertEqual(validate_report.validate_markdown(report, root)[0], [])

    def test_online_source_requires_access_date(self):
        report = VALID_REPORT.replace("访问：2026-08-29", "访问：不适用")
        self.check_rejected(report, "requires an actual access date")

    def test_A1_cannot_reference_a_missing_A2_claim(self):
        report = VALID_REPORT.replace("支持 C01；原始材料", "支持 C99；原始材料")
        self.check_rejected(report, "undefined Claim IDs: C99")

    def test_body_citations_cannot_point_elsewhere(self):
        for citation, extra in (
            ("[S01](https://example.org/unrelated)", ""),
            ("[S01][other]", "\n[other]: https://example.org/unrelated\n"),
            ("[S01]", "\n[S01]: https://example.org/unrelated\n"),
        ):
            with self.subTest(citation=citation, extra=extra):
                report = VALID_REPORT.replace("[S01]", citation, 1) + extra
                self.check_rejected(report, "not custom URLs: S01")

    def test_a_citation_alone_cannot_satisfy_the_body_requirement(self):
        before, appendix = VALID_REPORT.split("## 附录", 1)
        metadata = before.split("## 一、", 1)[0]
        for body, message in (
            ("[S01]。", "must contain an analysis section"),
            ("## 结论\n\n[S01]。", "Empty analysis section"),
        ):
            with self.subTest(body=body):
                report = f"{metadata}{body}\n\n## 附录{appendix}"
                self.check_rejected(report, message)

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

    def test_xyz_layout_accepts_natural_headings_and_requires_numbered_order(self):
        named = VALID_REPORT.replace("二、为什么会走到今天", "二、观测工具如何改变测量")
        self.assertEqual(validate_report.validate_markdown(named, require_xyz=True)[0], [])

        missing = named.replace("## 四、它为什么这样运转", "<!-- ## 四、它为什么这样运转 -->")
        reordered = named.replace("## 三、", "## 四、", 1).replace("## 四、它为什么", "## 三、它为什么", 1)
        for report in (missing, reordered):
            with self.subTest(report=report):
                errors, _ = validate_report.validate_markdown(report, require_xyz=True)
                self.assertTrue(any("template order" in error for error in errors))
                self.assertEqual(validate_report.validate_markdown(report)[0], [])

    def test_detached_claim_row_is_rejected(self):
        row = next(line for line in VALID_REPORT.splitlines() if line.startswith("| C01"))
        detached = row.replace("| C01", "| C02", 1)
        report = VALID_REPORT.replace(row, row + "\n\n" + detached)
        self.check_rejected(report, "A2 has 1 malformed data row")

    def test_hidden_text_does_not_satisfy_chapter_or_citation_checks(self):
        report = VALID_REPORT.replace("早期观测推动了后续直接测量。[S01]", "<!-- 只有注释 -->")
        self.check_rejected(report, "Empty analysis section")
        before, appendix = VALID_REPORT.split("## 附录", 1)
        metadata, _ = before.split("## 一", 1)
        report = metadata + "<!-- [S01] -->\n\n## 附录" + appendix
        self.check_rejected(report, "no [Sxx] citations")

    def test_source_dates_follow_report_and_publication_order(self):
        for old, new, expected in (
            ("发布：2026-08-01", "发布：2026-08-29", "after the source cutoff"),
            ("访问：2026-08-29", "访问：2026-07-31", "before publication"),
            ("访问：2026-08-29", "访问：2026-08-30", "after report completion"),
        ):
            with self.subTest(expected=expected):
                self.check_rejected(VALID_REPORT.replace(old, new), expected)

    def test_claim_source_ids_in_mechanism_and_revision_fields_must_resolve(self):
        report = VALID_REPORT.replace("| fact |", "| mechanism；过程：见S99；归因：见S98 |")
        report = report.replace("修订条件：若后续", "修订条件：参考 S97；若后续")
        self.check_rejected(report, "undefined Source IDs: S97, S98, S99")

    def test_internal_link_needs_a_rendered_anchor(self):
        report = VALID_REPORT.replace("早期观测推动了后续直接测量。[S01]",
                                      "[见观测](#node-observation) 的时间。[S01]")
        self.check_rejected(report, "Internal link has no rendered target")
        anchored = report.replace("## 三、", '<a id="node-observation"></a>\n\n## 三、', 1)
        self.assertEqual(validate_report.validate_markdown(anchored)[0], [])

    def test_figure_needs_rendered_media_not_only_a_caption(self):
        broken = VALID_REPORT + (
            "<figure>\n\n![图示](test.png)\n\n"
            "<figcaption>图 1 [S01]</figcaption>\n</figure>"
        )
        self.check_rejected(broken, "no rendered image or SVG")
        working = broken.replace("![图示](test.png)", '<img src="test.png" alt="图示">')
        self.assertEqual(validate_report.validate_markdown(working)[0], [])

    def test_missing_svg_image_is_rejected(self):
        figure = '<figure><svg viewBox="0 0 10 10" role="img" aria-label="test"><image href="absent.png"/></svg><figcaption>图 1 [S01]</figcaption></figure>'
        with tempfile.TemporaryDirectory() as directory:
            errors, _ = validate_report.validate_markdown(VALID_REPORT + figure, Path(directory))
        self.assertTrue(any("Image file not found" in error for error in errors), errors)

    def test_substring_attributes_do_not_satisfy_svg_contract(self):
        report = VALID_REPORT + '<figure><svg data-viewbox="0 0 10 10" role="presentation" aria-label=""></svg><figcaption>图 1 [S01]</figcaption></figure>'
        for expected in ("viewbox", "role=", "aria-label="):
            self.check_rejected(report, expected)

    def test_manifest_binds_source_output_and_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output, resource = [root / name for name in ("report.md", "output.html", "figure.svg")]
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


if __name__ == "__main__":
    unittest.main()
