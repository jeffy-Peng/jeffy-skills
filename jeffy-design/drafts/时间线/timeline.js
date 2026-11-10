
function renderTimeline(svg,input,opt={}){
 if(!input.events?.length)throw Error('请提供事件');
 const events=input.events.map((e,i)=>({...e,time:Date.parse(e.date),id:e.id||String(i)})).sort((a,b)=>a.time-b.time);
 if(events.some(e=>!Number.isFinite(e.time)||!e.title)||new Set(events.map(e=>e.id)).size!==events.length)throw Error('日期、标题和唯一 ID 需有效');
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const old=new Map([...svg.querySelectorAll('[data-key]')].map(n=>[n.dataset.key,Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))]));
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(tag,attrs,value)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(value!==undefined)n.textContent=value;svg.append(n);return n};
 const text=(key,x,y,value,size=16,anchor='start')=>add('text',{'data-key':key,x,y,'font-size':size,'text-anchor':anchor},value);
 const measure=value=>{const n=text('measure',0,0,value),w=n.getBBox().width;n.remove();return w};
 function wrap(value,width){let result=[],line='';for(const c of String(value||'')){if(measure(line+c)>width&&line){result.push(line);line=c}else line+=c}if(line)result.push(line);return result}
 const vertical=opt.direction==='vertical',min=events[0].time,max=events.at(-1).time,span=max-min;
 const fractions=events.map((e,i)=>opt.spacing==='equal'||span===0?i/Math.max(1,events.length-1):(e.time-min)/span);
 let length=650;
 for(let i=1;i<events.length;i++){const delta=fractions[i]-fractions[i-1];if(delta>0)length=Math.max(length,(vertical?145:240)/delta)}
 // 同一日期的事件合并在一个坐标，文字错开到不同侧。
 const width=vertical?950:length+180,height=vertical?length+160:420,start=80,axis=vertical?200:135;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label','时间线');
 add('line',{'data-key':'axis',x1:vertical?axis:start,y1:vertical?start:axis,x2:vertical?axis:start+length,y2:vertical?start+length:axis,stroke:'#999999','stroke-width':1.1});
 const seen=new Map();
 events.forEach((e,i)=>{
 const pos=start+fractions[i]*length,group=seen.get(pos)||0;seen.set(pos,group+1);
 const cx=vertical?axis:pos,cy=vertical?pos:axis;
 add('circle',{'data-key':'point-'+e.id,cx,cy,r:opt.focus===e.id?5:3.5,fill:opt.focus===e.id?'#222222':'#ffffff',stroke:'#555555','stroke-width':1.2});
 const tx=vertical?axis+30+group*320:cx,anchor=vertical?'start':i===events.length-1?'end':'start';
 const date=text('date-'+e.id,vertical?axis-24:cx,vertical?cy+5:cy-21,e.date,13,vertical?'end':anchor);date.setAttribute('fill','#777777');
 const titleY=vertical?cy+5:cy+37;
 text('title-'+e.id,tx,titleY,e.title,18,anchor);
 const desc=wrap(e.body||'',vertical?280:200);
 desc.forEach((line,j)=>{const n=text('body-'+e.id+'-'+j,tx,titleY+29+j*24,line,14,anchor);n.setAttribute('fill','#666666');n.style.opacity=opt.details?'1':'0';if(old.size&&!matchMedia('(prefers-reduced-motion: reduce)').matches)n.animate([{opacity:opt.details?0:1},{opacity:opt.details?1:0}],{duration:400})});
 });
 if(old.size&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const changes=[];svg.querySelectorAll('[data-key]').forEach(n=>{const p=old.get(n.dataset.key);if(!p)return;for(const key of ['x','y','x1','y1','x2','y2','cx','cy','r'])if(n.hasAttribute(key)&&p[key]!==undefined)changes.push({n,key,from:+p[key],to:+n.getAttribute(key)})});
 const startTime=performance.now();function frame(now){const t=Math.min(1,(now-startTime)/760),e=1-(1-t)**4;changes.forEach(a=>a.n.setAttribute(a.key,a.from+(a.to-a.from)*e));svg._frame=t<1?requestAnimationFrame(frame):null}frame(startTime)
 }
 return {width,height,events:events.length};
}
const sample={events:[{id:'a',date:'2026-01-01',title:'节点 A',body:'对应时间点的标准说明文本'},{id:'b',date:'2026-03-01',title:'节点 B',body:'对应时间点的标准说明文本'},{id:'c',date:'2026-06-01',title:'节点 C',body:'对应时间点的标准说明文本'},{id:'d',date:'2026-09-01',title:'节点 D',body:'对应时间点的标准说明文本'}]};
function refresh(){try{renderTimeline(document.querySelector('svg'),sample,{direction:document.querySelector('[name=direction]:checked').value,spacing:document.querySelector('[name=spacing]:checked').value,details:document.querySelector('[name=details]').checked});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
