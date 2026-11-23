from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from test_validate_report import VALID_REPORT
from build_panorama import build, load_panorama
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

    def test_pair_binds_revision_and_rendered_anchors(self):
        self.save()
        build_report(self.source, self.report, xyz=self.xyz)
        build(self.xyz, self.source, self.panorama)
        build(self.xyz, self.source, self.panorama, check=True)
        report = self.report.read_text(encoding="utf-8")
        graph = self.panorama.read_text(encoding="utf-8")
        self.assertIn('href="panorama.html"', report)
        self.assertIn('id="claim-C01"', report)
        self.assertIn('href="output.html#claim-C01"', graph)
        self.assertIn('href="output.html#src-S01"', graph)
        self.data["impacts"][0]["condition"] = "修订后的证据边界"
        self.save()
        with self.assertRaises(ValueError):
            build(self.xyz, self.source, self.panorama, check=True)
        build_report(self.source, self.report, xyz=self.xyz)
        with self.assertRaisesRegex(ValueError, "全景图与"):
            build(self.xyz, self.source, self.panorama, check=True)
        build(self.xyz, self.source, self.panorama)
        build(self.xyz, self.source, self.panorama, check=True)

    def test_static_report_can_build_without_panorama(self):
        build_report(self.source, self.report)
        self.assertNotIn('href="panorama.html"', self.report.read_text(encoding="utf-8"))

    def test_panorama_cannot_overwrite_its_input(self):
        self.save()
        with self.assertRaises(ValueError):
            build(self.xyz, self.source, self.xyz)
        self.assertEqual(json.loads(self.xyz.read_bytes()), self.data)


if __name__ == "__main__":
    unittest.main()
