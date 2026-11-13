
function renderPie(svg,input,options={}){
 if(!Array.isArray(input.data)||!input.data.length||input.data.some(d=>typeof d.label!=='string'||!Number.isFinite(d.value)||d.value<0))throw Error('请输入类别与有限非负数值');
 const total=input.data.reduce((a,d)=>a+d.value,0);
 if(!Number.isFinite(total))throw Error('合计超出有效数值范围');
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const old=svg._state,ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(tag,attrs,value)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(value!==undefined)n.textContent=value;svg.append(n);return n};
 const text=(x,y,v,anchor='middle',size=16)=>add('text',{x,y,'text-anchor':anchor,'font-size':size},v);
 const measure=v=>{let t=text(0,0,v),w=t.getBBox().width;t.remove();return w};
 const fmt=v=>v>=1e7?v.toExponential(2):Number(v.toPrecision(6)).toString();
 const width=Math.max(900,Math.max(...input.data.map(d=>measure(d.label))) *2+590);
 const rows=Math.ceil(input.data.length/4),height=Math.max(590,input.data.length*24+220)+rows*32,cx=width/2,cy=(height-100-rows*32)/2+25,radius=158,targetInner=options.donut?97:0;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',input.title);
 text(cx,32,input.title,'middle',20);
 if(total===0){text(cx,cy,'暂无可计算的占比');svg._state=null;return {total,segments:0}}
 const colors=input.data.map((d,i)=>{let v=input.data.length===1?45:Math.round(40+i*175/(input.data.length-1));return `rgb(${v},${v},${v})`});
 let angle=-Math.PI/2;
 const parts=input.data.map((d,i)=>{const start=angle;angle+=d.value/total*Math.PI*2;return {...d,index:i,start,end:angle,pct:d.value/total*100}});
 const polar=(a,r)=>[cx+Math.cos(a)*r,cy+Math.sin(a)*r];
 function segment(start,end,inner){
 const sweep=Math.max(0,end-start);if(sweep<1e-10)return '';
 // 分成两个弧，完整圆和普通扇区采用同一几何结构。
 const middle=(start+end)/2,p0=polar(start,radius),p1=polar(middle,radius),p2=polar(end,radius),q2=polar(end,inner),q1=polar(middle,inner),q0=polar(start,inner);
 return `M${p0} A${radius} ${radius} 0 0 1 ${p1} A${radius} ${radius} 0 0 1 ${p2} L${q2} A${inner||.0001} ${inner||.0001} 0 0 0 ${q1} A${inner||.0001} ${inner||.0001} 0 0 0 ${q0} Z`;
 }
 const paths=parts.map((d,i)=>{let n=add('path',{'data-pie-sector':i,fill:colors[i],stroke:'#ffffff','stroke-width':2});const title=document.createElementNS(ns,'title');title.textContent=d.label+' '+fmt(d.value)+'，'+Number(d.pct.toFixed(1))+'%';n.append(title);return n});
 const labels=parts.filter(d=>d.value>0).map(d=>({...d,side:Math.cos((d.start+d.end)/2)>=0?1:-1,yy:polar((d.start+d.end)/2,radius+22)[1]}));
 for(const side of [-1,1]){
 const list=labels.filter(d=>d.side===side).sort((a,b)=>a.yy-b.yy),min=85,max=height-100-rows*32;
 list.forEach((d,i)=>d.ly=Math.max(d.yy,i?list[i-1].ly+29:min));
 if(list.length&&list.at(-1).ly>max){let shift=list.at(-1).ly-max;list.forEach(d=>d.ly-=shift)}
 list.forEach(d=>{const mid=(d.start+d.end)/2,p=polar(mid,radius+4),xx=cx+side*(radius+42),end=xx-side*7;
 add('path',{d:`M${p}L${cx+side*(radius+18)} ${d.ly}H${end}`,stroke:'#888888',fill:'none','stroke-width':.8});
 const v=options.values?fmt(d.value):Number(d.pct.toFixed(1))+'%';
 text(xx,d.ly+5,d.label+'  '+v,side>0?'start':'end',14);
 });
 }
 const center=text(cx,cy-3,input.centerLabel||'合计','middle',14),number=text(cx,cy+29,fmt(total),'middle',30);
 const legendItems=input.data.map((d,i)=>({name:d.label,w:measure(d.label)+45,i}));let legendRows=[],row=[],used=0;
 legendItems.forEach(v=>{if(used+v.w>width-100&&row.length){legendRows.push(row);row=[];used=0}row.push(v);used+=v.w});if(row.length)legendRows.push(row);
 legendRows.forEach((row,k)=>{let x=(width-row.reduce((a,b)=>a+b.w,0))/2;row.forEach(v=>{const y=height-55+(k-(legendRows.length-1))*30;add('rect',{x,y:y-11,width:12,height:12,fill:colors[v.i]});text(x+20,y,v.name,'start',14);x+=v.w})});
 const canAnimate=old&&old.parts.length===parts.length&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const from=canAnimate?old.inner:targetInner,fromParts=canAnimate?old.parts:parts,startTime=performance.now();
 function frame(now){
 const t=canAnimate?Math.min(1,(now-startTime)/760):1,e=1-(1-t)**4,inner=from+(targetInner-from)*e;
 const live=parts.map((d,i)=>({...d,start:fromParts[i].start+(d.start-fromParts[i].start)*e,end:fromParts[i].end+(d.end-fromParts[i].end)*e}));
 paths.forEach((n,i)=>n.setAttribute('d',segment(live[i].start,live[i].end,inner)));
 center.setAttribute('visibility',inner>65?'visible':'hidden');number.setAttribute('visibility',inner>65?'visible':'hidden');
 svg._state={inner,parts:live};svg._frame=t<1?requestAnimationFrame(frame):null;
 }
 frame(startTime);return {total,segments:parts.length,width,height};
}
const sample={title:'图表标题',centerLabel:'合计',data:[{label:'A',value:40},{label:'B',value:30},{label:'C',value:20},{label:'D',value:10}]};
function refresh(){try{renderPie(document.querySelector('svg'),sample,{donut:document.querySelector('[name=form]:checked').value==='donut',values:document.querySelector('[name=labels]:checked').value==='value'});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
