from pathlib import Path
import json
from playwright.sync_api import sync_playwright
r=Path(__file__).resolve().parents[1];d=r/'drafts/机制表达审核';report=[]
with sync_playwright() as w:
 b=w.chromium.launch(channel='msedge');p=b.new_page(viewport={'width':1300,'height':1000},reduced_motion='reduce');errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 for id in ['FLOW-002','REL-004','SEQ-001']:
  p.goto((d/(id+'.html')).as_uri());p.wait_for_timeout(80);assert not errors,errors;assert not p.locator('#error').inner_text();p.screenshot(path=str(d/(id+'.png')),full_page=True)
  for label in p.locator('label').all():label.click();p.wait_for_timeout(50);assert not p.locator('#error').inner_text()
  report.append({'id':id,'initialAndControls':'pass'})
 (r/'tests/composition/mechanism-inputs.json').write_text(json.dumps(p.evaluate('samples'),ensure_ascii=False,indent=2),encoding='utf-8')
 tests=p.evaluate('''()=>{let r=[];function reject(n,data){let caught=false;try{renderMechanism(svg,data)}catch(e){caught=true}r.push({name:n,pass:caught})}reject('empty layers',{kind:'layers',layers:[]});reject('unknown participant',{kind:'sequence',participants:[{id:'a',title:'A'}],messages:[{from:'a',to:'x',label:'X'}]});reject('duplicate participants',{kind:'sequence',participants:[{id:'a',title:'A'},{id:'a',title:'B'}],messages:[{from:'a',to:'a',label:'X'}]});reject('bad lane',{kind:'swimlane',lanes:[{id:'a',title:'A'}],nodes:[{id:'b',lane:'x',step:0,title:'B'}],edges:[]});return r}''');assert all(t['pass'] for t in tests);report+=tests;b.close()
(d/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print('7 checks passed')
