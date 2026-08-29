from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

from test_validate_report import VALID_REPORT


SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = SKILL_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
SCRIPT = SCRIPTS_DIR / "validate_project.py"
SPEC = importlib.util.spec_from_file_location("validate_project", SCRIPT)
assert SPEC and SPEC.loader
validate_project = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validate_project)


VALID_CONTRACT = """# 研究契约

| 字段 | 内容 | 用户确认 |
|---|---|---|
| 研究对象 | 可验证研究 | 已确认 |
| 对象类型 | concept | 已确认 |
| 用户决策问题 | 这是一条用于校验器测试的结论 | 已确认 |
| 特别关注点 | 证据闭环 | 已确认 |
| 时间基准 | 2026-08-29 | 已确认 |
| 范围边界 | 仅用于校验器测试 | 已确认 |
| 交付要求 | markdown | 已确认 |
| 深度档位 | standard | 已确认 |

## 资源预算（按深度档位）

已记录。
"""


VALID_RETRIEVAL_MAP = """# 检索地图

## 第一组：必须确认的事实

| 问题 | 检索方向/查询 | 已检索来源 | 状态 | 关联 Claim |
|---|---|---|---|---|
| 测试事实是否有来源 | 官方事实页 | S01 | 已解决 | C01 |

## 第二组：需要验证的因果或机制

| 问题 | 检索方向/查询 | 已检索来源 | 状态 | 关联 Claim |
|---|---|---|---|---|
| 是否存在替代机制 | 行为证据 | S01 | 已解决 | C01 |

## 第三组：反向证据、替代解释和失败案例

| 问题 | 检索方向/查询 | 已检索来源 | 状态 | 关联 Claim |
|---|---|---|---|---|
| 是否存在官方更正 | 更正记录 | S01 | 已解决 | C01 |

## 未解决清单

无未解决问题。
"""


PROJECT_REPORT = VALID_REPORT.replace(
    "# 可验证研究报告",
    "# 可验证研究立体分析报告",
).replace(
    "这是一条用于校验器测试的结论。[S01]",
    "> 研究时间：2026-08-29 | 研究问题：这是一条用于校验器测试的结论 | 时间基准：2026-08-29 | 深度档位：standard | 研究契约：research-contract.md\n\n这是一条用于校验器测试的结论。[S01]",
)


class ValidateProjectTests(unittest.TestCase):
    def _write_project(
        self,
        directory: Path,
        *,
        contract: str = VALID_CONTRACT,
        retrieval_map: str = VALID_RETRIEVAL_MAP,
        report: str = PROJECT_REPORT,
    ) -> None:
        (directory / "research-contract.md").write_text(contract, encoding="utf-8")
        (directory / "retrieval-map.md").write_text(retrieval_map, encoding="utf-8")
        (directory / "report.md").write_text(report, encoding="utf-8")

    def test_complete_project_passes_strict_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_dir = Path(temp_dir)
            self._write_project(project_dir)

            errors, warnings, stats = validate_project.validate_project(
                project_dir,
                strict=True,
            )

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        self.assertEqual(stats["retrieval_questions"], 3)
        self.assertEqual(stats["retrieval_unresolved"], 0)

    def test_missing_required_file_fails_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_dir = Path(temp_dir)
            (project_dir / "report.md").write_text(PROJECT_REPORT, encoding="utf-8")

            errors, _, _ = validate_project.validate_project(project_dir, strict=True)

        self.assertTrue(any("missing required files" in error for error in errors))

    def test_contract_report_mismatch_fails_strict_validation(self) -> None:
        contract = VALID_CONTRACT.replace("2026-08-29", "2026-08-28")
        with tempfile.TemporaryDirectory() as temp_dir:
            project_dir = Path(temp_dir)
            self._write_project(project_dir, contract=contract)

            errors, _, _ = validate_project.validate_project(project_dir, strict=True)

        self.assertTrue(
            any("时间基准 does not match" in error for error in errors),
            errors,
        )

    def test_resolved_question_without_source_fails_strict_validation(self) -> None:
        retrieval_map = VALID_RETRIEVAL_MAP.replace(
            "| 测试事实是否有来源 | 官方事实页 | S01 | 已解决 | C01 |",
            "| 测试事实是否有来源 | 官方事实页 | 无 | 已解决 | C01 |",
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            project_dir = Path(temp_dir)
            self._write_project(project_dir, retrieval_map=retrieval_map)

            errors, _, _ = validate_project.validate_project(project_dir, strict=True)

        self.assertTrue(
            any("Resolved retrieval-map facts" in error for error in errors),
            errors,
        )

    def test_unmapped_load_bearing_claim_fails_strict_validation(self) -> None:
        retrieval_map = VALID_RETRIEVAL_MAP.replace("C01", "C99")
        with tempfile.TemporaryDirectory() as temp_dir:
            project_dir = Path(temp_dir)
            self._write_project(project_dir, retrieval_map=retrieval_map)

            errors, _, _ = validate_project.validate_project(project_dir, strict=True)

        self.assertTrue(
            any("not mapped to retrieval questions: C01" in error for error in errors),
            errors,
        )

    def test_unresolved_question_requires_map_and_report_records(self) -> None:
        retrieval_map = VALID_RETRIEVAL_MAP.replace(
            "| 测试事实是否有来源 | 官方事实页 | S01 | 已解决 | C01 |",
            "| 测试事实是否有来源 | 官方事实页 | 无 | 未解决 | C01 |",
        ).replace("无未解决问题。", "无")
        report = PROJECT_REPORT.replace(
            "本报告仅用于测试校验器。",
            "无",
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            project_dir = Path(temp_dir)
            self._write_project(
                project_dir,
                retrieval_map=retrieval_map,
                report=report,
            )

            errors, _, _ = validate_project.validate_project(project_dir, strict=True)

        self.assertTrue(
            any("no unresolved-list record" in error for error in errors),
            errors,
        )
        self.assertTrue(
            any("report A3 has no material-boundary record" in error for error in errors),
            errors,
        )


if __name__ == "__main__":
    unittest.main()
