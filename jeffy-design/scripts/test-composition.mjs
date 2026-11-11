import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadChromium,findChrome} from '../lib/browser.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(process.argv[2]||'composition-regression.json');mkdirSync(dirname(out),{recursive:true});
const baseline=JSON.parse(readFileSync(join(root,'tests/composition/pressure.json'),'utf8'));
const work=mkdtempSync(join(tmpdir(),'ppt-composition-'));
const cases=[
 ['three-pressure-pages',null,null],
 ['invalid-data',d=>d.pages[0].components[0].data.series[0].values=[1], 'DATA'],
 ['tight-slot',d=>{d.pages[0].components[0].box.width=85;d.pages[0].components[0].box.height=60},'CAPACITY'],
 ['overlap',d=>d.pages[0].text[0].box={...d.pages[0].components[0].box},'LAYOUT'],
 ['binding-mismatch',d=>d.pages[1].components[1].data.nodes[1].title='客户','BINDING'],
 ['missing-question',d=>delete d.pages[0].question,'CONTENT'],
 ['invalid-table',d=>d.pages[2].components[1].data.rows[0].pop(),'DATA'],
 ['long-label',d=>d.pages[2].components[0].data.data[0].label='非常长的方案名称'.repeat(12),'CAPACITY'],
];
const browser=await loadChromium().launch({executablePath:findChrome()}),results=[];
try{const page=await browser.newPage({viewport:{width:1340,height:900},reducedMotion:'reduce'});
for(const [name,mutate,expected]of cases){const d=structuredClone(baseline);mutate?.(d);const file=join(work,name+'.json'),html=join(work,name+'.html');writeFileSync(file,JSON.stringify(d));const built=spawnSync(process.execPath,[join(root,'scripts/build-composition.mjs'),file,html],{encoding:'utf8'});if(built.status!==0)throw Error(name+': '+built.stderr);
 const errors=[];const handler=e=>errors.push(e.message);page.on('pageerror',handler);await page.goto(pathToFileURL(html).href);await page.waitForFunction(()=>window.renderComplete===true,{},{timeout:20000});page.off('pageerror',handler);const pages=await page.evaluate(()=>window.validationReport),codes=pages.flatMap(p=>p.issues.map(v=>v.code));let pass=!errors.length&&(expected?codes.includes(expected):pages.every(p=>p.ok));
 if(!expected){const styleChecks=await page.evaluate(()=>{let cells=0,labels=0,ok=true;for(const frame of document.querySelectorAll('iframe')){const d=frame.contentDocument,w=frame.contentWindow;for(const c of d.querySelectorAll('th,td')){cells++;let s=w.getComputedStyle(c);ok=ok&&s.textAlign==='center'&&s.verticalAlign==='middle';}const mask=d.querySelector('mask[data-line-label-mask]');if(mask){const holes=[...mask.children].slice(1),texts=[...d.querySelectorAll('text[data-line-label]')];ok=ok&&holes.length===texts.length;for(let i=0;i<texts.length;i++){labels++;const b=texts[i].getBBox(),h=holes[i];ok=ok&&+h.getAttribute('x')<b.x&&+h.getAttribute('y')<b.y&&+h.getAttribute('x')+ +h.getAttribute('width')>b.x+b.width&&+h.getAttribute('y')+ +h.getAttribute('height')>b.y+b.height;}const originalSize=texts[0].getAttribute('font-size'),old=texts[0].getBBox().width;texts[0].setAttribute('font-size',parseFloat(w.getComputedStyle(texts[0]).fontSize)*1.5);w.updateLineLabelMasks(d.querySelector('svg'));ok=ok&&+mask.children[1].getAttribute('width')>old+14;texts[0].setAttribute('font-size',originalSize);w.updateLineLabelMasks(d.querySelector('svg'),7/Math.hypot(texts[0].getScreenCTM().a,texts[0].getScreenCTM().b));}}return{ok,cells,labels}});results.push({name:'table-centering-and-live-line-masks',pass:styleChecks.ok&&styleChecks.cells>0&&styleChecks.labels>0,...styleChecks});for(let i=0;i<pages.length;i++){const frameLoc=page.locator('.sheet').nth(i);await frameLoc.screenshot({path:join(dirname(out),'page-'+(i+1)+'.png')});}const measured=pages.flatMap(p=>p.components.flatMap(c=>c.regions||[]));const off=measured.filter(t=>Math.abs(t.fontSize-(t.expectedSize??14.5))>=.2||!Number.isFinite(t.fontSize));pass=pass&&measured.length>0&&off.length===0;}
 results.push({name,expected,pass,codes:[...new Set(codes)],browserErrors:errors});}
for(const [name,mutate]of [['invalid-box',d=>d.pages[0].components[0].box.width=-1],['duplicate-id',d=>d.pages[0].components[1].id=d.pages[0].components[0].id]]){const d=structuredClone(baseline);mutate(d);const file=join(work,name+'.json');writeFileSync(file,JSON.stringify(d));const p=spawnSync(process.execPath,[join(root,'scripts/build-composition.mjs'),file,join(work,name+'.html')],{encoding:'utf8'});results.push({name,pass:p.status!==0&&p.stderr.includes('CONTRACT'),expected:'CONTRACT'});}
const stats=baseline.pages[2].text.find(t=>t.id==='calculation').text;
const scores=[[95,90,70,85],[75,80,90,80],[70,70,95,75]].map(s=>s.reduce((a,v,i)=>a+v*[.4,.3,.2,.1][i],0));results.push({name:'arithmetic',pass:scores.every((v,i)=>Math.abs(v-baseline.pages[2].components.find(c=>c.id==='score').data.data[i].values[0])<1e-8)&&Math.abs(1500*150*.76/10000-17.1)<1e-8&&stats.includes('87.5')});
writeFileSync(out,JSON.stringify({results,scope:'自动检查数据、容量、碰撞、绑定、最终字号；表达完整性需另行人工复核',work},null,2));console.log(results.filter(r=>r.pass).length+'/'+results.length+' 项通过');if(results.some(r=>!r.pass))process.exitCode=1;
}finally{await browser.close()}
