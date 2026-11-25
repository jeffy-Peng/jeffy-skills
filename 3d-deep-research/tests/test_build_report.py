from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build_report
from report_artifacts import manifest_path, validate_manifest
from test_validate_report import VALID_REPORT


class BuildReportTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.source = self.root / "report.md"
        self.source.write_text(VALID_REPORT, encoding="utf-8")
        self.output = self.root / "output.html"

    def test_cli_can_build_only_the_report(self):
        process = subprocess.run(
            [sys.executable, "-B", build_report.__file__, str(self.source), "--require-xyz", "--report-only"],
            env=dict(os.environ, PYTHONIOENCODING="utf-8"), capture_output=True,
            text=True, encoding="utf-8", check=True,
        )
        self.assertEqual(validate_manifest(self.source, self.output), ([], []))
        self.assertEqual(
            {path.name for path in self.root.iterdir()},
            {"report.md", "output.html", "output.html.manifest.json"},
        )

    def test_one_conversion_keeps_figure_sources_and_dependencies(self):
        chart = self.root / "chart.png"
        chart.write_bytes(b"example image")
        figure = '<figure><img src="chart.png" alt="Chart"><figcaption>Figure 1 [S01]</figcaption></figure>'
        self.source.write_text(VALID_REPORT.replace("\n## ", f"\n\n{figure}\n\n## ", 1), encoding="utf-8")

        with mock.patch.object(build_report, "markdown_to_html", wraps=build_report.markdown_to_html) as convert:
            build_report.build_report(self.source, self.output, require_xyz=True)

        self.assertEqual(convert.call_count, 1)
        html = self.output.read_text(encoding="utf-8")
        encoded = base64.b64encode(chart.read_bytes()).decode("ascii")
        self.assertIn(f"data:image/png;base64,{encoded}", html)
        self.assertIn('class="src-link"', html)
        self.assertEqual(validate_manifest(self.source, self.output), ([], []))
        manifest = json.loads(manifest_path(self.output).read_text(encoding="utf-8"))
        self.assertIn("chart.png", {item["path"] for item in manifest["dependencies"]})

    def test_source_links_target_A1_in_another_output_directory(self):
        evidence = self.root / "source note.txt"
        evidence.write_text("Synthetic source", encoding="utf-8")
        report = VALID_REPORT.replace("https://example.com/moon", "<source%20note.txt#page=3>")
        extra_table = "| ID | 内容 |\n|---|---|\n| S01 | 摘要 |\n\n"
        self.source.write_text(report.replace("## 二、", extra_table + "## 二、", 1), encoding="utf-8")
        output = self.root / "published" / "output.html"
        build_report.build_report(self.source, output)
        html = output.read_text(encoding="utf-8")
        self.assertEqual(html.count('id="src-S01"'), 1)
        self.assertIn('href="#src-S01" class="src-link"', html)
        self.assertIn('href="../source%20note.txt#page=3"', html)

    def test_svg_must_embed_its_own_dependencies(self):
        svg = self.root / "chart.svg"
        start = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
        svg.write_text(f'{start}<image href="tile.png"/></svg>', encoding="utf-8")
        figure = '<figure><img src="chart.svg" alt="Chart"><figcaption>Figure 1 [S01]</figcaption></figure>'
        self.source.write_text(VALID_REPORT.replace("\n## ", f"\n\n{figure}\n\n## ", 1), encoding="utf-8")

        with self.assertRaisesRegex(ValueError, r"not self-contained: tile\.png"):
            build_report.build_report(self.source, self.output)
        self.assertFalse(self.output.exists())

        svg.write_text(
            f'{start}<defs><path id="chart" d="M1 1L5 5"/></defs><use href="#chart"/></svg>',
            encoding="utf-8",
        )
        build_report.build_report(self.source, self.output)
        self.assertIn("data:image/svg+xml;base64,", self.output.read_text(encoding="utf-8"))
        self.assertEqual(validate_manifest(self.source, self.output), ([], []))

    def test_changed_input_does_not_replace_the_previous_build(self):
        build_report.build_report(self.source, self.output)
        manifest = manifest_path(self.output)
        before = self.output.read_bytes(), manifest.read_bytes()
        original = build_report.build_html

        def render_after_edit(*args, **kwargs):
            self.source.write_text(VALID_REPORT + "\nEdit.\n", encoding="utf-8")
            return original(*args, **kwargs)

        with mock.patch.object(build_report, "build_html", side_effect=render_after_edit):
            with self.assertRaisesRegex(ValueError, "changed during rendering"):
                build_report.build_report(self.source, self.output)

        self.assertEqual((self.output.read_bytes(), manifest.read_bytes()), before)


if __name__ == "__main__":
    unittest.main()
