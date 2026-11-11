import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadChromium,findChrome} from '../lib/browser.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(process.argv[2]||'adapters-validation.json');mkdirSync(dirname(out),{recursive:true});
const deck=JSON.parse(readFileSync(join(root,'tests/composition/extended.json'),'utf8')),all=deck.pages.flatMap(p=>p.components),work=mkdtempSync(join(tmpdir(),'ppt-adapters-')),cases=[];
function add(name,id,options={},change=null,expected=null){const c=structuredClone(all.find(x=>x.material===id));c.id='subject';c.box={x:64,y:170,width:1152,height:430};c.options={...c.options,...options};change?.(c);cases.push({name,c,expected})}
for(const dir of ['horizontal','vertical']){
 add('grouped-'+dir,'BAR-002',{direction:dir});
 for(const mode of ['value','percent'])add('stacked-'+dir+'-'+mode,'BAR-003',{direction:dir,mode});
 add('waterfall-'+dir,'BAR-006',{direction:dir});
 for(const spacing of ['time','equal'])add('timeline-'+dir+'-'+spacing,'TIME-001',{direction:dir,spacing});
 add('hierarchy-'+dir,'REL-001',{direction:dir});
}
add('six-categories-three-series','BAR-002',{},c=>{c.data.series=['X','Y','Z'];c.data.data=Array.from({length:6},(_,i)=>({label:String.fromCharCode(65+i),values:[12+i,8+i,4+i]}))});
add('stacked-zero-total','BAR-003',{mode:'percent'},c=>c.data.data=[{label:'A',values:[0,0]},{label:'B',values:[12,8]}]);
add('waterfall-negative-end','BAR-006',{},c=>c.data.data=[{label:'A',value:10},{label:'B',value:-30},{label:'C',value:5}]);
add('grouped-negative-rejected','BAR-002',{},c=>c.data.data[0].values[0]=-1,'DATA');
add('timeline-bad-date','TIME-001',{},c=>c.data.events[0].date='invalid','DATA');
add('timeline-duplicate-id','TIME-001',{},c=>c.data.events[1].id=c.data.events[0].id,'DATA');
add('hierarchy-empty-root','REL-001',{},c=>c.data.root={},'DATA');
add('hierarchy-small-slot','REL-001',{},c=>c.box={x:64,y:170,width:120,height:70},'CAPACITY');
add('grouped-small-slot','BAR-002',{},c=>c.box={x:64,y:170,width:100,height:60},'CAPACITY');
const browser=await loadChromium().launch({executablePath:findChrome()}),results=[];
try{const page=await browser.newPage({viewport:{width:1340,height:900},reducedMotion:'reduce'});
 for(const {name,c,expected}of cases){const input=join(work,name+'.json'),html=join(work,name+'.html');writeFileSync(input,JSON.stringify({theme:'mono',pages:[{id:name,title:'素材组装参数验证',question:'参数变化是否保持数据与布局正确？',claim:'本页只验证组件，不做业务判断。',readingOrder:['subject'],components:[c],source:'合成测试数据',speakerNotes:'核对原素材绘制结果与最终目标区域、字号。'}]}));const built=spawnSync(process.execPath,[join(root,'scripts/build-composition.mjs'),input,html],{encoding:'utf8'});if(built.status)throw Error(built.stderr);const errors=[],handler=e=>errors.push(e.message);page.on('pageerror',handler);await page.goto(pathToFileURL(html).href);await page.waitForFunction(()=>window.renderComplete===true);page.off('pageerror',handler);const report=await page.evaluate(()=>window.validationReport[0]),codes=report.issues.map(x=>x.code);let pass=!errors.length&&(expected?codes.includes(expected):report.ok);
 let invariant=null;if(!expected){const regions=report.components[0].regions||[];pass=pass&&regions.length>0&&regions.every(x=>Number.isFinite(x.fontSize)&&Math.abs(x.fontSize-(x.expectedSize??14.5))<.2);if(name==='stacked-zero-total'){invariant=regions.some(x=>x.text==='无占比');pass=pass&&invariant}if(name.startsWith('waterfall')){const sum=c.data.data.reduce((a,b)=>a+b.value,0);invariant=regions.some(x=>x.text===String(sum));pass=pass&&invariant}}
 results.push({name,material:c.material,expected,pass,codes:[...new Set(codes)],invariant,errors});
 }
 writeFileSync(out,JSON.stringify({results,scope:'参数与异常输入、固定主题字号、零总量和瀑布累计；静态适配，不验证整页动效'},null,2));console.log(results.filter(x=>x.pass).length+'/'+results.length+' 项通过');if(results.some(x=>!x.pass)){console.log(results.filter(x=>!x.pass));process.exitCode=1}
}finally{await browser.close()}
