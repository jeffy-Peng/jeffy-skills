
const ns='http://www.w3.org/2000/svg';
function start(svg,w,h,name){svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('aria-label',name);return {
 add(tag,a,v){let n=document.createElementNS(ns,tag);for(let[k,v]of Object.entries(a))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n},
 text(x,y,v,size=16,anchor='middle'){let n=document.createElementNS(ns,'text');for(let[k,v]of Object.entries({x,y,'font-size':size,'text-anchor':anchor,'dominant-baseline':'central'}))n.setAttribute(k,v);n.textContent=v;svg.append(n);return n}
}}
function measure(svg,v,size=16){let n=document.createElementNS(ns,'text');n.setAttribute('font-size',size);n.textContent=v;svg.append(n);const w=n.getBBox().width;n.remove();return w}
function entrance(svg){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;svg.querySelectorAll('[data-mark]').forEach((n,i)=>n.animate([{opacity:.3},{opacity:1}],{duration:760,delay:Math.min(i*12,160),easing:'cubic-bezier(.22,1,.36,1)'}))}
function renderHeat(svg,input,opt={}){
 if(!input.rows?.length||!input.columns?.length||input.values.length!==input.rows.length||input.values.some(row=>row.length!==input.columns.length||row.some(v=>v!==null&&!Number.isFinite(v))))throw Error('请提供行、列及对应矩阵，缺失值用 null');
 const vals=input.values.flat().filter(v=>v!==null);if(!vals.length)throw Error('没有可编码的数值');
 start(svg,1000,600,'热力矩阵');
 const maxLabel=Math.max(...input.rows.map(v=>measure(svg,v))),cellW=Math.max(88,...input.columns.map(v=>measure(svg,v)+28)),left=maxLabel+45,top=110,height=top+input.rows.length*62+100,width=Math.max(900,left+input.columns.length*cellW+45);
 const {add,text}=start(svg,width,height,'热力矩阵'),min=opt.zero?Math.min(0,...vals):Math.min(...vals),max=Math.max(...vals);
 input.columns.forEach((v,i)=>text(left+(i+.5)*cellW,top-28,v));
 input.rows.forEach((v,i)=>{text(left-17,top+(i+.5)*62,v,16,'end');input.values[i].forEach((value,j)=>{
 const ratio=value===null?0:max===min?.5:(value-min)/(max-min),shade=Math.round(242-ratio*198);
 const cell=add('rect',{x:left+j*cellW+2,y:top+i*62+2,width:cellW-4,height:58,fill:value===null?'#ffffff':`rgb(${shade},${shade},${shade})`,stroke:value===null?'#dddddd':'none','data-mark':true});
 let title=document.createElementNS(ns,'title');title.textContent=v+' / '+input.columns[j]+'：'+(value===null?'缺失':value);cell.append(title);
 if(opt.labels||value===null){const label=text(left+(j+.5)*cellW,top+(i+.5)*62,value===null?'—':Number(value.toPrecision(5)),16);label.setAttribute('fill',value!==null&&ratio>.55?'#ffffff':'#222222')}
 })});
 const yy=height-47;for(let i=0;i<7;i++){const shade=Math.round(242-i/6*198);add('rect',{x:left+i*23,y:yy-8,width:23,height:14,fill:`rgb(${shade},${shade},${shade})`})}
 text(left,yy+24,min,13);text(left+161,yy+24,max,13);text(left+195,yy,input.unit+' · 深色表示更大','14','start');
 entrance(svg);return {min,max,cells:vals.length,width,height};
}
function renderDistribution(svg,input,opt={}){
 if(!input.values?.length||input.values.some(v=>!Number.isFinite(v)))throw Error('需要原始有限数值数组');
 const values=[...input.values].sort((a,b)=>a-b),min=values[0],max=values.at(-1);
 const bins=opt.bins||Math.max(1,Math.ceil(Math.sqrt(values.length))),range=max-min||Math.max(1,Math.abs(min)*.1),lo=max===min?min-range/2:min,step=range/bins,counts=Array(bins).fill(0);
 if(!Number.isInteger(bins)||bins<1||bins>30)throw Error('分箱数须为1至30');
 values.forEach(v=>counts[Math.max(0,Math.min(bins-1,Math.floor((v-lo)/step)))]++);
 const width=Math.max(950,bins*100+150),height=550,left=100,right=width-55,top=75,bottom=390,peak=Math.max(...counts);
 const {add,text}=start(svg,width,height,'分布图'),barW=(right-left)/bins;
 for(let n=0;n<=peak;n+=Math.max(1,Math.ceil(peak/5))){const y=bottom-n/peak*(bottom-top);add('line',{x1:left,y1:y,x2:right,y2:y,stroke:'#dddddd'});text(left-18,y,n,14,'end')}
 add('path',{d:`M${left} ${top}V${bottom}H${right}h8l-4 3 M${left} ${top}v-8l-3 4`,fill:'none',stroke:'#333333'});
 const f=v=>Number(v.toPrecision(4));
 counts.forEach((n,i)=>{const h=n/peak*(bottom-top);add('rect',{x:left+i*barW+1,y:bottom-h,width:barW-2,height:h,fill:'#777777','data-mark':true});if(opt.labels)text(left+(i+.5)*barW,bottom-h-15,n,14)});
 for(let i=0;i<=bins;i++)text(left+i*barW,bottom+25,f(lo+i*step),14);
 const title=text(30,(top+bottom)/2,'记录数',16);title.setAttribute('transform',`rotate(-90 30 ${(top+bottom)/2})`);text(right,bottom+58,input.metric+' / '+input.unit,14,'end');
 text(left,height-28,'样本 '+values.length+' 条；区间左闭右开，最后一箱包含右端点。',14,'start');entrance(svg);
 return {bins,counts,total:counts.reduce((a,b)=>a+b,0),min,max};
}
function renderSankey(svg,input,opt={}){
 if(!input.sources?.length||!input.targets?.length||!input.flows?.length)throw Error('需要来源、去向及流量');
 const sources=new Map(input.sources.map(n=>[n.id,{...n,total:0}])),targets=new Map(input.targets.map(n=>[n.id,{...n,total:0}]));
 if(sources.size!==input.sources.length||targets.size!==input.targets.length||input.flows.some(f=>!sources.has(f.from)||!targets.has(f.to)||!Number.isFinite(f.value)||f.value<0))throw Error('节点须唯一，流量须为非负值且两端有效');
 input.flows.forEach(f=>{sources.get(f.from).total+=f.value;targets.get(f.to).total+=f.value});
 const total=input.flows.reduce((a,f)=>a+f.value,0);if(!total)throw Error('流量合计为零，无法表示带宽');
 start(svg,1000,600,'桑基图');
 const labels=[...sources.values(),...targets.values()],margin=Math.max(180,...labels.map(n=>measure(svg,n.title+'  '+n.total)+35));
 const width=Math.max(1000,margin*2+600),height=Math.max(590,Math.max(sources.size,targets.size)*85+130),top=80,gap=32,available=height-160;
 const scale=Math.min((available-(sources.size-1)*gap)/total,(available-(targets.size-1)*gap)/total),left=margin,right=width-margin,nodeW=12;
 const {add,text}=start(svg,width,height,'来源与去向');
 function layout(map,x){let cursor=top+(available-(total*scale+(map.size-1)*gap))/2;for(const n of map.values()){n.x=x;n.y=cursor;n.h=n.total*scale;n.offset=0;cursor+=n.h+gap}}
 layout(sources,left);layout(targets,right);
 const flowLabels=[];
 input.flows.forEach((f,i)=>{
 if(f.value===0)return;const s=sources.get(f.from),t=targets.get(f.to),h=f.value*scale,sy=s.y+s.offset,ty=t.y+t.offset,x1=left+nodeW,x2=right,c=(x1+x2)/2;s.offset+=h;t.offset+=h;
 const path=add('path',{d:`M${x1} ${sy}C${c} ${sy} ${c} ${ty} ${x2} ${ty}L${x2} ${ty+h}C${c} ${ty+h} ${c} ${sy+h} ${x1} ${sy+h}Z`,fill:i%2?'#bbbbbb':'#dddddd',stroke:'white','stroke-width':.7,'data-mark':true,tabindex:0,role:'img','aria-label':s.title+' → '+t.title+'：'+f.value+input.unit});
 const title=document.createElementNS(ns,'title');title.textContent=path.getAttribute('aria-label');path.append(title);
 if(opt.labels&&h>24)flowLabels.push({x:x1+(x2-x1)*.248,y:sy+h/2+(ty-sy)*.104,value:f.value});
 });
 flowLabels.forEach(n=>text(n.x,n.y,n.value,14));
 for(const [map,side] of [[sources,'left'],[targets,'right']])for(const n of map.values()){
 add('rect',{x:n.x,y:n.y,width:nodeW,height:Math.max(1,n.h),fill:'#555555'});
 text(side==='left'?n.x-15:n.x+nodeW+15,n.y+n.h/2,n.title+(opt.totals?'  '+n.total:''),16,side==='left'?'end':'start');
 }
 text(left,35,'来源',16);text(right,35,'去向',16);text(width/2,height-25,'总流量 '+total+' '+input.unit+'；带宽表示数量。',14);entrance(svg);
 return {total,sourceTotals:[...sources.values()].map(n=>n.total),targetTotals:[...targets.values()].map(n=>n.total),scale};
}
const samples={
heat:{rows:['类别 A','类别 B','类别 C','类别 D'],columns:['维度一','维度二','维度三','维度四','维度五'],values:[[12,8,18,5,10],[6,15,9,13,7],[18,11,4,16,12],[9,6,14,8,17]],unit:'单位'},
distribution:{metric:'指标',unit:'单位',values:[2,3,3,4,4,5,5,5,6,6,6,7,7,8,9,10,12,14,18,21]},
sankey:{sources:[{id:'a',title:'来源 A'},{id:'b',title:'来源 B'},{id:'c',title:'来源 C'}],targets:[{id:'x',title:'去向 X'},{id:'y',title:'去向 Y'},{id:'z',title:'去向 Z'}],flows:[{from:'a',to:'x',value:30},{from:'a',to:'y',value:15},{from:'b',to:'x',value:10},{from:'b',to:'z',value:25},{from:'c',to:'y',value:20},{from:'c',to:'z',value:10}],unit:'单位'}
};
function refresh(){try{const kind=document.querySelector('main').dataset.kind;const fn={heat:renderHeat,distribution:renderDistribution,sankey:renderSankey}[kind];window.result=fn(document.querySelector('svg'),samples[kind],{labels:document.querySelector('[name=labels]').checked,totals:true,zero:document.querySelector('[name=zero]')?.checked,bins:Number(document.querySelector('[name=bins]:checked')?.value)||undefined});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
