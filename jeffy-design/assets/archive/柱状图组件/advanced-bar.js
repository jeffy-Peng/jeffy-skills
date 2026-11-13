
function renderChart(svg,input,opt={}){
 if(svg._transitionFrame)cancelAnimationFrame(svg._transitionFrame);
 const oldWidth=svg.viewBox.baseVal.width||1,oldHeight=svg.viewBox.baseVal.height||1;
 const oldBars=[...svg.querySelectorAll('rect[data-value]')].map(n=>Object.fromEntries(['x','y','width','height'].map(k=>[k,+n.getAttribute(k)])));
 const oldDetails=new Map(),counters={};
 for(const n of svg.querySelectorAll('text,line,path')){const stem=n.tagName==='text'?'text:'+n.textContent:n.tagName;oldDetails.set(stem+':'+(counters[stem]=(counters[stem]||0)+1),{attrs:Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))})}
 const kind=opt.kind,horizontal=opt.direction==='horizontal';
 if(!input.data?.length||input.data.some(d=>!d.label||!Number.isFinite(d.value)||(kind==='target'&&!Number.isFinite(d.target))))throw Error('请提供类别和有效数值，目标图还需目标值');
 let cumulative=0;
 const rows=input.data.map((d,i)=>{let start=0,end=d.value;if(kind==='waterfall'){start=i?cumulative:0;end=start+d.value;cumulative=end}return {...d,start,end}});
 if(kind==='waterfall')rows.push({label:'合计',start:0,end:cumulative,value:cumulative,total:true});
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(tag,attrs,v)=>{const n=document.createElementNS(ns,tag);for(const[k,x]of Object.entries(attrs))n.setAttribute(k,x);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(x,y,v,anchor='middle',size=16)=>add('text',{x,y,'text-anchor':anchor,'font-size':size},v);
 const fmt=v=>Math.abs(v)>=1e7?v.toExponential(2):Number(v.toPrecision(6)).toString();
 const measure=v=>{let n=text(0,0,v),w=n.getBBox().width;n.remove();return w};
 const numbers=rows.flatMap(d=>[d.start,d.end,...(kind==='target'?[d.target]:[])]);
 const lo=Math.min(0,...numbers),hi=Math.max(0,...numbers),raw=(hi-lo||1)/5,pow=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].find(v=>v*pow>=raw)*pow,min=Math.floor(lo/step)*step,max=Math.ceil(hi/step)*step||step;
 const labelWidth=Math.max(...rows.map(d=>measure(d.label))),valueWidth=Math.max(...numbers.map(v=>measure(fmt(v))))+25;
 const width=Math.max(900,horizontal?labelWidth+valueWidth*2+540:rows.length*Math.max(130,labelWidth+30)+140);
 const left=horizontal?labelWidth+valueWidth+30:90,right=width-valueWidth-25,top=100,bottom=horizontal?top+rows.length*85:450,height=bottom+150;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',input.title);
 const x=v=>left+(v-min)/(max-min)*(right-left),y=v=>bottom-(v-min)/(max-min)*(bottom-top);
 const line=(a,b,c,d,color='#dddddd')=>add('line',{x1:a,y1:b,x2:c,y2:d,stroke:color});
 text((left+right)/2,35,input.title,'middle',20);
 for(let i=0;i<=Math.round((max-min)/step);i++){let v=+(min+i*step).toPrecision(12);if(horizontal){line(x(v),top,x(v),bottom,v===0?'#222':'#ddd');text(x(v),bottom+25,fmt(v),'middle',14)}else{line(left,y(v),right,y(v),v===0?'#222':'#ddd');text(left-12,y(v)+5,fmt(v),'end',14)}}
 add('path',{d:`M${left} ${top}V${bottom}H${right}h8l-4 3 M${left} ${top}v-8l-3 4`,fill:'none',stroke:'#222','stroke-width':1.3});
 if(horizontal)text(right,bottom+55,input.metric+' / '+input.unit,'end',14);else{let n=text(22,(top+bottom)/2,input.metric+' / '+input.unit);n.setAttribute('transform',`rotate(-90 22 ${(top+bottom)/2})`)}
 const band=(horizontal?bottom-top:right-left)/rows.length;
 rows.forEach((d,i)=>{
 let mid=(horizontal?top:left)+(i+.5)*band,w=32,negative=d.end<d.start;
 const rect=horizontal?{x:Math.min(x(d.start),x(d.end)),y:mid-w/2,width:Math.abs(x(d.end)-x(d.start)),height:w}:{x:mid-w/2,y:Math.min(y(d.start),y(d.end)),width:w,height:Math.abs(y(d.end)-y(d.start))};
 add('rect',{...rect,fill:d.total||i===0?'#222222':negative?'#bbbbbb':'#777777','data-value':d.value});
 horizontal?text(labelWidth+10,mid+5,d.label,'end'):text(mid,bottom+26,d.label);
 const v=kind==='waterfall'&&i>0&&!d.total?(d.value>0?'+':'')+fmt(d.value):fmt(d.value);
 if(horizontal)text(x(d.end)+(negative?-9:9),mid+5,v,negative?'end':'start',14);
 else text(mid,Math.min(y(d.start),y(d.end))-10,v,'middle',14);
 if(kind==='target'){if(horizontal){line(x(d.target),mid-25,x(d.target),mid+25,'#222');text(x(d.target),mid-31,fmt(d.target),'middle',14)}else{line(mid-28,y(d.target),mid+28,y(d.target),'#222');text(mid+33,y(d.target)+5,fmt(d.target),'start',14)}}
 if(kind==='waterfall'&&i<rows.length-2){horizontal?line(x(d.end),mid+16,x(d.end),mid+band-16,'#999'):line(mid+16,y(d.end),mid+band-16,y(d.end),'#999')}
 });
 if(kind==='target')text((left+right)/2,bottom+105,'柱条：实际值　　刻线：目标值','middle',14);
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

 return {min,max,step,width,height};
}
const kind=document.body.dataset.kind;
const samples={signed:[{label:'A',value:28.5},{label:'B',value:17.2},{label:'C',value:-21.6},{label:'D',value:-9.4}],waterfall:[{label:'起点',value:20},{label:'A',value:8},{label:'B',value:-5},{label:'C',value:12}],target:[{label:'A',value:72,target:90},{label:'B',value:85,target:80},{label:'C',value:54,target:70},{label:'D',value:92,target:100}]};
function refresh(){try{renderChart(document.querySelector('svg'),{title:'图表标题',metric:'名称',unit:'单位',data:samples[kind]},{kind,direction:document.querySelector('input[name=direction]:checked').value});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
