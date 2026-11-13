
function renderExchange(svg,input,opt={}){
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const old=[...svg.children].map(n=>Object.fromEntries([...n.attributes].map(a=>[a.name,a.value])));
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 if(!input.nodes?.length||input.nodes.length<2||input.nodes.length>3)throw Error('此基本组合适用于两至三个主体');
 const ids=new Set(input.nodes.map(n=>n.id));if(input.edges.some(e=>!ids.has(e.from)||!ids.has(e.to)||e.from===e.to))throw Error('请核对主体与关系');
 const add=(tag,a,v)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(x,y,v,size=16)=>add('text',{x,y,'font-size':size,'text-anchor':'middle'},v);
 const measure=v=>{const n=text(0,0,v),w=n.getBBox().width;n.remove();return w};
 const maxText=Math.max(...input.nodes.map(n=>measure(n.title))),radius=Math.max(52,maxText/2+22),width=Math.max(960,maxText*3+600),height=input.nodes.length===2?350:610;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label','主体交换关系');
 const points=input.nodes.length===2?[[width*.2,175],[width*.8,175]]:[[width/2,90],[width*.23,450],[width*.77,450]],nodes=new Map(input.nodes.map((n,i)=>[n.id,{...n,x:points[i][0],y:points[i][1]}]));
 const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');svg.append(defs);defs.append(marker);for(const[k,v]of Object.entries({id:'exchange-tip',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto'}))marker.setAttribute(k,v);
 const arrow=document.createElementNS(ns,'path');arrow.setAttribute('d','M1 1L7 4L1 7Z');arrow.setAttribute('fill','#777');marker.append(arrow);
 input.edges.forEach((e,i)=>{
 const a=nodes.get(e.from),b=nodes.get(e.to),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,offset=opt.separate?13:9;
 const x1=a.x+ux*(radius+7)-uy*offset,y1=a.y+uy*(radius+7)+ux*offset,x2=b.x-ux*(radius+10)-uy*offset,y2=b.y-uy*(radius+10)+ux*offset;
 const line=add('line',{x1,y1,x2,y2,stroke:'#888','stroke-width':1.1,'marker-end':'url(#exchange-tip)'});
 const mx=(x1+x2)/2,my=(y1+y2)/2;
 if(e.label){
 const label=text(mx-uy*13,my+ux*13+4,e.label,14);
 const box=label.getBBox(),mask=document.createElementNS(ns,'mask'),id='exchange-gap-'+i;mask.setAttribute('id',id);mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x',0);mask.setAttribute('y',0);mask.setAttribute('width',width);mask.setAttribute('height',height);
 const base=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x:0,y:0,width,height,fill:'white'}))base.setAttribute(k,v);mask.append(base);
 const hole=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x:box.x-5,y:box.y-2,width:box.width+10,height:box.height+4,fill:'black'}))hole.setAttribute(k,v);mask.append(hole);defs.append(mask);line.setAttribute('mask','url(#'+id+')');
 }
 });
 nodes.forEach(n=>{add('circle',{cx:n.x,cy:n.y,r:radius,fill:opt.focus===n.id?'#eeeeee':'white',stroke:'#888','stroke-width':1});text(n.x,n.y+5,n.title)});
 if(old.length&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const changes=[];[...svg.children].forEach((n,i)=>{for(const key of ['x','y','x1','y1','x2','y2','cx','cy','r'])if(n.hasAttribute(key)&&old[i]?.[key]!==undefined)changes.push({n,key,from:+old[i][key],to:+n.getAttribute(key)})});
 const begin=performance.now();function frame(now){const t=Math.min(1,(now-begin)/760),e=1-(1-t)**4;changes.forEach(q=>q.n.setAttribute(q.key,q.from+(q.to-q.from)*e));svg._frame=t<1?requestAnimationFrame(frame):null}frame(begin);
 }
 return {nodes:nodes.size,edges:input.edges.length};
}
const two={nodes:[{id:'a',title:'主体 A'},{id:'b',title:'主体 B'}],edges:[{from:'a',to:'b',label:'提供内容'},{from:'b',to:'a',label:'支付费用'}]};
const three={nodes:[{id:'a',title:'主体 A'},{id:'b',title:'主体 B'},{id:'c',title:'主体 C'}],edges:[{from:'a',to:'b',label:'关系 A→B'},{from:'b',to:'a',label:'关系 B→A'},{from:'a',to:'c',label:'关系 A→C'},{from:'c',to:'a',label:'关系 C→A'},{from:'b',to:'c',label:'关系 B→C'},{from:'c',to:'b',label:'关系 C→B'}]};
function refresh(){renderExchange(document.querySelector('svg'),document.querySelector('[name=count]:checked').value==='2'?two:three,{separate:true,focus:document.querySelector('[name=focus]').checked?'a':undefined})}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
