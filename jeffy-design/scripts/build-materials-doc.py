# 把全部素材的 md 与目录描述排成一份 docx 与 HTML，方便离线阅读。
# 用法: npm run materials-doc  或  python scripts/build-materials-doc.py 输出.docx
import json, re, sys
from pathlib import Path
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1] if len(sys.argv) > 1 else root / 'build/materials.docx')
catalog = {e['id']: e for e in json.loads((root / 'assets/catalog.json').read_text(encoding='utf-8'))['entries']}

doc = Document()
style = doc.styles['Normal']
style.font.name = 'Noto Serif SC'
style.font.size = Pt(10.5)
style.element.rPr.rFonts.set(qn('w:eastAsia'), 'Noto Serif SC')
for s in ('Heading 1', 'Heading 2'):
    st = doc.styles[s]
    st.font.name = 'Noto Serif SC'
    st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Noto Serif SC')
    st.font.color.rgb = RGBColor(0x1A, 0x1A, 0x1A)

def para(text, size=10.5, bold=False, color=None, space=4):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.size = Pt(size); r.bold = bold
    r.font.name = 'Noto Serif SC'
    r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Noto Serif SC')
    if color: r.font.color.rgb = RGBColor(*color)
    p.paragraph_format.space_after = Pt(space)
    return p

def field(label, value):
    p = doc.add_paragraph()
    r1 = p.add_run(label + '  ')
    r1.bold = True; r1.font.size = Pt(9.5)
    r1.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
    r1.font.name = 'Noto Serif SC'; r1._element.rPr.rFonts.set(qn('w:eastAsia'), 'Noto Serif SC')
    r2 = p.add_run(str(value))
    r2.font.size = Pt(9.5)
    r2.font.name = 'Noto Serif SC'; r2._element.rPr.rFonts.set(qn('w:eastAsia'), 'Noto Serif SC')
    p.paragraph_format.space_after = Pt(1)
    return p

def md_blocks(text):
    body = text.split('---', 2)[2]
    lines = [l.rstrip() for l in body.split('\n')]
    blocks, cur = [], None
    for l in lines:
        if l.startswith('# '):
            continue
        if l.startswith('## '):
            if cur: blocks.append(cur)
            cur = {'title': l[3:].strip(), 'lines': []}
        elif cur is not None:
            cur['lines'].append(l)
    if cur: blocks.append(cur)
    return blocks

ids = sorted(p.stem for p in (root / 'assets/materials').glob('*.md'))
doc.add_heading('jeffy-design 素材规范', level=1)
para(f'{len(ids)} 条素材，一条一页。每页含头部字段、目录描述、语义、绘制、可调整、不适用规则、验收与示意图。', 9.5, color=(0x66,0x66,0x66))
for mid in ids:
    md = (root / f'assets/materials/{mid}.md').read_text(encoding='utf-8')
    head = dict(re.findall(r'^(\w+): (.+)$', md.split('---')[2] if False else md.split('---')[1], re.M))
    e = catalog.get(mid, {})
    doc.add_page_break()
    doc.add_heading(f"{mid}  {head.get('name','')}", level=1)
    field('形态', head.get('form','') + '　原型 ' + head.get('archetype','') + '　形状 ' + head.get('shape','') + '　分级 ' + head.get('tier',''))
    impl = 'engine（代码实现，进基线）' if e.get('status','').find('自动组装') >= 0 else 'model（只写规范，模型绘制）'
    field('实现', impl + '　可调项：' + ', '.join(e.get('options') or []))
    field('问题', e.get('question',''))
    field('最低输入', e.get('minimumInput',''))
    field('参数', e.get('parameters',''))
    field('边界', e.get('limits',''))
    field('覆盖', e.get('standardCoverage',''))
    for b in md_blocks(md):
        doc.add_heading(b['title'], level=2)
        buf = []
        for l in b['lines'] + ['']:
            if l.strip().startswith('![') or l.strip().startswith('`npm run'):
                if buf: para('\n'.join(buf).strip()); buf = []
                if l.strip().startswith('!['):
                    img = root / 'assets/materials' / re.search(r'\((.+?)\)', l).group(1)
                    if img.exists():
                        doc.add_picture(str(img), width=Cm(14))
                        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                continue
            if not l.strip():
                if buf: para('\n'.join(buf).strip()); buf = []
            else: buf.append(l)
doc.save(out)

# 同时出一份 HTML，方便在浏览器里看和截图。
import html as H
parts = ['<!doctype html><meta charset="utf-8"><style>',
         'body{width:900px;margin:40px auto;font:15px/1.8 "Noto Serif SC",serif;color:#1A1A1A}',
         'h1{font-size:24px;margin:28px 0 10px;border-bottom:1px solid #E5E5E5;padding-bottom:6px}',
         'h2{font-size:16px;margin:16px 0 6px;color:#002FA7}',
         '.meta{font-size:12.5px;color:#666;margin:2px 0}.meta b{color:#333;font-weight:600}',
         'p{margin:6px 0}img{width:100%;border:1px solid #eee;margin:10px 0}',
         f'</style><h1>jeffy-design 素材规范</h1><p class=meta>{len(ids)} 条素材，一条一页。</p>']
for mid in ids:
    md = (root / f'assets/materials/{mid}.md').read_text(encoding='utf-8')
    head = dict(re.findall(r'^(\w+): (.+)$', md.split('---')[1], re.M))
    e = catalog.get(mid, {})
    parts.append(f'<h1>{mid} {H.escape(head.get("name",""))}</h1>')
    for k, v in [('形态', f'{head.get("form","")}　原型 {head.get("archetype","")}　形状 {head.get("shape","")}'),
                 ('实现', 'engine' if '自动组装' in e.get('status','') else 'model'),
                 ('问题', e.get('question','')), ('最低输入', e.get('minimumInput','')),
                 ('参数', e.get('parameters','')), ('边界', e.get('limits',''))]:
        parts.append(f'<p class=meta><b>{k}</b>　{H.escape(str(v))}</p>')
    for b in md_blocks(md):
        parts.append(f'<h2>{H.escape(b["title"])}</h2>')
        txt = [l for l in b['lines'] if l.strip() and not l.strip().startswith(('![', '`npm run'))]
        for l in txt: parts.append(f'<p>{H.escape(l)}</p>')
        for l in b['lines']:
            m = re.match(r'!\[(.*?)\]\((.+?)\)', l.strip())
            if m:
                img = (root / 'assets/materials' / m.group(2)).resolve()
                if img.exists(): parts.append(f'<img src="file://{img}">')
            if l.strip().startswith('`npm run'):
                parts.append(f'<p class=meta>{H.escape(l.strip())}</p>')
htmlOut = out.with_suffix('.html')
htmlOut.write_text('\n'.join(parts), encoding='utf-8')
print('写出', out, out.stat().st_size, '字节；', htmlOut, htmlOut.stat().st_size, '字节；', len(ids), '条素材')
