
function renderSwimlane(svg,input,opt={}){
 const previousDetails=svg._details;svg._details=!!opt.details;
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(t,a,v)=>{const n=document.createElementNS(ns,t);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(x,y,v,size=16,anchor='middle')=>add('text',{x,y,'font-size':size,'text-anchor':anchor},v);
 if(!input.lanes?.length||!input.nodes?.length)throw Error('需要角色与节点');
 const laneIds=input.lanes.map(l=>l.id),map=new Map(input.nodes.map(n=>[n.id,n]));
 if(map.size!==input.nodes.length||input.nodes.some(n=>!laneIds.includes(n.lane)||!Number.isInteger(n.step)||n.step<0)||input.edges.some(e=>!map.has(e.from)||!map.has(e.to)))throw Error('请核对节点 ID、所属角色、步骤和连接');
 const measure=v=>{const n=text(0,0,v),w=n.getBBox().width;n.remove();return w};
 function wrap(value,width){let lines=[],line='';for(const ch of String(value||'')){if(measure(line+ch)>width&&line){lines.push(line);line=ch}else line+=ch}if(line)lines.push(line);return lines}
 const descriptions=new Map(input.nodes.map(n=>[n.id,wrap(n.body,165)]));
 const maxLines=Math.max(0,...[...descriptions.values()].map(v=>v.length));
 const columns=Math.max(...input.nodes.map(n=>n.step))+1,width=Math.max(1000,160+columns*235),laneH=Math.max(150,110+maxLines*23),height=50+laneH*input.lanes.length,header=150,nodeW=165,nodeH=62;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label','泳道图');
 const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');defs.append(marker);svg.append(defs);
 for(const[k,v]of Object.entries({id:'swim-tip',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto'}))marker.setAttribute(k,v);
 const t=document.createElementNS(ns,'path');t.setAttribute('d','M1 1L7 4L1 7Z');t.setAttribute('fill','#777');marker.append(t);
 input.lanes.forEach((l,i)=>{const y=25+i*laneH;add('rect',{x:20,y,width:width-40,height:laneH,fill:i%2?'#f5f5f5':'#ffffff',stroke:'#dddddd'});add('line',{x1:header,y1:y,x2:header,y2:y+laneH,stroke:'#dddddd'});text(85,y+laneH/2+5,l.title)});
 const positions=new Map(input.nodes.map(n=>[n.id,{...n,x:header+25+n.step*235,y:25+laneIds.indexOf(n.lane)*laneH+(laneH-nodeH-maxLines*23)/2}]));
 input.edges.forEach(e=>{
 const a=positions.get(e.from),b=positions.get(e.to);let x1=a.x+nodeW,y1=a.y+nodeH/2,x2=b.x-8,y2=b.y+nodeH/2;
 if(a.step===b.step){x1=a.x+nodeW/2;x2=b.x+nodeW/2;y1=a.y+(b.y>a.y?nodeH:0);y2=b.y+(b.y>a.y?-8:nodeH+8)}
 const middle=(x1+x2)/2;
 const d=a.step===b.step?`M${x1} ${y1}V${y2}`:`M${x1} ${y1}H${middle}V${y2}H${x2}`;
 const path=add('path',{d,fill:'none',stroke:'#777','stroke-width':1.1,'marker-end':'url(#swim-tip)'});
 if(e.label){
 const lx=middle,ly=(y1+y2)/2,label=text(lx,ly+4,e.label,13),box=label.getBBox();
 const mask=document.createElementNS(ns,'mask'),id='edge-gap-'+input.edges.indexOf(e);
 mask.setAttribute('id',id);mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width',width);mask.setAttribute('height',height);
 const white=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x:0,y:0,width,height,fill:'white'}))white.setAttribute(k,v);mask.append(white);
 const hole=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x:box.x-6,y:box.y-3,width:box.width+12,height:box.height+6,fill:'black'}))hole.setAttribute(k,v);mask.append(hole);defs.append(mask);path.setAttribute('mask','url(#'+id+')');
 }
 });
 positions.forEach(n=>{add('rect',{x:n.x,y:n.y,width:nodeW,height:nodeH,fill:opt.focus===n.lane?'#eeeeee':'white',stroke:'#999'});text(n.x+nodeW/2,n.y+nodeH/2+5,n.title);descriptions.get(n.id).forEach((line,i)=>{const t=text(n.x,n.y+nodeH+25+i*23,line,14,'start');t.setAttribute('fill','#666666');t.setAttribute('data-description','true');
 const visible=!!opt.details;t.style.opacity=visible?'1':'0';
 if(previousDetails!==undefined&&previousDetails!==visible&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 t.animate([{opacity:visible?0:1,transform:visible?'translateY(6px)':'none'},{opacity:visible?1:0,transform:visible?'none':'translateY(6px)'}],{duration:520,easing:'cubic-bezier(.22,1,.36,1)'});
 }})});
 return {width,height};
}
const sample={lanes:[{id:'a',title:'角色 A'},{id:'b',title:'角色 B'},{id:'c',title:'角色 C'}],nodes:[{id:'n1',lane:'a',step:0,title:'提出需求',body:'说明目标、范围与必要条件'},{id:'n2',lane:'b',step:1,title:'处理请求',body:'根据输入形成可供确认的方案'},{id:'n3',lane:'a',step:2,title:'确认结果',body:'核对方案是否满足原始需求'},{id:'n4',lane:'c',step:3,title:'完成执行',body:'按确认结果完成后续操作'}],edges:[{from:'n1',to:'n2',label:'提交'},{from:'n2',to:'n3',label:'待确认'},{from:'n3',to:'n4',label:'通过'}]};
function refresh(){renderSwimlane(document.querySelector('svg'),sample,{focus:document.querySelector('[name=focus]').checked?'b':undefined,details:document.querySelector('[name=details]').checked})}document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
