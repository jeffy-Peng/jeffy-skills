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

    def test_cli_defaults_to_html(self):
        process = subprocess.run(
            [sys.executable, "-B", build_report.__file__, str(self.source), "--require-xyz"],
            env=dict(os.environ, PYTHONIOENCODING="utf-8"), capture_output=True,
            text=True, encoding="utf-8", check=True,
        )
        self.assertIn("[OK] HTML built and validated", process.stdout)
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

    def test_changed_input_does_not_replace_the_previous_build(self):
        build_report.build_report(self.source, self.output)
        manifest = manifest_path(self.output)
        before = self.output.read_bytes(), manifest.read_bytes()
        original = build_report.build_html

        def render_after_edit(*args):
            self.source.write_text(VALID_REPORT + "\nEdit.\n", encoding="utf-8")
            return original(*args)

        with mock.patch.object(build_report, "build_html", side_effect=render_after_edit):
            with self.assertRaisesRegex(ValueError, "changed during rendering"):
                build_report.build_report(self.source, self.output)

        self.assertEqual((self.output.read_bytes(), manifest.read_bytes()), before)


if __name__ == "__main__":
    unittest.main()
