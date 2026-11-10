
function renderProcess(svg,input,opt={}){
 if(!input.top?.length||!input.bottom?.length)throw Error('请提供上下两层节点');
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(t,attrs,v)=>{const n=document.createElementNS(ns,t);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(x,y,v,size=16,anchor='middle')=>add('text',{x,y,'font-size':size,'text-anchor':anchor},v);
 const measure=v=>{const n=text(0,0,v),w=n.getBBox().width;n.remove();return w};
 const all=[...input.top,...input.bottom];
 if(all.some(n=>!n.id||!n.title))throw Error('节点须包含唯一 id 和标题');
 if(new Set(all.map(n=>n.id)).size!==all.length)throw Error('节点 id 不能重复');
 const nodeW=Math.max(180,...all.map(n=>Math.max(measure(n.title)+40,measure(n.body||'')+36))),nodeH=100,gap=90;
 const columns=Math.max(input.top.length,input.bottom.length),width=Math.max(960,120+columns*nodeW+(columns-1)*gap),height=520;
 const xs=i=>60+i*(nodeW+gap),topY=100,bottomY=345;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',input.title);
 text(width/2,35,input.title,20);
 const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');svg.append(defs);defs.append(marker);
 for(const[k,v]of Object.entries({id:'process-tip',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto',markerUnits:'userSpaceOnUse'}))marker.setAttribute(k,v);
 const tip=document.createElementNS(ns,'path');tip.setAttribute('d','M1 1 L7 4 L1 7 Z');tip.setAttribute('fill','#666666');marker.append(tip);
 const positions=new Map();
 input.top.forEach((n,i)=>positions.set(n.id,{...n,x:xs(i),y:topY}));
 input.bottom.forEach((n,i)=>positions.set(n.id,{...n,x:xs(input.bottom.length-1-i),y:bottomY}));
 function edge(d,label,lx,ly){
 add('path',{d,fill:'none',stroke:'#777777','stroke-width':1.15,'marker-end':'url(#process-tip)'});
 if(label){let w=measure(label)+18;add('rect',{x:lx-w/2,y:ly-15,width:w,height:25,fill:'white'});text(lx,ly+3,label,14)}
 }
 for(const [layer,forward]of [[input.top,true],[input.bottom,false]])layer.slice(0,-1).forEach((n,i)=>{
 const p=positions.get(n.id),q=positions.get(layer[i+1].id),x1=forward?p.x+nodeW+8:p.x-8,x2=forward?q.x-10:q.x+nodeW+10,y=p.y+nodeH/2;
 edge(`M${x1} ${y}H${x2}`);
 });
 const last=positions.get(input.top.at(-1).id),first=positions.get(input.bottom[0].id),lx=last.x+nodeW/2,fx=first.x+nodeW/2;
 edge(`M${lx} ${last.y+nodeH+5}V${bottomY-10}H${fx}`,input.passLabel||'通过，进入执行',lx,(last.y+nodeH+bottomY)/2);
 if(opt.feedback&&input.feedback){
 const from=positions.get(input.feedback.from),to=positions.get(input.feedback.to);if(!from||!to)throw Error('返回线引用了不存在的节点');
 const x1=from.x+nodeW*.36,x2=to.x+nodeW*.36,y1=from.y-5,y2=to.y+nodeH+9;
 edge(`M${x1} ${y1}V${y2}`,input.feedback.label,x1,(y1+y2)/2);
 }
 positions.forEach(n=>{
 const focus=opt.focus&&n.id===input.check;
 add('rect',{x:n.x,y:n.y,width:nodeW,height:nodeH,fill:focus?'#222222':'#ffffff',stroke:focus?'#222222':'#aaaaaa','stroke-width':1});
 const id=text(n.x+17,n.y+25,n.id,12,'start');id.setAttribute('fill',focus?'#dddddd':'#888888');
 const title=text(n.x+17,n.y+52,n.title,18,'start');title.setAttribute('fill',focus?'white':'#222222');
 const body=text(n.x+17,n.y+79,n.body||'',14,'start');body.setAttribute('fill',focus?'#dddddd':'#666666');
 });
 return {width,height,nodes:positions.size};
}
const sample={title:'流程标题',top:[{id:'A',title:'明确输入',body:'条件、范围与所需材料'},{id:'B',title:'形成方案',body:'整理内容并确定处理方式'},{id:'C',title:'检查确认',body:'核对方案与约定条件'}],bottom:[{id:'D',title:'接收方案',body:'落实输入与执行要求'},{id:'E',title:'执行处理',body:'按方案推进并检查问题'},{id:'F',title:'结果反馈',body:'返回结果与后续说明'}],check:'C',passLabel:'通过，进入执行',feedback:{from:'E',to:'B',label:'发现问题，返回调整'}};
function refresh(){try{renderProcess(document.querySelector('svg'),sample,{feedback:document.querySelector('[name=feedback]').checked,focus:document.querySelector('[name=focus]').checked});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
