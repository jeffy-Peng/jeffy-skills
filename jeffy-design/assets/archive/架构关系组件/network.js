function updateNetworkLabelMasks(svg,padding=7){return updateLineLabelMasks(svg,padding)}
function renderNetwork(svg,input,opt={}){
 if(!input.nodes?.length||!Array.isArray(input.edges))throw Error('需要主体与关系数组');
 const ids=new Set(input.nodes.map(n=>n.id));
 if(ids.size!==input.nodes.length||input.nodes.some(n=>!n.id||!n.title)||input.edges.some(e=>!ids.has(e.from)||!ids.has(e.to)||e.from===e.to))throw Error('主体 ID 须唯一，关系两端须有效');
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const old=new Map([...svg.querySelectorAll('[data-key]')].map(n=>[n.dataset.key,Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))]));
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(tag,attrs,v)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(key,x,y,v,size=16)=>add('text',{'data-key':key,x,y,'font-size':size,'text-anchor':'middle','dominant-baseline':'central'},v);
 const measure=v=>{const n=text('measure',0,0,v),w=n.getBBox().width;n.remove();return w};
 const nodeR=Math.max(47,...input.nodes.map(n=>measure(n.title)/2+20)),radius=Math.max(225,input.nodes.length*(nodeR*2+35)/(Math.PI*2));
 const width=Math.max(1000,2*(radius+nodeR+70)),height=2*(radius+nodeR+45),cx=width/2,cy=height/2;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label','多方关系网络');
 const positions=new Map(input.nodes.map((n,i)=>{const angle=-Math.PI/2+i*Math.PI*2/input.nodes.length;return [n.id,{...n,x:cx+radius*Math.cos(angle),y:cy+radius*Math.sin(angle)}]}));
 const defs=document.createElementNS(ns,'defs');svg.append(defs);const marker=document.createElementNS(ns,'marker');defs.append(marker);
 for(const[k,v]of Object.entries({id:'network-arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto'}))marker.setAttribute(k,v);
 const tip=document.createElementNS(ns,'path');tip.setAttribute('d','M1 1L7 4L1 7Z');tip.setAttribute('fill','#777777');marker.append(tip);
 const labelBoxes=[];
 input.edges.forEach((e,i)=>{
 const a=positions.get(e.from),b=positions.get(e.to),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
 const reverse=input.edges.some(other=>other.from===e.to&&other.to===e.from),shift=reverse?9:0;
 const x1=a.x+ux*(nodeR+5)-uy*shift,y1=a.y+uy*(nodeR+5)+ux*shift,x2=b.x-ux*(nodeR+9)-uy*shift,y2=b.y-uy*(nodeR+9)+ux*shift;
 const edge=add('line',{'data-key':'edge-'+e.from+'-'+e.to,x1,y1,x2,y2,stroke:'#aaaaaa','stroke-width':1.1});
 edge.dataset.connector='true';
 if(opt.arrows)edge.setAttribute('marker-end','url(#network-arrow)');
 if(opt.labels&&e.label){
 const w=measure(e.label)+14,h=23;
 let pos=null;
 for(const t of [.5,.35,.65,.25,.75]){
 const x=x1+(x2-x1)*t,y=y1+(y2-y1)*t,box={x:x-w/2,y:y-h/2,w,h};
 const overlap=labelBoxes.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y);
 if(!overlap){pos={x,y,box};break}
 }
 if(pos){
 labelBoxes.push(pos.box);const label=text('label-'+e.from+'-'+e.to,pos.x,pos.y,e.label,14);label.dataset.lineLabel='true';

 }
 }
 const title=document.createElementNS(ns,'title');title.textContent=a.title+' → '+b.title+(e.label?'：'+e.label:'');edge.append(title);
 });
 positions.forEach(n=>{add('circle',{'data-key':'node-'+n.id,cx:n.x,cy:n.y,r:nodeR,fill:opt.focus===n.id?'#eeeeee':'#ffffff',stroke:'#999999','stroke-width':1.1});text('node-title-'+n.id,n.x,n.y,n.title)});
 updateNetworkLabelMasks(svg);
 if(old.size&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const changes=[];svg.querySelectorAll('[data-key]').forEach(n=>{const prior=old.get(n.dataset.key);if(!prior)return;for(const key of ['x','y','x1','y1','x2','y2','cx','cy','r'])if(n.hasAttribute(key)&&prior[key]!==undefined)changes.push({n,key,from:+prior[key],to:+n.getAttribute(key)})});
 const start=performance.now();function frame(now){const t=Math.min(1,(now-start)/760),e=1-(1-t)**4;changes.forEach(q=>q.n.setAttribute(q.key,q.from+(q.to-q.from)*e));updateNetworkLabelMasks(svg);svg._frame=t<1?requestAnimationFrame(frame):null}frame(start);
 }
 return {nodes:positions.size,edges:input.edges.length,shownLabels:labelBoxes.length,width,height};
}
function refresh(){
 const count=Number(document.querySelector('[name=count]:checked').value),nodes=Array.from({length:count},(_,i)=>({id:String(i),title:'主体 '+String.fromCharCode(65+i)}));
 const pairs=count===5?[[0,1],[1,2],[2,3],[3,4],[4,0],[0,2],[1,4]]:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,3],[1,4],[2,5]];
 const edges=pairs.map(([a,b],i)=>({from:String(a),to:String(b),label:'关系 '+String.fromCharCode(97+i)}));
 try{renderNetwork(document.querySelector('svg'),{nodes,edges},{labels:document.querySelector('[name=labels]').checked,arrows:document.querySelector('[name=arrows]').checked,focus:document.querySelector('[name=focus]').checked?'0':undefined});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}
}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
