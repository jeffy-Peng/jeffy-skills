
function renderLine(svg,input,options={}){
 if(!input.labels?.length||!input.series?.length||input.series.some(s=>!s.name||s.values.length!==input.labels.length||s.values.some(v=>v!==null&&!Number.isFinite(v))))throw Error('请提供对应长度的时间标签与系列；缺失值用 null');
 const chosen=(options.single?input.series.slice(0,1):input.series).map(series=>{
 let total=0,unknown=false;const base=series.values[0];
 if(options.mode==='index'&&(base===null||base===0))throw Error('基期指数要求首值非零且已知');
 return {...series,values:series.values.map(v=>{if(options.mode==='cumulative'){if(v===null)unknown=true;else total+=v;return unknown?null:total}return options.mode==='index'&&v!==null?v/base*100:v})};
 }),values=chosen.flatMap(s=>s.values).filter(v=>v!==null);
 if(!values.length)throw Error('没有可显示的数值');
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const previous=new Map([...svg.querySelectorAll('[data-key]')].map(n=>[n.dataset.key,Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))]));
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 function add(tag,attrs,value){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(value!==undefined)n.textContent=value;svg.append(n);return n}
 function text(key,x,y,value,anchor='middle',size=16){return add('text',{'data-key':key,x,y,'font-size':size,'text-anchor':anchor},value)}
 function measure(value){const t=text('measure',0,0,value);const width=t.getBBox().width;t.remove();return width}
 const fmt=v=>Math.abs(v)>=1e7||(v!==0&&Math.abs(v)<.00001)?v.toExponential(2):Number(v.toPrecision(6)).toString();
 let low=Math.min(...values),high=Math.max(...values);
 const pad=(high-low||Math.abs(high)||1)*.12;low-=pad;high+=pad;
 if(options.zero||options.area){low=Math.min(low,0);high=Math.max(high,0)}
 const raw=(high-low)/5,power=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].find(v=>v*power>=raw)*power;
 const min=Math.floor(low/step)*step,max=Math.ceil(high/step)*step;
 const count=Math.round((max-min)/step),ticks=Array.from({length:count+1},(_,i)=>+(min+i*step).toPrecision(12));
 const left=Math.max(90,...ticks.map(v=>measure(fmt(v))+55)),top=85,bottom=400;
 const maxLabel=Math.max(...input.labels.map(measure)),spacing=Math.max(85,maxLabel+22);
 const width=Math.max(options.width||900,left+70+Math.max(input.labels.length-1,1)*spacing),right=width-(options.labels?160:65);
 const x=i=>input.labels.length===1?(left+right)/2:left+i*(right-left)/(input.labels.length-1),y=v=>bottom-(v-min)/(max-min)*(bottom-top);
 let legendRows=[],row=[],used=0;
 chosen.forEach((s,i)=>{const w=measure(s.name)+55;if(used+w>right-left&&row.length){legendRows.push(row);row=[];used=0}row.push({i,name:s.name,w});used+=w});if(row.length)legendRows.push(row);
 const height=bottom+100+legendRows.length*34;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',input.title);
 text('title',(left+right)/2,30,input.title,'middle',20);
 ticks.forEach((v,i)=>{const yy=y(v);add('line',{'data-key':'grid-'+i,x1:left,y1:yy,x2:right,y2:yy,stroke:v===0?'#999999':'#dddddd'});text('tick-'+i,left-12,yy+5,fmt(v),'end',14)});
 add('path',{'data-key':'axes',d:`M${left} ${top}V${bottom}H${right}h8l-4 3 M${left} ${top}v-8l-3 4`,fill:'none',stroke:'#222222','stroke-width':1.2});
 input.labels.forEach((v,i)=>text('category-'+i,x(i),bottom+28,v));
 const axisTitle=text('unit',22,(top+bottom)/2,options.mode==='index'?'基期 = 100':input.metric+' / '+input.unit);axisTitle.setAttribute('transform',`rotate(-90 22 ${(top+bottom)/2})`);
 const shades=['#222222','#777777','#aaaaaa'];
 chosen.forEach((series,k)=>{
 const color=options.focus!==undefined&&options.focus!==k?'#bbbbbb':shades[k%3],dash=k%3===0?'':k%3===1?'8 4':'2 4';
 let path='',lastMissing=true;
 series.values.forEach((v,i)=>{
 if(v===null){lastMissing=true;return}
 path+=lastMissing?'M'+x(i)+' '+y(v)+' ':options.shape==='step'?'H'+x(i)+' V'+y(v)+' ':'L'+x(i)+' '+y(v)+' ';lastMissing=false;
 });
 if(options.area){
 const segments=path.trim().split('M').filter(Boolean);
 segments.forEach((segment,j)=>{const nums=segment.match(/-?\d+(?:\.\d+)?/g).map(Number),first=nums[0];
 const lastX=nums.at(-2);
 add('path',{'data-key':'area-'+k+'-'+j,d:'M'+first+' '+y(0)+' L'+segment+' L'+lastX+' '+y(0)+' Z',fill:color,'fill-opacity':.1,stroke:'none'});
 });
 }
 add('path',{'data-key':'series-'+k,d:path,fill:'none',stroke:color,'stroke-width':options.focus===k?3:k===0?2.2:1.7,'stroke-dasharray':dash});
 series.values.forEach((v,i)=>{
 if(v===null)return;
 if(options.points||input.labels.length===1)add('circle',{'data-key':'point-'+k+'-'+i,cx:x(i),cy:y(v),r:3.3,fill:'#ffffff',stroke:color,'stroke-width':1.5});
 });
 });
 if(options.labels){
 const ends=chosen.flatMap((series,k)=>{const i=series.values.findLastIndex(v=>v!==null);return i<0?[]:[{k,i,v:series.values[i],yy:y(series.values[i])}]}).sort((a,b)=>a.yy-b.yy);
 ends.forEach((v,i)=>v.ly=Math.max(top+15,v.yy,i?ends[i-1].ly+24:top+15));
 if(ends.length&&ends.at(-1).ly>bottom){let shift=ends.at(-1).ly-bottom;ends.forEach(v=>v.ly-=shift)}
 ends.forEach(v=>{add('line',{'data-key':'leader-'+v.k,x1:x(v.i),y1:v.yy,x2:right+12,y2:v.ly,stroke:shades[v.k%3]});text('end-'+v.k,right+18,v.ly+5,fmt(v.v),'start',14)});
 }
 const legendData=chosen.map((series,k)=>({id:'line-'+k,name:series.name,type:'line',color:shades[k%3],dash:k%3===0?'':k%3===1?'8 4':'2 4',shape:options.shape,points:options.points}));
 if(typeof renderLegend==='function')renderLegend(svg,legendData,{left,right,top:bottom+85,axisLabelBottom:bottom+36});

 // 悬停或键盘聚焦可读每个时点的完整数据，避免多系列数值挤压。
 input.labels.forEach((label,i)=>{const zone=add('rect',{'data-key':'hit-'+i,x:x(i)-spacing/2,y:top,width:spacing,height:bottom-top,fill:'transparent',tabindex:0,role:'img','aria-label':label+'：'+chosen.map(s=>s.name+' '+(s.values[i]===null?'缺失':fmt(s.values[i]))).join('，')});addToTitle(zone,zone.getAttribute('aria-label'))});
 function addToTitle(n,t){const q=document.createElementNS(ns,'title');q.textContent=t;n.append(q)}
 if(previous.size&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const transitions=[];
 svg.querySelectorAll('[data-key]').forEach(n=>{const old=previous.get(n.dataset.key);if(!old)return;for(const key of ['x','y','x1','y1','x2','y2','cx','cy','width','height'])if(n.hasAttribute(key)&&old[key]!==undefined)transitions.push({n,key,start:+old[key],end:+n.getAttribute(key)});
 if(n.tagName==='path'&&old.d){const end=n.getAttribute('d'),nums=end.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number),from=old.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number);if(nums?.length===from?.length&&old.d.replace(/[-+\d.e ]/gi,'')===end.replace(/[-+\d.e ]/gi,''))transitions.push({n,key:'d',end,nums,from})}});
 const start=performance.now();function frame(now){const t=Math.min(1,(now-start)/760),e=1-(1-t)**4;transitions.forEach(q=>{if(q.key==='d'){let i=0;q.n.setAttribute('d',q.end.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,()=>{let k=i++;return q.from[k]+(q.nums[k]-q.from[k])*e}))}else q.n.setAttribute(q.key,q.start+(q.end-q.start)*e)});svg._frame=t<1?requestAnimationFrame(frame):null}frame(start);
 }
 return {min,max,step,width,height,legendData};
}
const sample={title:'图表标题',metric:'名称',unit:'单位',labels:['A','B','C','D','E','F'],series:[{name:'系列一',values:[12,16,14,22,19,27]},{name:'系列二',values:[9,12,17,15,21,23]},{name:'系列三',values:[6,10,8,13,16,18]}]};
function refresh(){try{renderLine(document.querySelector('svg'),sample,{single:document.querySelector('[name=series]:checked').value==='single',points:document.querySelector('[name=points]').checked,zero:document.querySelector('[name=zero]').checked,shape:document.querySelector('[name=shape]:checked').value,mode:document.querySelector('[name=mode]:checked').value,area:document.querySelector('[name=area]').checked,labels:document.querySelector('[name=labels]').checked,focus:document.querySelector('[name=focus]').checked?0:undefined});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
