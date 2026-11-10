"""Build the single Catalog from catalog.json; verify references without promoting status."""
from pathlib import Path
from html import escape
from html.parser import HTMLParser
from collections import Counter
from urllib.parse import unquote,urlsplit
import json,re
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets'
def build():
 data=json.loads((ASSETS/'catalog.json').read_text(encoding='utf-8'))
 adapters=json.loads((ROOT/'lib/composition/adapters.json').read_text(encoding='utf-8'))
 engine=json.loads((ROOT/'lib/page-engine/catalog.json').read_text(encoding='utf-8'))
 engine_ids={x['id'] for x in engine['components']}
 ids=[e['id'] for e in data['entries']]
 if len(ids)!=len(set(ids)):raise ValueError('重复素材 ID')
 def link(path,name):return f'<a href="{escape(path,quote=True)}">{escape(name)}</a>'
 rows=[];references=[];missing=[]
 for e in data['entries']:
  for path in [s['path'] for s in e['sheets']]+e['sources']+e['evidence']:
   references.append(path)
   if not (ASSETS/path).is_file():missing.append(path)
  combo=[]
  if e['id'] in adapters:combo.append('区域组装：已接入（黑白灰、静态）'+('；'+adapters[e['id']]['sheet'] if adapters[e['id']].get('sheet') else ''))
  if e['id'] in engine_ids:combo.append('同绘图区：已接入')
  if not combo:combo=['尚未接入统一组装；可用独立源件']
  preview='<br>'.join(link(x['path'],x['name']) for x in e['sheets'])
  source='<br>'.join(link(x,Path(x).name) for x in e['sources']) or '源代码在预览内'
  evidence='<br>'.join(link(x,Path(x).name) for x in e['evidence']) or '无独立验证记录；需补核'
  aliases=('旧编号：'+', '.join(e['aliases'])) if e['aliases'] else ''
  values=[f'<b>{escape(e["id"])}</b><small>{escape(aliases)}</small>',escape(e['purpose']),escape(e['form']),escape(e['question']),escape(e['minimumInput']),escape(e['parameters']),preview+'<details><summary>源件</summary>'+source+'</details>',escape(e['status']),'<br>'.join(escape(x) for x in combo),evidence+'<small>'+escape(e['limits'])+'</small>']
  rows.append('<tr data-entry="'+e['id']+'">'+''.join('<td>'+v+'</td>' for v in values)+'</tr>')
 counts={'entries':len(ids),'drafts':sum(e['status'].startswith('草稿') for e in data['entries']),'composition':len(set(ids)&set(adapters)),'samePlot':len(set(ids)&engine_ids)}
 css='''*{box-sizing:border-box}body{margin:32px;color:#222;background:#fff;font:15px/1.7 Georgia,"Noto Serif SC",serif}h1{font-size:30px;font-weight:400;margin-bottom:8px}p{max-width:1150px}.summary{display:flex;gap:28px;flex-wrap:wrap;padding:14px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd}input{font:inherit;border:1px solid #aaa;padding:10px 14px;width:470px;max-width:100%;margin:20px 0}.scroll{overflow:auto;max-height:78vh;border:1px solid #ddd}table{border-collapse:separate;border-spacing:0;min-width:2100px;width:100%;table-layout:fixed}th,td{text-align:center;vertical-align:middle;padding:13px 10px;border-right:1px solid #eee;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th{position:sticky;top:0;background:#f3f3f3;z-index:2;font-weight:600}th:first-child,td:first-child{position:sticky;left:0;background:white;z-index:1}th:first-child{z-index:3;background:#f3f3f3}small{display:block;color:#666;font-size:12px;margin-top:8px}a{color:#222;text-underline-offset:3px}summary{cursor:pointer}details{margin-top:8px}tr[hidden]{display:none}.muted{color:#666}col:nth-child(1){width:130px}col:nth-child(2){width:110px}col:nth-child(3){width:130px}col:nth-child(4){width:200px}col:nth-child(5){width:220px}col:nth-child(6){width:200px}col:nth-child(7){width:190px}col:nth-child(8){width:180px}col:nth-child(9){width:240px}col:nth-child(10){width:280px}'''
 html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>素材 Catalog</title><style>'+css+'</style><h1>素材 Catalog · 简洁线条</h1><p>每行一个组件，方案挂在同一行；方向、数量、百分比模式通过参数生成。黑白灰基准，入库状态与组合能力分别记录。</p><div class="summary">'+f'<span>{counts["entries"]} 个组件条目</span><span>{counts["drafts"]} 份未入库草稿</span><span>{counts["composition"]} 项接入区域组装</span><span>{counts["samePlot"]} 项接入同绘图区</span></div><p class="muted">“旧验收待核对”表示原目录状态尚未形成统一结论，不等于新发现故障。历史验证记录不代表最新代码全部重验。所有条目默认展开；表格可横向滚动查看右侧能力与证据。</p><label>查找素材 <input id="search" type="search" placeholder="输入 ID、问题、形态或旧编号" aria-label="查找素材"></label><span id="count"></span><div class="scroll"><table><colgroup>'+'<col>'*10+'</colgroup><thead><tr>'+''.join('<th>'+h+'</th>' for h in ['素材 ID','一级用途','二级形态','适合解释什么','最低输入','可配置参数','方案与源件','登记状态','组合能力','验证证据与边界'])+'</tr></thead><tbody>'+''.join(rows)+'</tbody></table></div><p>'+link('catalog.json','机器可读目录')+' · '+link('catalog-audit.json','文件与引用核对记录')+' · '+link('../references/页面组装.md','组装调用与验收规则')+'</p><script>const rows=[...document.querySelectorAll("tbody tr")];const input=document.querySelector("#search");function update(){let q=input.value.trim().toLowerCase(),n=0;for(const r of rows){r.hidden=!r.textContent.toLowerCase().includes(q);if(!r.hidden)n++}document.querySelector("#count").textContent=n+" / "+rows.length+" 项"}input.addEventListener("input",update);update()</script></html>'
 (ASSETS/'index.html').write_text(html,encoding='utf-8')
 (ASSETS/'索引.md').write_text('''# Catalog · 素材目录

[打开统一目录](index.html)。每行一个组件，一级用途与二级形态检索，多款方案挂同一条目；不把横纵方向、数量、百分比参数另算素材。

唯一维护源为 [catalog.json](catalog.json)，HTML 由 `python scripts/build-catalog.py` 生成。登记状态与组合能力分别记录，组合范围从两个引擎的登记文件派生，不能因独立素材入库而推定已支持组装。

- 区域组装：lib/composition/adapters.json；目前黑白灰静态分支。
- 同绘图区：lib/page-engine/catalog.json；柱线共同坐标体系。
- 旧编号保留为别名，历史重定向与草稿文件保留，不重复登记。
- 草稿明确未入库；旧状态不统一者待核对，不自动升级。
- 已存验证记录只代表其覆盖范围；本轮目录整理不等于全库重新验收。

[文件与引用核对记录](catalog-audit.json)；[页面组装与验收](../references/页面组装.md)。
''',encoding='utf-8')
 registered={str((ASSETS/s['path']).resolve()) for e in data['entries'] for s in e['sheets']}
 legacy=[]
 for file in ASSETS.rglob('*.html'):
  if file.name=='index.html' or str(file.resolve()) in registered:continue
  content=file.read_text(encoding='utf-8');m=re.search(r'http-equiv="refresh"[^>]*content="[^"]*url=([^";]+)',content)
  legacy.append({'path':str(file.relative_to(ASSETS)).replace('\\','/'),'classification':'历史跳转入口' if m else '未登记独立预览，需核对','target':m[1] if m else None})
 # Check the script dependencies of all registered preview files.
 class Scripts(HTMLParser):
  def __init__(self):super().__init__();self.sources=[]
  def handle_starttag(self,t,a):
   if t=='script' and dict(a).get('src'):self.sources.append(dict(a)['src'])
 dependencies=[]
 for file in registered:
  file=Path(file);p=Scripts();p.feed(file.read_text(encoding='utf-8'))
  for src in p.sources:
   if urlsplit(src).scheme:continue
   ok=(file.parent/unquote(src)).is_file();dependencies.append({'preview':str(file.relative_to(ROOT)),'script':src,'exists':ok})
   if not ok:missing.append(str(file.parent/src))
 audit={'updated':data['updated'],'counts':counts,'referencesChecked':len(references),'missing':missing,'dependencies':dependencies,'legacyPreviews':legacy,'draftCopies':'同ID的历史草稿不重复登记；BAR-004并入BAR-002；TREE-001为REL-001方案文件。','scope':'文件、引用和登记核对；不代表全库数据、动效或语义回归'}
 (ASSETS/'catalog-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
 if missing:raise ValueError('引用缺失：'+str(missing))
 print(json.dumps(counts,ensure_ascii=False));print('References and preview dependencies valid')
if __name__=='__main__':build()
