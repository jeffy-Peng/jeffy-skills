from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from _browser import find_chrome
ROOT=Path(__file__).resolve().parents[1];case=ROOT/'examples/cross-material-adaptation';data=json.loads((case/'input.json').read_text(encoding='utf-8'))
with sync_playwright() as w:
 b=w.chromium.launch(executable_path=find_chrome());p=b.new_page(viewport={'width':1340,'height':950},reduced_motion='reduce');errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto((case/'index.html').as_uri());p.wait_for_function('window.renderComplete===true');assert not errors,errors
 report=[]
 for id in ['flow','bar','sequence']:
  s=p.locator('svg#'+id);s.screenshot(path=str(case/(id+'.png')))
  observed=s.evaluate('''s=>{let texts=[...s.querySelectorAll('text')].filter(t=>t.textContent).map(t=>{let b=t.getBBox();return{text:t.textContent,x:b.x,y:b.y,w:b.width,h:b.height}}),collisions=[];for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){let a=texts[i],b=texts[j];if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)collisions.push([a.text,b.text])}return {collisions,outside:texts.filter(b=>b.x<0||b.y<0||b.x+b.w>1280||b.y+b.h>720)}}''')
  report.append({'page':id,**observed})
 flow=p.locator('#flow');assert flow.locator('[data-flow-node]').count()==len(data['flow']['nodes'])
 for e in data['flow']['edges']:assert flow.locator('[data-relation="'+e['id']+'"]').count()==1
 for n in data['flow']['nodes']:
  if n['type']=='decision':
   outgoing=[e for e in data['flow']['edges'] if e['source']==n['id']];assert len(outgoing)==2;assert any(e['label'].startswith('是') for e in outgoing) and any(e['label'].startswith('否') for e in outgoing)
 assert next(n for n in data['flow']['nodes'] if n['id']=='retry')['title']=='未受理且未重试？'
 bars=p.locator('#bar [data-bar]').evaluate_all("ns=>ns.map(n=>({id:n.dataset.bar,value:+n.dataset.value,x:+n.getAttribute('x'),width:+n.getAttribute('width')}))")
 assert len(bars)==len(data['bar']['rows']);assert all(abs(a['width']-5*b['value'])<1e-6 and a['x']==370 for a,b in zip(bars,data['bar']['rows']))
 assert p.locator('#sequence [data-message]').count()==len(data['sequence']['messages'])
 assert p.locator('#sequence [data-participant]').count()==3
 for row in data['bar']['rows']:
  assert ''.join(p.locator('[data-category="'+row['id']+'"]').all_text_contents())==row['label']
  assert ''.join(p.locator('[data-reason="'+row['id']+'"]').all_text_contents())==row['reason']
 participants={x['id']:x['x'] for x in data['sequence']['participants']}
 for m in data['sequence']['messages']:
  n=p.locator('[data-message="'+m['id']+'"]');assert n.get_attribute('d')==f"M{participants[m['source']]} {m['y']}H{participants[m['target']]}"
  assert (n.get_attribute('stroke-dasharray') is not None)==bool(m.get('return'))
 assert [m['y'] for m in data['sequence']['messages']]==sorted(m['y'] for m in data['sequence']['messages'])
 assert data['sequence']['messages'][4]['guard']=='未受理且尚未重试'
 covered=p.evaluate("""()=>[...document.querySelectorAll('svg')].every(s=>{const labels=[...s.querySelectorAll('text[data-line-label],text[data-node-description]')];if(!labels.length)return true;const m=s.querySelector('mask[data-line-label-mask]');if(!m)return false;const holes=[...m.children].slice(1);return labels.every(n=>{let b=n.getBBox();return holes.some(h=>+h.getAttribute('x')<=b.x&&+h.getAttribute('y')<=b.y&&+h.getAttribute('x')+ +h.getAttribute('width')>=b.x+b.width&&+h.getAttribute('y')+ +h.getAttribute('height')>=b.y+b.height)})})""")
 assert covered

 b.close()
(case/'geometry-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False));assert all(not x['collisions'] and not x['outside'] for x in report)

summary=case/"validation.json"
if summary.exists():
 doc=json.loads(summary.read_text(encoding="utf-8"));doc["automated"]["result"]="pass";summary.write_text(json.dumps(doc,ensure_ascii=False,indent=2),encoding="utf-8")
