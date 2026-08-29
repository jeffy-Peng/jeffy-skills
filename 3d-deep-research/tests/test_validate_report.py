from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_report.py"
SPEC = importlib.util.spec_from_file_location("validate_report", SCRIPT)
assert SPEC and SPEC.loader
validate_report = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validate_report)


VALID_REPORT = """# 可验证研究报告

## 一、结论是什么

这是一条用于校验器测试的结论。[S01]

## 二、为什么会走到今天

这里记录经过引用支持的时间线。

## 三、哪些力量改变了路径

这里记录关键力量。

## 四、它为什么这样运转

这里记录可被反驳的机制解释。

## 五、未来会怎样

这里只记录领先指标，不作确定预测。

## 六、最终怎么看

结论需要在新证据出现时复查。

## 附录一：来源与证据边界

### A1 来源账本

| Source ID | 来源与日期 | 出处/作用/独立性 | 文件与限制 |
|---|---|---|---|
| S01 | [NASA fact sheet](https://example.com/source)；NASA；2026-08-01；访问 2026-08-29 | primary / fact / independent | 网页；测试样本，范围有限 |

### A2 Claim 证据矩阵

| Claim ID | Claim | 类型/重要性 | 支持与反向材料 | 置信度/独立性 | 缺口与反证条件 | 时效期 | 复查状态 |
|---|---|---|---|---|---|---|---|
| C01 | 这是一条用于校验器测试的结论 | fact / load-bearing | 支持 S01；反向检索：检索官方更正与相反材料，未发现 | high / independent | 缺口：缺少第二来源；反证条件：NASA 发布更正 | 2026-09-28 | 未到期 |

### A3 资料边界

本报告仅用于测试校验器。

### A5 引用摘录存档

| Claim ID | 来源原文摘录（Source ID） | 报告表述 | 核验结果 |
|---|---|---|---|
| C01 | “用于测试的原文摘录”（S01） | 这是一条用于校验器测试的结论 | 一致 |

### A6 归属审计与数字复核记录

| Claim ID | 归属核验 | 数字复核 | 反向核对 | 审计结论 |
|---|---|---|---|---|
| C01 | 句子能从 S01 原文推出 | 不涉及数字 | 已核对反向检索记录 | 通过 |
"""


ADVERSARIAL_REPORT = """# 伪研究报告

## 一、结论是什么

月亮由奶酪构成。[S01]

## 二、怎么走到今天

没有时间线。

## 三、什么力量在作用

没有力场。

## 四、为什么这样运转

没有机制。

## 五、未来会怎样

一定如此。

## 六、最终怎么看

结论不会错。

## 附录一：来源与证据边界

### A1 来源账本

| Source ID | 来源 |
|---|---|
| S01 | 并不存在的材料 |

### A2 Claim 证据矩阵

| Claim ID | Claim | 类型 | 支持 | 置信度 |
|---|---|---|---|---|
| C01 | 月亮是奶酪 | 随便 | 无 | high |

### A5 引用摘录存档

空。

### A6 归属审计与数字复核记录

空。
"""


class ValidateReportTests(unittest.TestCase):
    def test_complete_evidence_loop_passes_strict_validation(self) -> None:
        errors, warnings, stats = validate_report.validate_markdown(
            VALID_REPORT,
            strict=True,
        )

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        self.assertEqual(stats["claim_rows"], 1)

    def test_formally_complete_but_empty_report_fails_strict_validation(self) -> None:
        errors, warnings, _ = validate_report.validate_markdown(
            ADVERSARIAL_REPORT,
            strict=True,
        )

        self.assertTrue(errors)
        self.assertEqual(warnings, [])
        self.assertTrue(any("A5" in error for error in errors))
        self.assertTrue(any("Source S01" in error for error in errors))
        self.assertTrue(any("Claim C01" in error for error in errors))

    def test_evidence_issues_are_warnings_without_strict_mode(self) -> None:
        errors, warnings, _ = validate_report.validate_markdown(
            ADVERSARIAL_REPORT,
            strict=False,
        )

        self.assertEqual(errors, [])
        self.assertTrue(warnings)

    def test_dangling_source_reference_fails_strict_validation(self) -> None:
        report = VALID_REPORT.replace(
            "支持 S01；反向检索",
            "支持 S99；反向检索",
        )
        errors, _, _ = validate_report.validate_markdown(report, strict=True)

        self.assertTrue(
            any("undefined Source IDs: S99" in error for error in errors),
            errors,
        )

    def test_missing_load_bearing_audit_row_fails_strict_validation(self) -> None:
        report = VALID_REPORT.replace(
            '| C01 | “用于测试的原文摘录”（S01） | 这是一条用于校验器测试的结论 | 一致 |',
            "",
        )
        errors, _, _ = validate_report.validate_markdown(report, strict=True)

        self.assertTrue(
            any("A5 is missing load-bearing Claims: C01" in error for error in errors),
            errors,
        )

    def test_counterevidence_source_used_only_in_a2_is_not_reported_unused(self) -> None:
        report = VALID_REPORT.replace(
            "| S01 | [NASA fact sheet]",
            "| S02 | [Correction log](https://example.com/corrections)；NASA；2026-08-02；访问 2026-08-29 | independent-secondary / counterevidence / independent | 网页；仅覆盖公开更正 |\n| S01 | [NASA fact sheet]",
        ).replace(
            "反向检索：检索官方更正与相反材料，未发现",
            "反向材料：S02",
        )

        errors, warnings, _ = validate_report.validate_markdown(report, strict=True)

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_supporting_claim_does_not_require_counterevidence(self) -> None:
        supporting_row = (
            "| C02 | 这是一条辅助事实 | fact / supporting | 支持 S01 | "
            "medium / independent | 缺口：仅有一个来源；反证条件：来源被撤回 | "
            "2026-09-28 | 未到期 |"
        )
        report = VALID_REPORT.replace(
            "| C01 | 这是一条用于校验器测试的结论 |",
            supporting_row + "\n| C01 | 这是一条用于校验器测试的结论 |",
        )

        errors, warnings, _ = validate_report.validate_markdown(report, strict=True)

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
