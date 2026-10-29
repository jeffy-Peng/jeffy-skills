from __future__ import annotations

import sys
import tempfile
import subprocess
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build_report
from report_artifacts import write_manifest


class BuildReportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.scripts = self.root / "scripts"
        self.scripts.mkdir()
        self.dependencies = [self.scripts / name for name in ("render_report.py", "linkify_sources.py", "report_artifacts.py")]
        (self.root / "assets").mkdir()
        self.dependencies.append(self.root / "assets/report.css")
        for path in self.dependencies:
            path.write_text("original", encoding="utf-8")
        self.source = self.root / "report.md"
        self.output = self.root / "output.html"
        self.source.write_text("source", encoding="utf-8")
        self.output.write_text("artifact", encoding="utf-8")
        self.patch = mock.patch.object(build_report, "SCRIPTS", self.scripts)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_unchanged_artifact_reuses_but_inputs_and_code_invalidate(self):
        write_manifest(self.source, self.output, self.dependencies, [])
        self.assertTrue(build_report.reusable(self.source, self.output, None))
        for path in [self.source, self.output, *self.dependencies]:
            original = path.read_text(encoding="utf-8")
            path.write_text("changed", encoding="utf-8")
            self.assertFalse(build_report.reusable(self.source, self.output, None), path)
            path.write_text(original, encoding="utf-8")

    def test_legacy_manifest_and_remote_media_do_not_reuse(self):
        write_manifest(self.source, self.output, [], [])
        self.assertFalse(build_report.reusable(self.source, self.output, None))
        write_manifest(self.source, self.output, self.dependencies, ["https://example.com/image.png"])
        self.assertFalse(build_report.reusable(self.source, self.output, None))

    def test_external_svg_does_not_reuse_untracked_nested_resources(self):
        svg = self.root / "nested.svg"
        svg.write_text('<svg><image href="nested.png"/></svg>', encoding="utf-8")
        write_manifest(self.source, self.output, [*self.dependencies, svg], [])
        self.assertFalse(build_report.reusable(self.source, self.output, None))

    def test_font_switch_and_font_edits_invalidate(self):
        fonts = self.root / "fonts"
        fonts.mkdir()
        paths = [fonts / name for name in build_report.FONT_FILES.values()]
        for path in paths:
            path.write_bytes(b"font")
        write_manifest(self.source, self.output, [*self.dependencies, *paths], [])
        self.assertTrue(build_report.reusable(self.source, self.output, fonts))
        self.assertFalse(build_report.reusable(self.source, self.output, self.root / "other-fonts"))
        paths[0].write_bytes(b"changed font")
        self.assertFalse(build_report.reusable(self.source, self.output, fonts))

    def test_timeout_replaces_stale_log_and_retains_output(self):
        log = self.root / "probe.log"
        log.write_text("stale success", encoding="utf-8")
        error = subprocess.TimeoutExpired(["probe"], 300, output=b"partial output", stderr=b"partial error")
        with mock.patch.object(build_report.subprocess, "run", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "probe timed out"):
                build_report.run_step("probe", ["probe"], {}, self.root)
        self.assertEqual(log.read_text(encoding="utf-8"), "partial outputpartial error\n[TIMEOUT]\n")


if __name__ == "__main__":
    unittest.main()
