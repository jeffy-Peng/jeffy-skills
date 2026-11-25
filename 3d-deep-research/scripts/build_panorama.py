#!/usr/bin/env python3
"""Build or check a panorama bound to a validated report and its XYZ data."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from pathlib import Path
from tempfile import TemporaryDirectory

from report_artifacts import manifest_path, sha256, validate_manifest
from validate_report import (
    _configure_utf8_console, _extract_table, _plain_text,
    _split_body_and_appendix, validate_markdown,
)

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "panorama-template.html"
NODE_ID = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,39}")
KINDS = {"推动", "制约", "待查"}
EMBEDDED_PANORAMA = re.compile(
    r'<script\s+type="text/plain"\s+id="panorama-doc">(.*?)</script>',
    re.S,
)


def require(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


def string(record: dict, key: str, where: str) -> str:
    value = record.get(key)
    require(isinstance(value, str) and bool(value.strip()), f"{where}.{key} 必须是非空文本")
    return value.strip()


def ids(record: dict, key: str, allowed, where: str, *, empty: bool = False) -> list[str]:
    values = record.get(key)
    require(isinstance(values, list) and (bool(values) or empty), f"{where}.{key} 必须是编号数组")
    for value in values:
        require(isinstance(value, str) and value in allowed, f"{where}.{key} 未登记或不属于此关系：{value!r}")
    require(len(set(values)) == len(values), f"{where}.{key} 包含重复编号")
    return values


def records(data: dict, key: str, *, allow_empty: bool = False) -> dict[str, dict]:
    rows = data.get(key)
    require(isinstance(rows, list) and (bool(rows) or allow_empty), f"{key} 必须是有效数组")
    indexed = {}
    for index, row in enumerate(rows):
        where = f"{key}[{index}]"
        require(isinstance(row, dict), f"{where} 必须是对象")
        identifier = string(row, "id", where)
        require(bool(NODE_ID.fullmatch(identifier)), f"{where}.id 必须是短编号")
        require(identifier not in indexed, f"{key} 编号重复：{identifier}")
        indexed[identifier] = row
    return indexed


def load_panorama(raw: bytes, report: str) -> dict:
    data = json.loads(raw)
    require(isinstance(data, dict), "xyz.json 必须是对象")
    _, appendix = _split_body_and_appendix(report)
    _, source_rows, _ = _extract_table(appendix, "A1")
    _, claim_rows, _ = _extract_table(appendix, "A2")
    sources = {row[0] for row in source_rows}
    claims = {row[0]: row for row in claim_rows}

    mode = data.get("mode", "timeline")
    require(isinstance(mode, str) and mode in {"timeline", "comparison"}, "mode 必须是 timeline 或 comparison")
    xs = records(data, "xs")
    factors = records(data, "factors", allow_empty=True)
    impacts = records(data, "impacts", allow_empty=True)
    require(not (set(xs) & set(factors) or set(xs) & set(impacts) or set(factors) & set(impacts)),
            "X、Y 和 Z 的节点编号须在全图唯一")
    events = {}
    for xid, x in xs.items():
        fields = {k: string(x, k, xid) for k in ("title", "detail")}
        fields["time"] = string(x, "time", xid) if mode == "timeline" else ""
        events[xid] = dict(fields, id=xid, cites=ids(x, "cites", sources, xid), factors=[], impacts=[])

    for fid, f in factors.items():
        xid = string(f, "x", fid)
        require(xid in events, f"{fid}.x 未登记：{xid}")
        fields = {k: string(f, k, fid) for k in ("name", "kind", "detail")}
        require(fields["kind"] in KINDS, f"{fid}.kind 必须是推动、制约或待查")
        series = string(f, "series", fid) if "series" in f else None
        if series:
            require(all(existing["series"] != series for existing in events[xid]["factors"]),
                    f"{xid} 下因素线 {series!r} 只能有一个站位")
        events[xid]["factors"].append(dict(fields, id=fid, series=series, cites=ids(
            f, "cites", sources, fid, empty=fields["kind"] == "待查")))

    for zid, z in impacts.items():
        xid = string(z, "x", zid)
        require(xid in events, f"{zid}.x 未登记：{xid}")
        related = ids(z, "factors", {f["id"] for f in events[xid]["factors"]}, zid)
        pending = z.get("pending")
        require(isinstance(pending, bool), f"{zid}.pending 必须是布尔值")
        require(pending or all(factors[fid]["kind"].strip() != "待查" for fid in related),
                f"{zid} 涉及待查因素，影响路径也必须标为待验证")
        claim = z.get("claim")
        cites = ids(z, "cites", sources, zid, empty=pending and claim is None)
        condition = string(z, "condition", zid)
        path = z.get("path")
        require(isinstance(path, list) and bool(path) and all(
            isinstance(step, str) and step.strip() for step in path
        ), f"{zid}.path 必须由非空文本组成")
        if claim is None and pending:
            result = "对研究主体的影响待验证"
            evidence = ""
        else:
            require(isinstance(claim, str) and claim in claims, f"{zid}.claim 未在 A2 登记：{claim!r}")
            row = claims[claim]
            supporting = set(re.findall(r"S\d{2,}", row[3]))
            require(bool(cites) and set(cites) <= supporting, f"{zid}.cites 必须对应 {claim} 的支持证据")
            result = _plain_text(row[1])
            evidence = _plain_text(row[5])
        require("result" not in z and "label" not in z, f"{zid} 的结果由 A2 提供，请删除 result 或 label")
        events[xid]["impacts"].append(dict(
            id=zid, factors=related, claim=claim, result=result, evidence=evidence,
            path=[step.strip() for step in path], condition=condition, cites=cites, pending=pending,
        ))

    lines = [line.strip() for line in report.splitlines() if line.strip()]
    meta = re.fullmatch(r">\s*研究问题\s*[:：]\s*(.+?)\s*\|\s*资料截止\s*[:：]\s*(\d{4}-\d{2}-\d{2})\s*\|.*", lines[1] if len(lines) > 1 else "")
    require(bool(meta), "报告缺少研究问题或资料截止日")
    return dict(title=_plain_text(lines[0].lstrip("#")), question=meta[1], cutoff=meta[2], mode=mode,
                events=list(events.values()))


def citation_links(cites: list[str], claim: str | None = None) -> str:
    if not cites and not claim:
        return "依据待查"
    links = [f'<a href="output.html#src-{value}">{value}</a>' for value in cites]
    if claim:
        links.append(f'<a href="output.html#claim-{claim}">{claim}</a>')
    return " · ".join(links)


def fallback(data: dict) -> str:
    def p(value: str) -> str:
        return f"<p>{html.escape(value)}</p>"

    def entry(node: dict, title: str, description: str, claim: str | None = None) -> str:
        return f'<h4>{html.escape(title)}</h4>{p(description)}<p>{citation_links(node["cites"], claim)}</p>'

    sections = []
    for event in data["events"]:
        heading = " · ".join(filter(None, (event["time"], event["title"])))
        sections.append(f"<section><h3>{html.escape(heading)}</h3>")
        sections.append(p(event["detail"]) + f'<p>{citation_links(event["cites"])}</p>')
        for factor in event["factors"]:
            sections.append(entry(factor, "Y · " + factor["name"], factor["kind"] + "。" + factor["detail"]))
        names = {f["id"]: f["name"] for f in event["factors"]}
        for impact in event["impacts"]:
            title = "Z · " + ("待验证 · " if impact["pending"] else "") + impact["result"]
            chain = " → ".join(impact["path"])
            description = "、".join(names[fid] for fid in impact["factors"]) + " → " + chain
            sections.append(entry(impact, title, description, impact["claim"]))
            sections.append(p("成立条件 " + impact["condition"]))
            if impact["evidence"]:
                sections.append(p(impact["evidence"]))
        sections.append("</section>")
    return "\n".join(sections)


def drawing_data(data: dict) -> dict:
    """Project the evidence-bound data onto the isometric camera."""
    palette = ("#3b5b76", "#4b6e55", "#96613e", "#7e4f63", "#2f6c6c", "#8a7b4c", "#5f536e")
    directions = {"推动": 1, "制约": -1, "待查": 0}
    xs, impacts, series = [], [], {}
    timeline = data["mode"] == "timeline"
    for event in data["events"]:
        xid = event["id"]
        xs.append({key: event[key] for key in ("id", "title", "time", "detail", "cites")})
        for factor in event["factors"]:
            name = factor["series"]
            key = (bool(name), name or factor["id"])
            if key not in series:
                index = len(series)
                series[key] = dict(id=f"F{index+1}", name=name or factor["name"],
                                   hex=palette[index % len(palette)], segs=[])
            series[key]["segs"].append(dict(
                id=factor["id"], x=xid, dir=directions[factor["kind"]],
                name=factor["name"], note=factor["detail"], cites=factor["cites"],
            ))
        paths = event["impacts"]
        label = paths[0]["result"] if paths else "影响待查"
        if len(paths) > 1:
            label += f" 等 {len(paths)} 条"
        impacts.append(dict(xid=xid, label=label, paths=paths,
                            pending=not paths or any(path["pending"] for path in paths)))
    return dict(xs=xs, impacts=impacts, factors=list(series.values()), timeline=timeline,
                question=data["question"], cutoff=data["cutoff"])


def render(data: dict, xyz_hash: str) -> str:
    template = TEMPLATE.read_text(encoding="utf-8")
    replacements = {
        "TITLE": html.escape(data["title"]),
        "QUESTION": html.escape(data["question"]),
        "CUTOFF": html.escape(data["cutoff"]),
        "DATA": json.dumps(drawing_data(data), ensure_ascii=False, allow_nan=False).replace("<", "\\u003c"),
        "FALLBACK": fallback(data),
        "REVISION": xyz_hash,
        "TOP": "时间俯视" if data["mode"] == "timeline" else "观察俯视",
        "XNAME": "转折节点" if data["mode"] == "timeline" else "观察节点",
    }
    return re.sub(r"@@([A-Z]+)@@", lambda match: replacements[match[1]], template)


def _extract_embedded_panorama(report_html_text: str) -> str:
    match = EMBEDDED_PANORAMA.search(report_html_text)
    require(match is not None, "报告 HTML 缺少内嵌全景图，请使用 build_report.py 重建")
    return match.group(1).replace("<\\/script>", "</script>")


def _verify_report_anchors(report_html_text: str, data: dict) -> None:
    for event in data["events"]:
        for cite in event["cites"]:
            require(f'id="src-{cite}"' in report_html_text, f"报告 HTML 缺少来源锚点：src-{cite}")
        for factor in event["factors"]:
            for cite in factor["cites"]:
                require(f'id="src-{cite}"' in report_html_text, f"报告 HTML 缺少来源锚点：src-{cite}")
        for impact in event["impacts"]:
            for cite in impact["cites"]:
                require(f'id="src-{cite}"' in report_html_text, f"报告 HTML 缺少来源锚点：src-{cite}")
            if impact["claim"]:
                require(f'id="claim-{impact["claim"]}"' in report_html_text,
                        f'报告 HTML 缺少判断锚点：claim-{impact["claim"]}')


def build(source: Path, report: Path, output: Path, *, check: bool = False) -> None:
    is_single_file_check = check and output.name == "output.html"
    report_html = output if is_single_file_check else output.parent / "output.html"
    if not is_single_file_check:
        require(output.name == "panorama.html", "输出文件名必须是 panorama.html（或 --check 时指定 output.html）")
    require(output not in {source, report}, "输出文件不能覆盖输入")
    require(not output.exists() or not any(output.samefile(path) for path in (source, report)), "输出文件不能覆盖输入")

    report_bytes = report.read_bytes()
    report_text = report_bytes.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    report_hash = hashlib.sha256(report_bytes).hexdigest()
    raw = source.read_bytes()
    xyz_hash = hashlib.sha256(raw).hexdigest()

    errors, _ = validate_markdown(report_text, report.parent)
    require(not errors, "\n".join(errors))
    data = load_panorama(raw, report_text)
    errors, _ = validate_manifest(report, report_html)
    require(not errors, "\n".join(errors))
    require(report_hash == sha256(report), "报告源稿已变化")

    manifest = json.loads(manifest_path(report_html).read_text(encoding="utf-8"))
    tracked = any((report.parent / dependency["path"]).resolve() == source and dependency["sha256"] == xyz_hash
                  for dependency in manifest["dependencies"])
    require(tracked, "报告没有绑定此版本 XYZ 数据，请先用 build_report.py 重建报告")

    built_report = report_html.read_text(encoding="utf-8")
    require(f'<meta name="xyz-sha256" content="{xyz_hash}">' in built_report,
            "报告 HTML 未绑定此版本全景图，请重建报告")
    _verify_report_anchors(built_report, data)

    page = render(data, xyz_hash)
    if check:
        embedded = _extract_embedded_panorama(built_report)
        require(embedded == page, "内嵌全景图与当前 XYZ 数据或报告不一致，请重建")
        if not is_single_file_check:
            require(output.read_text(encoding="utf-8") == page, "独立全景图与当前 XYZ 数据或报告不一致，请重建")
    else:
        with TemporaryDirectory(prefix=".panorama-build-", dir=output.parent) as work:
            staged = Path(work) / output.name
            staged.write_text(page, encoding="utf-8", newline="\n")
            fresh_errors, _ = validate_manifest(report, report_html)
            require(not fresh_errors and sha256(source) == xyz_hash and sha256(report) == report_hash
                    and json.loads(manifest_path(report_html).read_text(encoding="utf-8")) == manifest,
                    "构建期间数据或报告已修订，请重建")
            staged.replace(output)


def main() -> int:
    _configure_utf8_console()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument("--check", action="store_true", help="联合验收已生成的单文件报告（或独立全景图）")
    args = parser.parse_args()
    default_name = "output.html" if args.check else "panorama.html"
    output = args.output or args.report.with_name(default_name)
    try:
        build(args.data.resolve(), args.report.resolve(), output.resolve(), check=args.check)
    except (OSError, ValueError) as exc:
        print(f"[ERROR] {exc}")
        return 1
    print(f"[OK] {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
