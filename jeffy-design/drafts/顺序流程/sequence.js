
function renderSequence(svg,input,opt={}){
 if(!input.nodes?.length||input.nodes.some(n=>!n.title))throw Error('请提供流程节点');
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(tag,attrs,v)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const defs=document.createElementNS(ns,'defs');svg.append(defs);
 const marker=document.createElementNS(ns,'marker');for(const[k,v]of Object.entries({id:'flow-arrow',viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto',markerUnits:'userSpaceOnUse'}))marker.setAttribute(k,v);
 const triangle=document.createElementNS(ns,'path');triangle.setAttribute('d','M1 1 L7 4 L1 7 Z');triangle.setAttribute('fill','#777777');marker.append(triangle);defs.append(marker);
 const text=(x,y,v,anchor='middle',size=16)=>add('text',{x,y,'text-anchor':anchor,'font-size':size},v);
 const measure=v=>{const n=text(0,0,v),w=n.getBBox().width;n.remove();return w};
 const widths=input.nodes.map(n=>Math.max(165,measure(n.title)+40,opt.details?measure(n.body||'')+36:0));
 const gap=65,total=widths.reduce((a,b)=>a+b,0)+(widths.length-1)*gap,width=Math.max(900,total+80),height=opt.loop?390:300,top=115,nodeH=112;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',input.title);text(width/2,35,input.title,'middle',20);
 let cursor=(width-total)/2;const nodes=input.nodes.map((n,i)=>{const item={...n,x:cursor,w:widths[i]};cursor+=widths[i]+gap;return item});
 nodes.forEach((n,i)=>{
 if(i<nodes.length-1){const x1=n.x+n.w,x2=nodes[i+1].x,yy=top+nodeH/2;
 add('path',{d:`M${x1+10} ${yy}H${x2-10}`,fill:'none',stroke:'#777777','stroke-width':1,'marker-end':'url(#flow-arrow)'});
 if(opt.conditions&&i===nodes.length-2)text((x1+x2)/2,yy-13,input.passLabel||'通过','middle',12);
 }
 const focus=i===(input.checkIndex??nodes.length-2),dark=opt.focus&&focus;
 add('rect',{x:n.x,y:top,width:n.w,height:nodeH,fill:dark?'#222':'white',stroke:focus?'#333':'#bbb','stroke-width':focus?1.5:1});
 const number=text(n.x+17,top+26,String(i+1).padStart(2,'0'),'start',12);number.setAttribute('fill',dark?'#ddd':'#888');
 const title=text(n.x+17,top+57,n.title,'start',18);title.setAttribute('fill',dark?'white':'#222');
 if(opt.details){const body=text(n.x+17,top+85,n.body||'','start',14);body.setAttribute('fill',dark?'#ddd':'#666')}
 });
 if(opt.loop&&nodes.length>=3){
 const check=input.checkIndex??nodes.length-2,back=input.returnIndex??1;
 if(back>=check||check>=nodes.length)throw Error('回路需从后序检查节点返回前序节点');
 const source=nodes[check],target=nodes[back],x1=source.x+source.w/2,x2=target.x+target.w/2,y=top+nodeH,route=y+65;
 add('path',{d:`M${x1} ${y+6}V${route-8}Q${x1} ${route} ${x1-8} ${route}H${x2+8}Q${x2} ${route} ${x2} ${route-8}V${y+8}`,fill:'none',stroke:'#777777','stroke-width':1,'marker-end':'url(#flow-arrow)'});
 const label=input.returnLabel||'需要调整，返回上一环节';const w=measure(label)+20;
 add('rect',{x:(x1+x2-w)/2,y:route-12,width:w,height:25,fill:'white'});
 text((x1+x2)/2,route+5,label,'middle',14);
 }
 return {nodes:nodes.length,width,height};
}
const sample={title:'流程标题',nodes:[{title:'明确输入',body:'条件、范围与所需材料'},{title:'形成方案',body:'整理内容并完成处理'},{title:'检查确认',body:'核对结果与约定条件'},{title:'完成交付',body:'输出结果并记录状态'}],checkIndex:2,returnIndex:1,passLabel:'通过',returnLabel:'需要调整，返回处理'};
function refresh(){try{renderSequence(document.querySelector('svg'),sample,{details:true,conditions:true,loop:document.querySelector('[name=loop]').checked,focus:document.querySelector('[name=focus]').checked});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
