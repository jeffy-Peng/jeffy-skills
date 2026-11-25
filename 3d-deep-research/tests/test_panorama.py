from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_validate_report import VALID_REPORT
from build_panorama import build, drawing_data, load_panorama
from report_artifacts import manifest_path, sha256
from build_report import build_report


def xyz_sample() -> dict:
    return {
        "xs": [{"id": "X1", "time": "2026-08", "title": "直接测量", "detail": "开展测量", "cites": ["S01"]}],
        "factors": [
            {"id": "Y1", "x": "X1", "name": "测量能力", "kind": "推动", "detail": "提高覆盖", "cites": ["S01"]},
            {"id": "Y2", "x": "X1", "name": "原位测量受限", "kind": "制约", "detail": "覆盖有限", "cites": ["S01"]},
        ],
        "impacts": [
            {"id": "Z1", "x": "X1", "factors": ["Y1"], "claim": "C01",
             "path": ["获得测量结果"], "condition": "极区", "pending": False, "cites": ["S01"]},
            {"id": "Z2", "x": "X1", "factors": ["Y2"], "claim": None,
             "path": ["无法推算储量"], "condition": "现有数据范围", "pending": True, "cites": []},
        ],
    }


class PanoramaTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root / "report.md"
        self.source.write_text(VALID_REPORT, encoding="utf-8")
        self.xyz = self.root / "xyz.json"
        self.report = self.root / "output.html"
        self.panorama = self.root / "panorama.html"
        self.data = xyz_sample()

    def save(self):
        self.xyz.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")

    def test_distinct_impacts_and_explicit_joint_factors(self):
        joint = dict(self.data["impacts"][0], id="Z3", factors=["Y1", "Y2"])
        self.data["impacts"].append(joint)
        self.save()
        impacts = load_panorama(self.xyz.read_bytes(), VALID_REPORT)["events"][0]["impacts"]
        self.assertEqual([z["factors"] for z in impacts], [["Y1"], ["Y2"], ["Y1", "Y2"]])
        self.assertEqual(impacts[0]["result"], "月球极区存在水冰")
        self.assertTrue(impacts[1]["pending"])

    def test_reject_unknown_or_cross_event_references(self):
        self.data["xs"].append(dict(self.data["xs"][0], id="X2"))
        for key, value in (("x", "X2"), ("factors", ["Y9"]), ("cites", ["S99"]), ("claim", "C99")):
            with self.subTest(key=key):
                bad = copy.deepcopy(self.data)
                bad["impacts"][0][key] = value
                with self.assertRaises(ValueError):
                    load_panorama(json.dumps(bad).encode("utf-8"), VALID_REPORT)

    def test_reject_malformed_or_conflicting_fields(self):
        for key, value in (("path", "bad"), ("pending", "false"), ("factors", ["Y1", "Y1"]), ("result", "矛盾判断")):
            with self.subTest(key=key):
                bad = copy.deepcopy(self.data)
                bad["impacts"][0][key] = value
                with self.assertRaises(ValueError):
                    load_panorama(json.dumps(bad).encode("utf-8"), VALID_REPORT)
        self.data["xs"][0].pop("cites")
        self.save()
        with self.assertRaisesRegex(ValueError, "X1.cites"):
            build_report(self.source, self.report, xyz=self.xyz)
        self.assertFalse(self.report.exists())

    def test_single_file_binds_embedded_panorama_and_rejects_tampering(self):
        self.save()
        build_report(self.source, self.report, xyz=self.xyz)
        build(self.xyz, self.source, self.report, check=True)
        report = self.report.read_text(encoding="utf-8")
        self.assertIn('id="panorama-doc"', report)
        self.assertIn('id="claim-C01"', report)
        self.assertIn('id="src-S01"', report)
        # Progressive enhancement: report body must not be statically hidden when JS is off.
        self.assertIn('<div class="layout" id="reportLayout">', report)

        # Tampering with embedded panorama must fail check.
        tampered = report.replace("获得测量结果", "被篡改的路径", 1)
        self.report.write_text(tampered, encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "does not match its build manifest"):
            build(self.xyz, self.source, self.report, check=True)

        # An internally consistent manifest must still fail the XYZ comparison.
        manifest = manifest_path(self.report)
        metadata = json.loads(manifest.read_text(encoding="utf-8"))
        metadata["output_sha256"] = sha256(self.report)
        manifest.write_text(json.dumps(metadata), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "内嵌全景图"):
            build(self.xyz, self.source, self.report, check=True)

        # Updating xyz.json without rebuilding must fail check.
        build_report(self.source, self.report, xyz=self.xyz)
        self.data["impacts"][0]["condition"] = "修订后的证据边界"
        self.save()
        with self.assertRaises(ValueError):
            build(self.xyz, self.source, self.report, check=True)
        build_report(self.source, self.report, xyz=self.xyz)
        build(self.xyz, self.source, self.report, check=True)

    def test_split_panorama_checks_both_embedded_and_standalone(self):
        self.save()
        build_report(self.source, self.report, xyz=self.xyz, companion=True)
        build(self.xyz, self.source, self.panorama, check=True)
        graph = self.panorama.read_text(encoding="utf-8")
        self.assertIn('href="output.html#claim-C01"', graph)
        self.assertIn('href="output.html#src-S01"', graph)

    def test_default_cli_publishes_checked_single_file_in_output_directory(self):
        self.save()
        delivery = self.root / "delivery"
        command = [sys.executable, "-B", str(Path(__file__).resolve().parents[1] / "scripts" / "build_report.py"),
                   str(self.source), "--output-dir", str(delivery)]
        kwargs = dict(env=dict(os.environ, PYTHONIOENCODING="utf-8"), capture_output=True, text=True, encoding="utf-8")
        process = subprocess.run(command, **kwargs)
        self.assertEqual(process.returncode, 0, process.stdout + process.stderr)
        report = delivery / self.report.name
        self.assertTrue(report.is_file())
        self.assertFalse((delivery / self.panorama.name).exists())
        build(self.xyz, self.source, report, check=True)
        before = {path.name: path.read_bytes() for path in delivery.iterdir()}
        self.xyz.unlink()
        process = subprocess.run(command, **kwargs)
        self.assertEqual(process.returncode, 1)
        self.assertIn("XYZ data is required", process.stdout)
        self.assertEqual({path.name: path.read_bytes() for path in delivery.iterdir()}, before)

    def test_two_pending_factors_under_same_x_have_distinct_paths(self):
        self.data["factors"] = [
            {"id": "Y1", "x": "X1", "name": "待查因素甲", "kind": "待查", "detail": "缺口甲", "cites": []},
            {"id": "Y2", "x": "X1", "name": "待查因素乙", "kind": "待查", "detail": "缺口乙", "cites": []},
        ]
        self.data["impacts"] = [
            {"id": "Z1", "x": "X1", "factors": ["Y1"], "claim": None,
             "path": ["路径甲"], "condition": "条件甲", "pending": True, "cites": []},
            {"id": "Z2", "x": "X1", "factors": ["Y2"], "claim": None,
             "path": ["路径乙"], "condition": "条件乙", "pending": True, "cites": []},
        ]
        self.save()
        model = drawing_data(load_panorama(self.xyz.read_bytes(), VALID_REPORT))
        self.assertEqual(len(model["factors"]), 2)
        self.assertEqual([z["factors"] for z in model["impacts"][0]["paths"]], [["Y1"], ["Y2"]])

        # Verify the projected link origins against the rendered station markers.
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.skipTest("Browser geometry check requires Playwright")
        build_report(self.source, self.report, xyz=self.xyz)
        with sync_playwright() as playwright:
            channel = os.environ.get("PANORAMA_BROWSER_CHANNEL")
            if not channel and not Path(playwright.chromium.executable_path).exists():
                self.skipTest("Install Chromium or set PANORAMA_BROWSER_CHANNEL")
            with playwright.chromium.launch(channel=channel) as browser:
                page = browser.new_page(reduced_motion="reduce")
                page.goto(self.report.as_uri())
                frame = page.frame_locator("#panoFrame")
                origins = []
                for fid in ("Y1", "Y2"):
                    marker = frame.locator(f'[data-factor="{fid}"] path')
                    marker.wait_for()
                    color = marker.get_attribute("stroke")
                    bounds = marker.evaluate("(el) => {const {x,y,width,height}=el.getBBox(); return {x,y,width,height}}")
                    arc = frame.locator(f'path[pointer-events="none"][stroke="{color}"][stroke-dasharray="3.5 3.5"]')
                    point = arc.evaluate("(el) => {const p = el.getPointAtLength(0); return [p.x, p.y]}")
                    for actual, axis, size in zip(point, ("x", "y"), ("width", "height")):
                        self.assertAlmostEqual(actual, bounds[axis] + bounds[size] / 2, delta=0.2)
                    origins.append(point)
                self.assertNotEqual(origins[0], origins[1])

    def test_comparison_uses_observation_without_date_or_invented_path(self):
        self.data["mode"] = "comparison"
        del self.data["xs"][0]["time"]
        self.data["factors"] = []
        self.data["impacts"] = []
        model = drawing_data(load_panorama(json.dumps(self.data).encode("utf-8"), VALID_REPORT))
        self.assertFalse(model["timeline"])
        self.assertEqual(model["xs"][0]["time"], "")
        self.assertEqual(model["factors"], [])
        self.assertEqual(model["impacts"][0]["paths"], [])
        self.assertTrue(model["impacts"][0]["pending"])

    def test_series_groups_explicit_observations_without_merging_paths(self):
        first = self.data["factors"][0]
        first["series"] = "测量"
        self.data["xs"].append(dict(self.data["xs"][0], id="X2", time="2026-10"))
        self.data["factors"].append(dict(first, id="Y3", x="X2", kind="制约"))
        self.data["factors"][1]["name"] = first["name"]
        model = drawing_data(load_panorama(json.dumps(self.data).encode("utf-8"), VALID_REPORT))
        self.assertEqual([[seg["id"] for seg in series["segs"]] for series in model["factors"]],
                         [["Y1", "Y3"], ["Y2"]])
        self.assertEqual([path["factors"] for path in model["impacts"][0]["paths"]], [["Y1"], ["Y2"]])
        self.assertEqual(model["impacts"][1]["paths"], [])
        self.data["factors"][-1]["x"] = "X1"
        with self.assertRaisesRegex(ValueError, "只能有一个站位"):
            load_panorama(json.dumps(self.data).encode("utf-8"), VALID_REPORT)

    def test_static_report_can_build_without_panorama(self):
        build_report(self.source, self.report)
        text = self.report.read_text(encoding="utf-8")
        self.assertNotIn('id="panorama-doc"', text)
        self.assertNotIn('href="panorama.html"', text)

    def test_panorama_cannot_overwrite_its_input(self):
        self.save()
        with self.assertRaises(ValueError):
            build(self.xyz, self.source, self.xyz)
        self.assertEqual(json.loads(self.xyz.read_bytes()), self.data)


if __name__ == "__main__":
    unittest.main()
