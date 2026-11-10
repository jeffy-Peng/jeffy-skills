
function renderLayers(svg,input,opt={}){
 if(!input.layers?.length||input.layers.some(l=>!l.title||!l.modules?.length))throw Error('每层需要名称和模块');
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const previousDetails=svg._details;svg._details=!!opt.details;
 const previous=new Map([...svg.querySelectorAll('[data-key]')].map(n=>[n.dataset.key,Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))]));
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(t,a,v)=>{const n=document.createElementNS(ns,t);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(key,x,y,v,size=16,anchor='start')=>add('text',{'data-key':key,x,y,'font-size':size,'text-anchor':anchor},v);
 const measure=v=>{const n=text('measure',0,0,v),w=n.getBBox().width;n.remove();return w};
 const labelW=Math.max(140,...input.layers.map(l=>measure(l.title)+35)),moduleW=Math.max(170,...input.layers.flatMap(l=>l.modules.map(n=>Math.max(measure(n.title)+35,measure(n.body||'')+35)))),maxCount=Math.max(...input.layers.map(l=>l.modules.length));
 const width=Math.max(1000,labelW+maxCount*(moduleW+20)+70),layerH=145,height=70+input.layers.length*(layerH+22);
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label','分层架构');
 input.layers.forEach((layer,i)=>{
 const y=30+i*(layerH+22),dark=opt.focus===i;
 add('rect',{'data-key':'layer-'+i,x:25,y,width:width-50,height:layerH,fill:dark?'#eeeeee':'#fafafa',stroke:'#bbbbbb'});
 const layerName=text('name-'+i,45,y+layerH/2,layer.title,18);layerName.setAttribute('dominant-baseline','central');
 const available=width-labelW-75,cellW=(available-20*(layer.modules.length-1))/layer.modules.length;
 layer.modules.forEach((n,j)=>{
 const x=labelW+30+j*(cellW+20);
 add('rect',{'data-key':'box-'+i+'-'+j,x,y:y+24,width:cellW,height:97,fill:'white',stroke:'#aaaaaa'});
 const hasDescription=!!opt.details&&!!n.body?.trim();
 const moduleTitle=text('title-'+i+'-'+j,hasDescription?x+16:x+(cellW-measure(n.title))/2,hasDescription?y+51:y+24+97/2,n.title,16);moduleTitle.setAttribute('dominant-baseline','central');
 const body=text('body-'+i+'-'+j,x+16,y+86,n.body||'',14);body.setAttribute('fill','#777777');body.style.opacity=opt.details?'1':'0';
 if(previous.size&&previousDetails!==!!opt.details&&!matchMedia('(prefers-reduced-motion: reduce)').matches)body.animate([{opacity:opt.details?0:1},{opacity:opt.details?1:0}],{duration:500});
 });
 });
 if(previous.size&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const changes=[];svg.querySelectorAll('[data-key^="title-"]').forEach(n=>{const old=previous.get(n.dataset.key);if(old)for(const key of ['x','y'])changes.push({n,key,from:+old[key],to:+n.getAttribute(key)})});
 const start=performance.now();function frame(now){const t=Math.min(1,(now-start)/760),ease=1-(1-t)**4;changes.forEach(c=>c.n.setAttribute(c.key,c.from+(c.to-c.from)*ease));svg._frame=t<1?requestAnimationFrame(frame):null}frame(start);
 }
 return {width,height};
}
const data={layers:[{title:'层级 A',modules:[{title:'模块 A1',body:'模块说明文本'},{title:'模块 A2',body:'模块说明文本'},{title:'模块 A3',body:'模块说明文本'}]},{title:'层级 B',modules:[{title:'模块 B1',body:'模块说明文本'},{title:'模块 B2',body:'模块说明文本'}]},{title:'层级 C',modules:[{title:'模块 C1',body:'模块说明文本'},{title:'模块 C2',body:'模块说明文本'},{title:'模块 C3',body:'模块说明文本'},{title:'模块 C4',body:'模块说明文本'}]}]};
function refresh(){renderLayers(document.querySelector('svg'),data,{details:document.querySelector('[name=details]').checked,focus:document.querySelector('[name=focus]').checked?1:undefined})}document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
