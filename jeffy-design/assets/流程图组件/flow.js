
function renderFlow(svg,input,opt={}){
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const oldWidth=svg.viewBox.baseVal.width||1,oldHeight=svg.viewBox.baseVal.height||1;
 const old=[...svg.children].filter(n=>n.tagName!=='defs').map(n=>{
 const attrs=Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]));
 let points=null;
 if(n.tagName==='path'){const length=n.getTotalLength();points=Array.from({length:41},(_,i)=>{const p=n.getPointAtLength(length*i/40);return [p.x,p.y]})}
 return {tag:n.tagName,attrs,points};
 });
 const ns='http://www.w3.org/2000/svg';
 if(!input.nodes?.length||!Array.isArray(input.edges))throw Error('需要 nodes 与 edges');
 const ids=new Set(input.nodes.map(n=>n.id));
 if(ids.size!==input.nodes.length||input.nodes.some(n=>!n.id||!n.title||!['start','end','process','decision'].includes(n.type)))throw Error('节点 ID 须唯一，类型为 start/end/process/decision');
 if(input.edges.some(e=>!ids.has(e.from)||!ids.has(e.to)))throw Error('连接引用了不存在的节点');
 svg.replaceChildren();
 const add=(t,a,v)=>{const n=document.createElementNS(ns,t);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(x,y,v,size=16)=>add('text',{x,y,'font-size':size,'text-anchor':'middle'},v);
 const measure=v=>{const n=text(0,0,v),w=n.getBBox().width;n.remove();return w};
 const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');svg.append(defs);defs.append(marker);
 for(const[k,v]of Object.entries({id:'flow-tip',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto',markerUnits:'userSpaceOnUse'}))marker.setAttribute(k,v);
 const tip=document.createElementNS(ns,'path');tip.setAttribute('d','M1 1 L7 4 L1 7 Z');tip.setAttribute('fill','#777777');marker.append(tip);
 const nodes=new Map(input.nodes.map(n=>[n.id,{...n,rank:0}]));
 // 反馈边明确标记，不参与主流程层级计算。
 const forward=input.edges.filter(e=>!e.feedback);
 const indegree=new Map(input.nodes.map(n=>[n.id,forward.filter(e=>e.to===n.id).length]));
 let queue=[...nodes.values()].filter(n=>indegree.get(n.id)===0),visited=0;
 while(queue.length){const n=queue.shift();visited++;for(const e of forward.filter(e=>e.from===n.id)){const t=nodes.get(e.to);t.rank=Math.max(t.rank,n.rank+1);indegree.set(t.id,indegree.get(t.id)-1);if(!indegree.get(t.id))queue.push(t)}}
 if(visited!==nodes.size)throw Error('循环中的返回边需标记 feedback:true');
 const vertical=opt.direction==='vertical',boxW=Math.max(150,...input.nodes.map(n=>measure(n.title)+44)),boxH=70;
 const nodeW=Math.max(boxW,170),nodeH=100,rankCount=Math.max(...[...nodes.values()].map(n=>n.rank))+1;
 const levels=Array.from({length:rankCount},(_,i)=>[...nodes.values()].filter(n=>n.rank===i)),crossCount=Math.max(...levels.map(v=>v.length));
 const width=vertical?Math.max(800,100+crossCount*(nodeW+70)):Math.max(960,100+rankCount*(nodeW+100));
 const height=vertical?140+rankCount*(nodeH+90):Math.max(420,150+crossCount*(nodeH+100));
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',input.title);
 levels.forEach((level,rank)=>level.forEach((n,i)=>{
 n.w=n.type==='decision'?nodeW:boxW;n.h=n.type==='decision'?nodeH:boxH;
 n.cx=vertical?width/2+(i-(level.length-1)/2)*(nodeW+70):65+nodeW/2+rank*(nodeW+100);
 n.cy=vertical?105+nodeH/2+rank*(nodeH+90):height/2+(i-(level.length-1)/2)*(nodeH+100);
 }));
 function edgePath(e,index){
 const f=nodes.get(e.from),t=nodes.get(e.to);let path,lx,ly;
 if(e.feedback){
 if(vertical){const route=width-30-index*8,x1=f.cx+f.w/2,x2=t.cx+t.w/2;path=`M${x1} ${f.cy}H${route}V${t.cy}H${x2+7}`;lx=route-8;ly=(f.cy+t.cy)/2}
 else{const route=height-38-index*8;path=`M${f.cx} ${f.cy+f.h/2}V${route}H${t.cx}V${t.cy+t.h/2+7}`;lx=(f.cx+t.cx)/2;ly=route}
 }else if(vertical){const y1=f.cy+f.h/2,y2=t.cy-t.h/2-7,mid=(y1+y2)/2;path=`M${f.cx} ${y1}V${mid}H${t.cx}V${y2}`;lx=(f.cx+t.cx)/2;ly=mid}
 else{const x1=f.cx+f.w/2,x2=t.cx-t.w/2-7,mid=(x1+x2)/2;path=`M${x1} ${f.cy}H${mid}V${t.cy}H${x2}`;lx=mid;ly=(f.cy+t.cy)/2}
 const connector=add('path',{d:path,fill:'none',stroke:'#888888','stroke-width':1.1,'marker-end':'url(#flow-tip)'});connector.dataset.connector='true';
 if(e.label){const label=text(lx,ly+4,e.label,14);label.dataset.lineLabel='true'}
 }
 input.edges.forEach(edgePath);
 nodes.forEach(n=>{
 const x=n.cx-n.w/2,y=n.cy-n.h/2,fill=opt.focus===n.id?'#eeeeee':'#ffffff';
 if(n.type==='decision')add('path',{d:`M${n.cx} ${y}L${x+n.w} ${n.cy}L${n.cx} ${y+n.h}L${x} ${n.cy}Z`,fill,stroke:'#777777'});
 else add('rect',{x,y,width:n.w,height:n.h,rx:n.type==='start'||n.type==='end'?n.h/2:0,fill,stroke:'#999999'});
 const hasBody=n.type==='process'&&!!n.body?.trim()&&opt.details!==false;
 const title=text(hasBody?x+16:n.cx,n.cy+(hasBody?-11:0),n.title,16);
 title.setAttribute('text-anchor','start');if(!hasBody)title.setAttribute('x',n.cx-title.getComputedTextLength()/2);title.setAttribute('dominant-baseline','central');
 if(n.body&&n.type==='process'){
 const body=text(x+16,n.cy+17,n.body,13);body.setAttribute('text-anchor','start');body.setAttribute('fill','#777777');body.style.opacity=hasBody?'1':'0';
 }
 });
 if(old.length&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const children=[...svg.children].filter(n=>n.tagName!=='defs');
 const changes=children.map((n,i)=>{
 const previous=old[i];if(!previous||previous.tag!==n.tagName)return null;
 const attrs=['x','y','cx','cy','width','height','rx'].filter(k=>n.hasAttribute(k)&&previous.attrs[k]!==undefined).map(k=>({key:k,from:+previous.attrs[k]*(k==='x'||k==='cx'||k==='width'||k==='rx'?width/oldWidth:height/oldHeight),to:+n.getAttribute(k)}));
 const d=n.tagName==='path'?n.getAttribute('d'):null;
 let points=null;if(d){const length=n.getTotalLength();points=Array.from({length:41},(_,i)=>{const p=n.getPointAtLength(length*i/40);return [p.x,p.y]})}
 return {n,attrs,d,points,previous};
 }).filter(Boolean);
 const start=performance.now();
 function frame(now){const t=Math.min(1,(now-start)/760),ease=1-(1-t)**4;
 changes.forEach(q=>{
 q.attrs.forEach(a=>q.n.setAttribute(a.key,a.from+(a.to-a.from)*ease));
 if(q.d&&q.previous.points){if(t===1)q.n.setAttribute('d',q.d);else q.n.setAttribute('d',q.points.map((point,i)=>{const before=q.previous.points[i],x=before[0]*width/oldWidth,y=before[1]*height/oldHeight;return (i?'L':'M')+(x+(point[0]-x)*ease)+' '+(y+(point[1]-y)*ease)}).join(' '))}
 });
 updateLineLabelMasks(svg);svg._frame=t<1?requestAnimationFrame(frame):null;
 }
 frame(start);
 }
 updateLineLabelMasks(svg);
 return {width,height,nodes:nodes.size,edges:input.edges.length};
}
const sample={title:'流程图',nodes:[{id:'start',type:'start',title:'开始'},{id:'a',type:'process',title:'处理 A',body:'节点说明'},{id:'check',type:'decision',title:'条件是否满足？'},{id:'b',type:'process',title:'处理 B',body:'节点说明'},{id:'end',type:'end',title:'结束'}],edges:[{from:'start',to:'a'},{from:'a',to:'check'},{from:'check',to:'b',label:'是'},{from:'b',to:'end'},{from:'check',to:'a',label:'否，返回调整',feedback:true}]};
function refresh(){try{renderFlow(document.querySelector('svg'),sample,{direction:document.querySelector('[name=direction]:checked').value,focus:document.querySelector('[name=focus]').checked?'check':undefined,details:document.querySelector('[name=details]').checked});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
