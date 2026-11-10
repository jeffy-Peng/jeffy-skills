
function renderContainment(svg,input,opt={}){
 if(!input.root?.id||!input.root.title)throw Error('需要根范围');
 const ids=new Set();function validate(n){if(!n.id||!n.title||ids.has(n.id))throw Error('每个范围需要唯一 ID 与标题');ids.add(n.id);if(n.children&&!Array.isArray(n.children))throw Error('children 必须为数组');(n.children||[]).forEach(validate)}validate(input.root);
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const old=new Map([...svg.querySelectorAll('[data-key]')].map(n=>[n.dataset.key,Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))]));
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(t,a,v)=>{let n=document.createElementNS(ns,t);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(key,x,y,v,size=16)=>add('text',{'data-key':key,x,y,'font-size':size,'text-anchor':'start'},v);
 const measure=v=>{let n=text('measure',0,0,v),w=n.getBBox().width;n.remove();return w};
 // 说明空间始终按开启状态保留，开关不会改变外框。
 function layoutSize(n){const kids=(n.children||[]).map(layoutSize),header=n.body?82:56;const siblingHeight=Math.max(0,...kids.map(c=>c.height));kids.forEach(c=>c.height=siblingHeight);return {...n,kids,header,width:Math.max(190,measure(n.title)+40,n.body?measure(n.body)+40:0,kids.reduce((s,c)=>s+c.width,0)+Math.max(0,kids.length-1)*24+40),height:kids.length?header+Math.max(...kids.map(c=>c.height))+24:n.body?100:76}}
 const root=layoutSize(input.root),width=Math.max(900,root.width+100),height=Math.max(420,root.height+100);
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label','包含关系');
 function draw(n,x,y,depth){
 add('rect',{'data-key':'box-'+n.id,x,y,width:n.width,height:n.height,fill:depth%2?'#f7f7f7':'#ffffff',stroke:depth?'#aaaaaa':'#555555','stroke-width':depth?1:1.2});
 const container=n.kids.length>0,described=!!opt.details&&!!n.body?.trim();
 const tx=container||described?x+18:x+(n.width-measure(n.title))/2;
 const ty=container?y+30:described?y+30:y+n.height/2;
 const title=text('title-'+n.id,tx,ty,n.title,depth?16:18);
 if(!container&&!described)title.setAttribute('dominant-baseline','central');
 if(n.body){const b=text('body-'+n.id,x+18,y+57,n.body,14);b.setAttribute('fill','#777777');b.style.opacity=opt.details?'1':'0'}
 let childX=x+20;n.kids.forEach(c=>{draw(c,childX,y+n.header,depth+1);childX+=c.width+24});
 }
 draw(root,(width-root.width)/2,40,0);
 if(old.size&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const transitions=[];svg.querySelectorAll('[data-key]').forEach(n=>{const previous=old.get(n.dataset.key);if(!previous)return;for(const key of ['x','y','width','height'])if(n.hasAttribute(key)&&previous[key]!==undefined)transitions.push({n,key,from:+previous[key],to:+n.getAttribute(key)})});
 const begin=performance.now();function frame(now){const t=Math.min(1,(now-begin)/760),e=1-(1-t)**4;transitions.forEach(q=>q.n.setAttribute(q.key,q.from+(q.to-q.from)*e));svg._frame=t<1?requestAnimationFrame(frame):null}frame(begin)
 }
 return {width,height,count:ids.size};
}
const leaf=(id,title)=>({id,title,body:'对应模块的说明文本'});
const two={id:'all',title:'范围 A',body:'说明本范围覆盖的对象与边界',children:[leaf('b','模块 B'),leaf('c','模块 C'),leaf('d','模块 D')]};
const three={id:'all',title:'范围 A',body:'说明本范围覆盖的对象与边界',children:[{id:'b',title:'范围 B',body:'归属于 A 的子范围',children:[leaf('c','模块 C'),leaf('d','模块 D')]},leaf('e','模块 E')]};
function refresh(){try{renderContainment(document.querySelector('svg'),{root:document.querySelector('[name=depth]:checked').value==='2'?two:three},{details:document.querySelector('[name=details]').checked});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
