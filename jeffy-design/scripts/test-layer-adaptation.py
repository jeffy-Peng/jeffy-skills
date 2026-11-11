from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];case=ROOT/'examples/layer-adaptation';source=json.loads((case/'input.json').read_text(encoding='utf-8'))
with sync_playwright() as w:
 b=w.chromium.launch(channel='msedge');p=b.new_page(viewport={'width':1340,'height':950},reduced_motion='reduce');errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto((case/'index.html').as_uri());p.wait_for_function('window.renderComplete===true');assert not errors,errors
 actual=p.locator('[data-module]').evaluate_all("ns=>ns.map(n=>({id:n.dataset.module,layers:n.dataset.membership.split(',')}))")
 assert {x['id']:x['layers'] for x in actual}=={x['id']:x['layers'] for x in source['modules']}
 assert len(actual)==10 and p.locator('[data-module=M]').count()==1
 assert p.locator('[data-layer]').count()==4 and p.locator('[data-group]').count()==2
 assert p.locator('[data-relation=R1]').count()==1
 def inside(a,b):return a['x']>=b['x'] and a['y']>=b['y'] and a['x']+a['w']<=b['x']+b['w'] and a['y']+a['h']<=b['y']+b['h']
 layers={x['id']:x for x in source['layers']};mods={x['id']:x for x in source['modules']}
 for g in source['groups']:
  assert inside(g,layers[g['layer']])
  for id in g['members']:assert inside(mods[id],g)
 for m in source['modules']:
  if len(m['layers'])==1:assert inside(m,layers[m['layers'][0]])
  else:
   for id in m['layers']:assert m['y']<layers[id]['y']+layers[id]['h'] and m['y']+m['h']>layers[id]['y']
 observed=p.evaluate('''()=>{const s=document.querySelector('svg'),texts=[...s.querySelectorAll('text')].map(n=>{let b=n.getBBox();return{text:n.textContent,x:b.x,y:b.y,w:b.width,h:b.height}});let collisions=[];for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){let a=texts[i],b=texts[j];if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)collisions.push([a.text,b.text])}return{collisions,outside:texts.filter(b=>b.x<0||b.y<0||b.x+b.w>1280||b.y+b.h>720)}}''')
 assert not observed['collisions'],observed;assert not observed['outside'],observed
 p.locator('svg').screenshot(path=str(case/'preview.png'));b.close()
report={'entityCount':len(actual),'layers':4,'groups':2,'crossLayerEntity':'M appears once; membership B,C','checks':['input/output IDs and membership','group containment','layer containment and cross-layer intersections','dependency presence','text collision','canvas overflow'],'result':'pass','scope':'一次结构重绘与规则检查；不是独立模型盲测或任意数据布局求解验证'}
(case/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print('Layer adaptation checks passed')
