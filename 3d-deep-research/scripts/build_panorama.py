#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 xyz.json 生成一份独立可打开的全景图 HTML。

用法
  python build_panorama.py xyz.json -o panorama.html
  python build_panorama.py xyz.json --check

数据契约见 references/panorama.md，模板是 assets/panorama-template.html。
"""
import argparse
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, '..', 'assets', 'panorama-template.html')
START = '/*__XYZ_DATA_START__*/'
END = '/*__XYZ_DATA_END__*/'
SCALES = {'短周期', '中周期', '长周期'}
TIERS = {'弱', '中', '强'}
CONFS = {'high', 'medium', 'low'}
CITE_RE = re.compile(r'^S\d{2}$')
CLAIM_RE = re.compile(r'^C\d{2}$')
HEX_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def validate(d):
    errors, warnings = [], []
    for k in ('subject', 'question', 'cutoff'):
        if not isinstance(d.get(k), str) or not d.get(k).strip():
            errors.append('缺少 %s' % k)

    xs = d.get('xs') or []
    factors = d.get('factors') or []
    impacts = d.get('impacts') or []
    if not isinstance(xs, list) or not xs:
        errors.append('xs 必须是非空数组')
        return errors, warnings
    if not isinstance(factors, list) or not factors:
        errors.append('factors 必须是非空数组')
        return errors, warnings

    ids = [x.get('id') for x in xs]
    if len(set(ids)) != len(ids):
        errors.append('xs 的 id 有重复')
    for x in xs:
        for k in ('id', 'time', 'title'):
            if not isinstance(x.get(k), str) or not x.get(k).strip():
                errors.append('转折 %s 缺 %s' % (x.get('id'), k))
        if not isinstance(x.get('cites'), list) or not x.get('cites'):
            warnings.append('转折 %s 没有来源编号' % x.get('id'))

    fids = [f.get('id') for f in factors]
    if len(set(fids)) != len(fids):
        errors.append('factors 的 id 有重复')
    for f in factors:
        fid = f.get('id')
        if not isinstance(f.get('name'), str) or not f.get('name').strip():
            errors.append('因素 %s 缺 name' % fid)
        if not HEX_RE.match(f.get('hex') or ''):
            errors.append('因素 %s 的 hex 必须是 #rrggbb' % fid)
        segs = f.get('segs') or []
        if not segs:
            errors.append('因素 %s 没有站位' % fid)
        for s in segs:
            where = '%s@%s' % (fid, s.get('x'))
            if s.get('x') not in ids:
                errors.append('%s 的 x 不在 xs 里' % where)
            if s.get('dir') not in (1, -1, 0):
                errors.append('%s 的 dir 必须是 1 / -1 / 0' % where)
            w = s.get('w')
            if not isinstance(w, (int, float)) or isinstance(w, bool) or not (0 < w <= 1.2):
                errors.append('%s 的 w 必须在 0 到 1.2 之间' % where)
            if s.get('scale') not in SCALES:
                errors.append('%s 的 scale 必须是 短周期 / 中周期 / 长周期' % where)
            if s.get('cite') and not CITE_RE.match(s['cite']):
                errors.append('%s 的 cite 必须形如 S01' % where)

    covered = {}
    for im in impacts:
        xid = im.get('xid')
        if xid not in ids:
            errors.append('影响记录 %s 的 xid 不在 xs 里' % xid)
        if xid in covered:
            errors.append('%s 有两条影响记录' % xid)
        covered[xid] = True
        if im.get('tier') not in TIERS:
            errors.append('%s 的 tier 必须是 弱 / 中 / 强' % xid)
        if im.get('conf') not in CONFS:
            errors.append('%s 的 conf 必须是 high / medium / low' % xid)
        if im.get('c') and not CLAIM_RE.match(im['c']):
            errors.append('%s 的 c 必须形如 C01' % xid)
        path = im.get('path')
        if not isinstance(path, list) or len(path) < 2:
            warnings.append('%s 的 path 少于两步' % xid)
        for c in (im.get('cites') or []):
            if not CITE_RE.match(c):
                errors.append('%s 的 cites 里有非法编号 %s' % (xid, c))

    for x in ids:
        if x not in covered:
            errors.append('%s 没有影响记录' % x)
        n = sum(1 for f in factors for s in (f.get('segs') or []) if s.get('x') == x)
        if n == 0:
            warnings.append('%s 没有任何因素' % x)

    if len(xs) > 8:
        warnings.append('转折有 %d 个，标签会更密，建议拆成两张' % len(xs))
    if len(factors) > 8:
        warnings.append('因素有 %d 个，轴距可能挤，建议合并次要因素' % len(factors))
    return errors, warnings


def build(data_path, out_path, template):
    with open(data_path, encoding='utf-8') as fh:
        data = json.load(fh)
    errors, warnings = validate(data)
    for w in warnings:
        print('[WARN] %s' % w)
    if errors:
        for e in errors:
            print('[ERROR] %s' % e)
        raise SystemExit('数据校验没过，没有生成文件')

    with open(template, encoding='utf-8') as fh:
        page = fh.read()
    if START not in page or END not in page:
        raise SystemExit('模板里找不到数据占位符')

    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    payload = payload.replace('</', '<\\/')
    block = START + '\nconst DATA = ' + payload + ';\n' + END
    i = page.index(START)
    j = page.index(END) + len(END)
    page = page[:i] + block + page[j:]

    subject = html.escape(data['subject'], quote=False)
    page = re.sub(r'<title>.*?</title>', '<title>XYZ 三维分析画布 · %s</title>' % subject, page, count=1, flags=re.S)
    page = re.sub(r'<p class="corner-label">.*?</p>', '<p class="corner-label">结构演示 · %s</p>' % subject, page, count=1, flags=re.S)

    with open(out_path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(page)

    segs = sum(len(f.get('segs') or []) for f in data['factors'])
    print('[OK] %s' % out_path)
    print('  转折 %d，因素 %d，站位 %d，影响 %d' % (len(data['xs']), len(data['factors']), segs, len(data['impacts'])))


def main():
    ap = argparse.ArgumentParser(description='从 xyz.json 生成全景图 HTML')
    ap.add_argument('data', help='xyz.json 路径')
    ap.add_argument('-o', '--output', default='panorama.html', help='输出 HTML，默认 panorama.html')
    ap.add_argument('--check', action='store_true', help='只校验数据，不生成文件')
    ap.add_argument('--template', default=TEMPLATE, help='模板路径')
    args = ap.parse_args()

    if args.check:
        with open(args.data, encoding='utf-8') as fh:
            data = json.load(fh)
        errors, warnings = validate(data)
        for w in warnings:
            print('[WARN] %s' % w)
        for e in errors:
            print('[ERROR] %s' % e)
        if errors:
            raise SystemExit(1)
        print('[OK] 数据校验通过')
        return
    build(args.data, args.output, args.template)


if __name__ == '__main__':
    main()
