
function renderHub(svg,input,opt={}){
 if(!input.center?.title||!input.items?.length)throw Error('需要中心主体和外围对象');
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const old=new Map([...svg.querySelectorAll('[data-key]')].map(n=>[n.dataset.key,Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))]));
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(t,a,v)=>{const n=document.createElementNS(ns,t);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(key,x,y,v,size=16)=>add('text',{'data-key':key,x,y,'font-size':size,'text-anchor':'middle','dominant-baseline':'central'},v);
 const measure=v=>{const n=text('measure',0,0,v),w=n.getBBox().width;n.remove();return w};
 const nodeW=Math.max(150,...input.items.map(n=>measure(n.title)+35)),nodeH=62,centerR=Math.max(65,measure(input.center.title)/2+22),radius=Math.max(220,input.items.length*nodeW/(Math.PI*2)+70),cx=radius+nodeW/2+65,cy=radius+nodeH/2+45,width=cx*2,height=cy*2;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label','中心辐射关系');
 const defs=document.createElementNS(ns,'defs');svg.append(defs);const marker=document.createElementNS(ns,'marker');defs.append(marker);
 for(const[k,v]of Object.entries({id:'hub-arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'}))marker.setAttribute(k,v);
 const tip=document.createElementNS(ns,'path');tip.setAttribute('d','M1 1L7 4L1 7Z');tip.setAttribute('fill','#888');marker.append(tip);
 input.items.forEach((n,i)=>{
 const angle=-Math.PI/2+i*Math.PI*2/input.items.length,ux=Math.cos(angle),uy=Math.sin(angle),x=cx+radius*ux,y=cy+radius*uy;
 const hit=Math.min(Math.abs(ux)>1e-8?nodeW/2/Math.abs(ux):Infinity,Math.abs(uy)>1e-8?nodeH/2/Math.abs(uy):Infinity);
 const x1=cx+ux*(centerR+8),y1=cy+uy*(centerR+8),x2=x-ux*(hit+9),y2=y-uy*(hit+9);
 const edge=add('line',{'data-key':'edge-'+n.id,x1,y1,x2,y2,stroke:'#aaaaaa','stroke-width':1.1});
 if(opt.direction==='out'||opt.direction==='both')edge.setAttribute('marker-end','url(#hub-arrow)');
 if(opt.direction==='in'||opt.direction==='both')edge.setAttribute('marker-start','url(#hub-arrow)');
 if(opt.labels&&n.label){
 const lx=(x1+x2)/2,ly=(y1+y2)/2,label=text('label-'+n.id,lx,ly,n.label,14),box=label.getBBox(),mask=document.createElementNS(ns,'mask'),id='hub-gap-'+i;
 for(const[k,v]of Object.entries({id,maskUnits:'userSpaceOnUse',x:0,y:0,width,height}))mask.setAttribute(k,v);
 const base=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x:0,y:0,width,height,fill:'white'}))base.setAttribute(k,v);mask.append(base);
 const hole=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x:box.x-5,y:box.y-3,width:box.width+10,height:box.height+6,fill:'black'}))hole.setAttribute(k,v);mask.append(hole);defs.append(mask);edge.setAttribute('mask','url(#'+id+')');
 }
 add('rect',{'data-key':'node-'+n.id,x:x-nodeW/2,y:y-nodeH/2,width:nodeW,height:nodeH,fill:'white',stroke:'#999999'});
 text('title-'+n.id,x,y,n.title);
 });
 add('circle',{'data-key':'center',cx,cy,r:centerR,fill:opt.focus?'#eeeeee':'white',stroke:'#777777','stroke-width':1.2});text('center-title',cx,cy,input.center.title,18);
 if(old.size&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const changes=[];svg.querySelectorAll('[data-key]').forEach(n=>{const prev=old.get(n.dataset.key);if(!prev)return;for(const key of ['x','y','cx','cy','x1','y1','x2','y2','width','height','r'])if(n.hasAttribute(key)&&prev[key]!==undefined)changes.push({n,key,from:+prev[key],to:+n.getAttribute(key)})});
 const start=performance.now();function frame(now){const t=Math.min(1,(now-start)/760),e=1-(1-t)**4;changes.forEach(q=>q.n.setAttribute(q.key,q.from+(q.to-q.from)*e));svg._frame=t<1?requestAnimationFrame(frame):null}frame(start)
 }
 return {width,height,nodes:input.items.length+1};
}
function refresh(){const count=Number(document.querySelector('[name=count]:checked').value);renderHub(document.querySelector('svg'),{center:{title:'核心主体'},items:Array.from({length:count},(_,i)=>({id:String(i),title:'主体 '+String.fromCharCode(65+i),label:'关系说明'}))},{labels:document.querySelector('[name=labels]').checked,direction:document.querySelector('[name=direction]:checked').value,focus:document.querySelector('[name=focus]').checked})}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
