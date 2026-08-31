from __future__ import annotations

import importlib.util
import re
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_report.py"
SPEC = importlib.util.spec_from_file_location("validate_report", SCRIPT)
assert SPEC and SPEC.loader
validate_report = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validate_report)


VALID_REPORT = """# 月球研究报告

> 研究问题：月球是否存在水冰 | 资料截止：2026-08-28 | 完成日期：2026-08-29

## 一、核心结论

公开测量支持月球极区存在水冰。[S01]

## 二、为什么会走到今天

早期观测推动了后续直接测量。[S01]

## 三、哪些力量改变了路径

探测能力和任务目标共同改变了证据质量。[S01]

## 四、它为什么这样运转

永久阴影区允许挥发物长期保存。[S01]

## 五、对当前问题意味着什么

后续任务需要直接测量储量和分布。[S01]

## 附录：来源与证据边界

### A1 来源账本

| Source ID | 来源与日期 | 证据作用 | 限制 |
|---|---|---|---|
| S01 | [NASA fact sheet](https://example.com/moon)；NASA；2026-08-01；访问 2026-08-29 | 支持 C01；原始材料；independent | 仅覆盖公开测量 |

### A2 关键判断与证据

| Claim ID | 关键判断 | 判断类型 | 支持与反向证据 | 置信度与独立性 | 缺口与反证条件 |
|---|---|---|---|---|---|
| C01 | 月球极区存在水冰 | fact | 支持 S01；反向检索：检查任务更正和相反测量，未发现 | high；independent | 缺少原位储量测量；若后续原位测量不支持则修改判断 |

### A3 资料边界

现有证据不能确定水冰的完整储量和开采难度。
"""


class ValidateReportTests(unittest.TestCase):
    def test_current_contract_passes(self) -> None:
        errors, warnings = validate_report.validate_markdown(VALID_REPORT)

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_optional_fifth_section_can_be_removed(self) -> None:
        report = VALID_REPORT.replace(
            "## 五、对当前问题意味着什么\n\n后续任务需要直接测量储量和分布。[S01]\n\n",
            "",
        )

        errors, _ = validate_report.validate_markdown(report)

        self.assertEqual(errors, [])

    def test_required_structure_rejects_missing_parts(self) -> None:
        cases = {
            "H1": (
                VALID_REPORT.replace("# 月球研究报告", "月球研究报告", 1),
                "exactly one H1",
            ),
            "section four": (
                VALID_REPORT.replace("## 四、它为什么这样运转", "### 它为什么这样运转", 1),
                "Main sections",
            ),
            "A1 shape": (
                VALID_REPORT.replace(
                    "| Source ID | 来源与日期 | 证据作用 | 限制 |",
                    "| Source ID | 来源与日期 | 证据作用 |",
                    1,
                ),
                "A1 must",
            ),
            "A2 shape": (
                VALID_REPORT.replace(
                    "| Claim ID | 关键判断 | 判断类型 | 支持与反向证据 | 置信度与独立性 | 缺口与反证条件 |",
                    "| Claim ID | 关键判断 | 支持与反向证据 | 置信度与独立性 | 缺口与反证条件 |",
                    1,
                ),
                "A2 must",
            ),
            "A3": (
                VALID_REPORT.replace(
                    "### A3 资料边界\n\n现有证据不能确定水冰的完整储量和开采难度。\n",
                    "",
                    1,
                ),
                "A3 must",
            ),
        }

        for name, (report, expected) in cases.items():
            with self.subTest(name=name):
                errors, _ = validate_report.validate_markdown(report)
                self.assertTrue(any(expected in error for error in errors), errors)

    def test_metadata_is_required_and_valid(self) -> None:
        cases = {
            "missing": VALID_REPORT.replace(
                "> 研究问题：月球是否存在水冰 | 资料截止：2026-08-28 | 完成日期：2026-08-29\n\n",
                "",
                1,
            ),
            "malformed": VALID_REPORT.replace("研究问题：", "问题：", 1),
            "invalid date": VALID_REPORT.replace("2026-08-28", "2026-02-30", 1),
            "reversed dates": VALID_REPORT.replace("完成日期：2026-08-29", "完成日期：2026-08-27", 1),
        }

        for name, report in cases.items():
            with self.subTest(name=name):
                errors, _ = validate_report.validate_markdown(report)
                self.assertTrue(any("metadata" in error.lower() or "date" in error.lower() for error in errors), errors)

    def test_enum_values_require_exact_tokens(self) -> None:
        cases = {
            "english substring": VALID_REPORT.replace("high；independent", "follow-up；independent", 1),
            "chinese substring": VALID_REPORT.replace("high；independent", "中立；独立", 1),
        }

        for name, report in cases.items():
            with self.subTest(name=name):
                errors, _ = validate_report.validate_markdown(report)
                self.assertTrue(any("confidence level" in error for error in errors), errors)

    def test_non_independent_marker_is_valid(self) -> None:
        report = VALID_REPORT.replace("independent", "非独立")

        errors, _ = validate_report.validate_markdown(report)

        self.assertEqual(errors, [])

    def test_extra_numbered_section_fails(self) -> None:
        report = VALID_REPORT.replace(
            "## 附录：来源与证据边界",
            "## 六、额外章节\n\n不允许的额外编号章节。[S01]\n\n## 附录：来源与证据边界",
            1,
        )

        errors, _ = validate_report.validate_markdown(report)

        self.assertTrue(any("Main sections" in error for error in errors), errors)

    def test_ledgers_must_be_inside_appendix(self) -> None:
        before_appendix, appendix = VALID_REPORT.split("## 附录：来源与证据边界", 1)
        report = before_appendix + appendix + "\n\n## 附录：来源与证据边界\n"

        errors, _ = validate_report.validate_markdown(report)

        self.assertTrue(any("A1 must" in error for error in errors), errors)
        self.assertTrue(any("A2 must" in error for error in errors), errors)

    def test_unresolved_template_placeholder_fails(self) -> None:
        report = VALID_REPORT.replace("# 月球研究报告", "# [研究对象]深度研究报告")

        errors, _ = validate_report.validate_markdown(report)

        self.assertTrue(any("placeholder" in error.lower() for error in errors), errors)

    def test_duplicate_source_id_fails(self) -> None:
        original = (
            "| S01 | [NASA fact sheet](https://example.com/moon)；NASA；2026-08-01；访问 2026-08-29 | "
            "支持 C01；原始材料；independent | 仅覆盖公开测量 |"
        )
        duplicate = (
            "| S01 | [Duplicate](https://example.com/duplicate)；NASA；2026-08-02 | "
            "补充 C01；independent | 仅覆盖摘要 |"
        )
        report = VALID_REPORT.replace(original, original + "\n" + duplicate)

        errors, _ = validate_report.validate_markdown(report)

        self.assertTrue(any("duplicate Source ID S01" in error for error in errors), errors)

    def test_dangling_claim_source_fails(self) -> None:
        report = VALID_REPORT.replace("支持 S01；反向检索", "支持 S99；反向检索")

        errors, _ = validate_report.validate_markdown(report)

        self.assertTrue(any("undefined Source IDs: S99" in error for error in errors), errors)

    def test_claim_requires_reverse_search_note(self) -> None:
        report = VALID_REPORT.replace(
            "支持 S01；反向检索：检查任务更正和相反测量，未发现",
            "支持 S01",
        )

        errors, _ = validate_report.validate_markdown(report)

        self.assertTrue(any("reverse-search" in error for error in errors), errors)

    def test_body_citation_must_resolve(self) -> None:
        report = VALID_REPORT.replace("公开测量支持月球极区存在水冰。[S01]", "公开测量支持月球极区存在水冰。[S99]")

        errors, _ = validate_report.validate_markdown(report)

        self.assertTrue(any("Report body references undefined" in error for error in errors), errors)

    def test_media_must_follow_figure_contract(self) -> None:
        report = VALID_REPORT.replace(
            "## 二、为什么会走到今天",
            "![无标题图片](missing.png)\n\n## 二、为什么会走到今天",
        )

        errors, _ = validate_report.validate_markdown(report, base_dir=Path("/tmp"))

        self.assertTrue(any("outside a <figure>" in error for error in errors), errors)
        self.assertTrue(any("Image file not found" in error for error in errors), errors)

    def test_figure_contract(self) -> None:
        figure = """<figure>
<svg viewBox="0 0 10 10" role="img" aria-label="月球水冰示意">
  <circle cx="5" cy="5" r="4"></circle>
</svg>
<figcaption>图 1：月球极区水冰证据 [S01]</figcaption>
</figure>"""

        def add_figure(value: str) -> str:
            return VALID_REPORT.replace("## 二、为什么会走到今天", value + "\n\n## 二、为什么会走到今天", 1)

        errors, _ = validate_report.validate_markdown(add_figure(figure))
        self.assertEqual(errors, [])

        cases = {
            "figcaption": (re.sub(r"<figcaption>.*?</figcaption>", "", figure), "figcaption"),
            "Source ID": (figure.replace(" [S01]", "", 1), "no Source ID"),
            "viewBox": (figure.replace(' viewBox="0 0 10 10"', "", 1), "viewbox"),
            "role": (figure.replace(' role="img"', "", 1), "role="),
            "aria-label": (figure.replace(' aria-label="月球水冰示意"', "", 1), "aria-label="),
        }
        for name, (broken_figure, expected) in cases.items():
            with self.subTest(name=name):
                errors, _ = validate_report.validate_markdown(add_figure(broken_figure))
                self.assertTrue(any(expected in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
