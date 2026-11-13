
function renderChart(svg,input,opt={}){

 if(svg._transitionFrame)cancelAnimationFrame(svg._transitionFrame);
 const oldView=svg.viewBox.baseVal,oldWidth=oldView.width||1,oldHeight=oldView.height||1;
 const oldBars=[...svg.querySelectorAll('rect[data-value]')].map(n=>Object.fromEntries(['x','y','width','height'].map(k=>[k,+n.getAttribute(k)])));

 const oldDetails=new Map();
 const counters={};
 for(const n of svg.querySelectorAll('text,line,path')){
 const stem=n.tagName==='text'?'text:'+n.textContent:n.tagName;
 const key=stem+':'+(counters[stem]=(counters[stem]||0)+1);
 oldDetails.set(key,{attrs:Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))});
 }
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const kind=opt.kind||'single',horizontal=opt.direction==='horizontal',percent=kind==='stacked'&&opt.mode==='percent';
 const data=input.data,series=kind==='single'?['数值']:input.series;
 if(!data?.length||!series?.length||data.some(d=>typeof d.label!=='string'||!Array.isArray(d.values)||d.values.length!==series.length||d.values.some(v=>!Number.isFinite(v)||v<0)))throw Error('需要非空类别、系列和有限非负数值；正负数据请选正负变化组件');
 const add=(tag,attrs,v)=>{const n=document.createElementNS(ns,tag);for(const[k,x]of Object.entries(attrs))n.setAttribute(k,x);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(x,y,v,anchor='middle',size=16)=>add('text',{x,y,'text-anchor':anchor,'font-size':size},v);
 const measure=v=>{let n=text(0,0,v),w=n.getBBox().width;n.remove();return w};
 const fmt=v=>Math.abs(v)>=1e7?v.toExponential(2):Number(v.toPrecision(5)).toString();
 const sums=data.map(d=>d.values.reduce((a,b)=>a+b,0));
 const values=data.map((d,i)=>percent?d.values.map(v=>sums[i]?v/sums[i]*100:0):d.values);
 const peak=kind==='stacked'?Math.max(...values.map(v=>v.reduce((a,b)=>a+b,0)),0):Math.max(...values.flat(),0);
 const raw=(peak||1)/4,pow=10**Math.floor(Math.log10(raw)),step=percent?25:[1,2,2.5,5,10].find(x=>x*pow>=raw)*pow,max=percent?100:Math.ceil((peak||1)/step)*step;
 const labelWidth=Math.max(...data.map(d=>measure(d.label)));
 const valueWidth=Math.max(...values.flat().map(v=>measure(percent?Number(v.toFixed(1))+'%':fmt(v))));
 const legendWidths=series.map(v=>measure(v)+45),legendWidth=legendWidths.reduce((a,b)=>a+b,0);
 const width=Math.max(850,legendWidth+100,horizontal?labelWidth+valueWidth+540:data.length*Math.max(110,labelWidth+26,kind==='grouped'?series.length*(valueWidth+10)+30:0)+115);
 const left=horizontal?labelWidth+30:95,right=width-valueWidth-30,top=90;
 const band=horizontal?Math.max(65,kind==='grouped'?series.length*30+20:65):0;
 const bottom=horizontal?top+band*data.length:420,height=bottom+(kind==='single'?100:150);
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',input.title);
 const line=(x,y,X,Y,color='#dddddd')=>add('line',{x1:x,y1:y,x2:X,y2:Y,stroke:color});
 const scale=v=>v/max*(horizontal?right-left:bottom-top);
 const color=k=>series.length===1?'#333333':`rgb(${Math.round(45+165*k/(series.length-1))},${Math.round(45+165*k/(series.length-1))},${Math.round(45+165*k/(series.length-1))})`;
 text((left+right)/2,36,input.title,'middle',20);
 for(let i=0;i<=Math.round(max/step);i++){let v=i*step,x=left+scale(v),y=bottom-scale(v);if(i)horizontal?line(x,top,x,bottom):line(left,y,right,y);horizontal?text(x,bottom+25,fmt(v),'middle',14):text(left-12,y+5,fmt(v),'end',14)}
 add('path',{d:`M${left} ${top}V${bottom}H${right}h8l-4 3 M${left} ${top}v-8l-3 4`,fill:'none',stroke:'#222222','stroke-width':1.3});
 if(horizontal)text(right,bottom+55,input.metric+' / '+(percent?'%':input.unit),'end',14);
 else {let t=text(25,(top+bottom)/2,input.metric+' / '+(percent?'%':input.unit));t.setAttribute('transform',`rotate(-90 25 ${(top+bottom)/2})`)}
 data.forEach((d,i)=>{
 const slot=horizontal?band:(right-left)/data.length,mid=(horizontal?top:left)+(i+.5)*slot;
 horizontal?text(left-14,mid+5,d.label,'end'):text(mid,bottom+26,d.label);
 if(percent&&!sums[i]){horizontal?text(left+25,mid+5,'无占比','start'):text(mid,bottom-15,'无占比');return}
 let acc=0;
 values[i].forEach((v,k)=>{
 const grouped=kind==='grouped',w=grouped?Math.min(24,(slot-30)/series.length):Math.min(Math.max(45,percent?Math.max(...values.flat().map(v=>measure(Number(v.toFixed(1))+'%')))+14:45),slot*.65);
 const offset=grouped?(k-(series.length-1)/2)*(w+6):0;
 const start=kind==='stacked'?acc:0,end=start+v;
 const attrs=horizontal?{x:left+scale(start),y:mid+offset-w/2,width:scale(v),height:w}:{x:mid+offset-w/2,y:bottom-scale(end),width:w,height:scale(v)};
 add('rect',{...attrs,fill:color(k),'data-value':v});
 const label=percent?Number(v.toFixed(1))+'%':fmt(v);
 if(kind==='stacked'){
 const available=horizontal?scale(v):w;
 if(measure(label)+8<available&&(!horizontal?scale(v)>22:true)){
 const t=horizontal?text(left+scale(start+v/2),mid+5,label):text(mid,bottom-scale(start+v/2)+5,label);
 t.setAttribute('fill',k<series.length/2?'#ffffff':'#222222');
 } 
 } else horizontal?text(left+scale(v)+8,mid+offset+5,label,'start',14):text(mid+offset,bottom-scale(v)-8,label,'middle',14);
 acc=end;
 });
 if(kind==='stacked'&&!percent)horizontal?text(left+scale(acc)+8,mid+5,fmt(acc),'start',14):text(mid,bottom-scale(acc)-8,fmt(acc),'middle',14);
 });
 const legendData=kind==='single'?[]:series.map((name,k)=>({id:'bar-'+k,name,type:'bar',color:color(k)}));
 if(typeof renderLegend==='function'&&legendData.length)renderLegend(svg,legendData,{left,right,top:bottom+100,axisLabelBottom:bottom+34});


 if(oldBars.length&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const bars=[...svg.querySelectorAll('rect[data-value]')];
 const targets=bars.map(n=>Object.fromEntries(['x','y','width','height'].map(k=>[k,+n.getAttribute(k)])));
 const starts=targets.map((target,i)=>{const old=oldBars[i];return old?{x:old.x*width/oldWidth,y:old.y*height/oldHeight,width:old.width*width/oldWidth,height:old.height*height/oldHeight}:target});
 const detailCounters={};
 const details=[...svg.querySelectorAll('text,line,path')].map(n=>{
 const stem=n.tagName==='text'?'text:'+n.textContent:n.tagName;
 const key=stem+':'+(detailCounters[stem]=(detailCounters[stem]||0)+1),prior=oldDetails.get(key);
 const attrs=['x','y','x1','y1','x2','y2'].filter(k=>n.hasAttribute(k)&&prior?.attrs[k]!==undefined).map(k=>({key:k,from:+prior.attrs[k]*(k.startsWith('x')?width/oldWidth:height/oldHeight),to:+n.getAttribute(k)}));
 const targetPath=n.tagName==='path'?n.getAttribute('d'):null,oldPath=prior?.attrs.d;
 const pathNumbers=oldPath?.match(/-?\d+(?:\.\d+)?/g)?.map(Number),targetNumbers=targetPath?.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
 return {n,attrs,targetPath,pathNumbers,targetNumbers};
 });
 const begin=performance.now(),duration=760;
 function frame(now){
 const progress=Math.min(1,(now-begin)/duration),ease=1-(1-progress)**4;
 bars.forEach((n,i)=>{for(const key of ['x','y','width','height'])n.setAttribute(key,starts[i][key]+(targets[i][key]-starts[i][key])*ease)});
 details.forEach(({n,attrs,targetPath,pathNumbers,targetNumbers})=>{
 attrs.forEach(a=>n.setAttribute(a.key,a.from+(a.to-a.from)*ease));
 if(targetPath&&pathNumbers?.length===targetNumbers.length){
 let i=0;n.setAttribute('d',targetPath.replace(/-?\d+(?:\.\d+)?/g,()=>{const k=i++;return pathNumbers[k]+(targetNumbers[k]-pathNumbers[k])*ease}));
 }
 });
 if(progress<1)svg._transitionFrame=requestAnimationFrame(frame);else svg._transitionFrame=null;
 }
 frame(begin);
 }
 return {max,step,width,height,legendData};
}
const sample={title:'图表标题',metric:'名称',unit:'单位',series:['系列一','系列二','系列三'],data:[{label:'A',values:[12,9,6]},{label:'B',values:[9,11,7]},{label:'C',values:[6,8,10]},{label:'D',values:[3,5,7]}]};
function refresh(){const kind=document.body.dataset.kind;const input=structuredClone(sample);if(kind==='single'){input.series=['数值'];input.data=input.data.map(d=>({label:d.label,values:[d.values[0]]}))}try{renderChart(document.querySelector('svg'),input,{kind,direction:document.querySelector('input[name=direction]:checked').value,mode:document.querySelector('input[name=mode]:checked')?.value})}catch(e){document.querySelector('#error').textContent=e.message}}
const query=new URLSearchParams(location.search);
const desired=query.get('direction');
if(desired){const input=[...document.querySelectorAll('input[name=direction]')].find(n=>n.value===desired);if(input)input.checked=true}
document.querySelectorAll('input[type=radio]').forEach(e=>e.onchange=refresh);refresh();
