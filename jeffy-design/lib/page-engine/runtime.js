
(async function(){
 const {deck,theme,catalog}=window.presentationInput;
 await document.fonts.ready;
 const colors=theme.colors,roles=Object.fromEntries(theme.scale.map(r=>[r.role,r]));
 const ns='http://www.w3.org/2000/svg',reports=[];
 function error(code,message){throw Object.assign(new Error(message),{code})}
 function element(parent,tag,attrs={},value){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(value!==undefined)n.textContent=value;parent.append(n);return n}
 function page(scene,index){
 const svg=element(document.querySelector('main'),'svg',{viewBox:'0 0 1280 720',role:'img','aria-label':scene.title});
 svg.dataset.page=index+1;
 const text=(x,y,value,role='body',anchor='start')=>{
 const t=roles[role];return element(svg,'text',{x,y,'text-anchor':anchor,'font-size':t.size,'font-weight':t.weight,'letter-spacing':t.tracking,fill:'#'+colors[t.color||'body']},value);
 };
 const measure=(value,role='body')=>{const n=text(0,0,value,role),w=n.getBBox().width;n.remove();return w};
 if(!scene.title||!scene.speakerNotes||!scene.source)error('CONTENT','页面需要标题、讲稿及来源');
 text(80,100,scene.title,'title');
 element(svg,'line',{x1:80,y1:135,x2:1200,y2:135,stroke:'#'+colors.ink,'stroke-width':theme.rules.headerWidthPx});

 if(scene.kind==='comparison'||scene.kind==='relationship'){
 const wrap=(value,width,role='body')=>{let lines=[],line='';for(const c of String(value)){if(measure(line+c,role)>width&&line){lines.push(line);line=c}else line+=c}if(line)lines.push(line);return lines};
 if(scene.kind==='comparison'){
 const t=scene.table;if(!t?.columns?.length||!t.rows?.length||t.rows.some(row=>row.length!==t.columns.length))error('TABLE','表头与数据列数不一致');
 const colWidths=t.columns.map((c,i)=>Math.max(130,measure(c,'body')+30,...t.rows.map(row=>Math.min(280,measure(row[i],'body')+30))));
 if(colWidths.reduce((a,b)=>a+b,0)>1120)error('CAPACITY','比较表列数或内容超出页面');
 const factor=1120/colWidths.reduce((a,b)=>a+b,0);let xx=80;
 t.columns.forEach((c,i)=>{text(xx+colWidths[i]*factor/2,210,c,'cardTitle','middle');xx+=colWidths[i]*factor});
 let yy=235;
 for(const row of t.rows){
 const lines=row.map((v,i)=>wrap(v,colWidths[i]*factor-28)),h=20+Math.max(...lines.map(a=>a.length))*31;
 if(yy+h>590)error('CAPACITY','比较表行高超出页面');
 element(svg,'line',{x1:80,y1:yy,x2:1200,y2:yy,stroke:'#'+colors.line});
 let x=80;lines.forEach((ls,i)=>{ls.forEach((line,j)=>text(x+colWidths[i]*factor/2,yy+30+j*31,line,'body','middle'));x+=colWidths[i]*factor});yy+=h;
 }
 text(80,640,scene.takeaway,'cardTitle');
 }else{
 const graph=scene.graph;if(!graph?.nodes?.length||graph.nodes.length!==3)error('GRAPH','当前机制组合支持三个主体');
 const pts=[[640,235],[300,465],[980,465]],nodes=new Map(graph.nodes.map((n,i)=>[n.id,{...n,x:pts[i][0],y:pts[i][1]}]));
 const defs=element(svg,'defs'),m=element(defs,'marker',{id:'arrow-'+index,viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:6,markerHeight:6,orient:'auto'});
 element(m,'path',{d:'M1 1L7 4L1 7Z',fill:'#'+colors.body});
 graph.edges.forEach((e,i)=>{
 const a=nodes.get(e.from),b=nodes.get(e.to);if(!a||!b)error('GRAPH','关系引用无效主体');
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,offset=16;
 const x1=a.x+ux*87-uy*offset,y1=a.y+uy*87+ux*offset,x2=b.x-ux*90-uy*offset,y2=b.y-uy*90+ux*offset;
 element(svg,'line',{x1,y1,x2,y2,stroke:'#'+colors.body,'marker-end':'url(#arrow-'+index+')'});
 const lx=(x1+x2)/2-uy*18,ly=(y1+y2)/2+ux*18;
 const label=text(lx,ly+5,e.label,'body','middle');const box=label.getBBox();const bg=element(svg,'rect',{x:box.x-5,y:box.y-3,width:box.width+10,height:box.height+6,fill:'#'+colors.paper});svg.insertBefore(bg,label);
 });
 nodes.forEach(n=>{element(svg,'rect',{x:n.x-80,y:n.y-35,width:160,height:70,fill:'#'+colors.paper,stroke:'#'+colors.body});text(n.x,n.y+5,n.title,'cardTitle','middle')});
 let y=585;for(const line of wrap(scene.takeaway,1120)){text(80,y,line,'body');y+=31}if(y>660)error('CAPACITY','机制解释过长');
 }
 text(80,684,scene.source,'source');text(1200,684,String(index+1).padStart(2,'0'),'pageNo','end');
 const texts=[...svg.querySelectorAll('text')],hits=[];
 for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){const a=texts[i].getBBox(),b=texts[j].getBBox();if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)hits.push([texts[i].textContent,texts[j].textContent])}
 if(hits.length)error('LAYOUT','文字碰撞，需调整组合或文案');
 return {id:scene.id,kind:scene.kind,collisions:hits};
 }
 const split=scene.layout?.kind==='chart-notes',chartEdge=split?800:1200,legendAvailable=chartEdge-120;
 const chart=scene.chart,data=scene.data;
 if(!data?.categories?.length||new Set(data.categories).size!==data.categories.length)error('CATEGORIES','横轴标签须非空且唯一');
 if(!chart?.series?.length||chart.series.length>6)error('SERIES','当前验证分支支持1至6个系列');
 const layers=chart.series.map(s=>{
 const component=catalog.components.find(c=>c.type===s.type);if(!component)error('COMPONENT','当前成页入口尚未接入该素材');
 if(!s.name||!['raw','cumulative','index'].includes(s.mode||'raw')||s.shape&&!['linear','step'].includes(s.shape))error('OPTIONS','系列名称或参数无效');
 const values=data.values[s.field];
 if(!['bar','line'].includes(s.type)||!values||values.length!==data.categories.length||values.some(v=>v!==null&&!Number.isFinite(v)))error('INPUT','系列类型、字段与类别数不匹配');
 if(s.type==='bar'&&values.some(v=>v===null||v<0))error('BAR_DOMAIN','当前柱组件接收有限非负值');
 let total=0,missing=false;
 if(s.mode==='index'&&(values[0]===0||values[0]===null))error('INDEX','指数首值须非零且已知');
 const calculated=values.map(v=>{if(s.mode==='cumulative'){if(v===null)missing=true;else total+=v;return missing?null:total}return s.mode==='index'&&v!==null?v/values[0]*100:v});
 return {...s,values:calculated,axis:s.axis||'left'};
 });
 for(const s of layers)if(!chart.axes?.[s.axis])error('AXIS','系列引用的轴未定义');
 const axisNames=['left','right'].filter(k=>layers.some(s=>s.axis===k));
 if(!axisNames.includes('left')||layers.some(s=>!axisNames.includes(s.axis)))error('AXIS','轴须为left或right，至少包含left');
 for(const axis of axisNames){const units=new Set(layers.filter(s=>s.axis===axis).map(s=>s.unit));if(units.size!==1||![...units][0])error('UNIT','同一轴需要统一且明确的单位')}
 function scale(axis){
 const values=layers.filter(s=>s.axis===axis).flatMap(s=>s.values).filter(v=>v!==null);if(!values.length)error('EMPTY','数值轴没有有效数据');
 const config=chart.axes[axis],bars=layers.some(s=>s.axis===axis&&s.type==='bar');
 let lo=Math.min(...values),hi=Math.max(...values);
 if(bars||config.includeZero){lo=Math.min(0,lo);hi=Math.max(0,hi)}
 if(lo===hi){if(lo===0){lo=0;hi=1}else{const p=Math.abs(lo)*.1;lo-=p;hi+=p}}
 const raw=((config.max??hi)-(config.min??lo))/5,power=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].find(x=>x*power>=raw)*power;
 const min=config.min??Math.floor(lo/step)*step,max=config.max??Math.ceil(hi/step)*step;
 if(!(max>min)||Math.min(...values)<min||Math.max(...values)>max||bars&&min!==0)error('RANGE','轴范围必须覆盖数据，柱轴从零起');
 return {min,max,step,ticks:Array.from({length:Math.floor((max-min)/step)+1},(_,i)=>+(min+i*step).toPrecision(12))};
 }
 const axes=Object.fromEntries(axisNames.map(k=>[k,scale(k)])),format=v=>Math.abs(v)>=1e7||v!==0&&Math.abs(v)<1e-4?v.toExponential(2):Number(v.toPrecision(6)).toString();
 const legend=layers.map((s,i)=>({...s,color:'#'+(i===0?colors.accent:i===1?colors.accent2:colors.body),width:measure(s.name,'body')+58}));
 const legendRows=[];let row=[],used=0;
 for(const item of legend){if(item.width>legendAvailable)error('LEGEND_CAPACITY','图例名称过长');if(row.length&&used+item.width+25>legendAvailable){legendRows.push(row);row=[];used=0}row.push(item);used+=item.width+25}if(row.length)legendRows.push(row);
 const tickWidth=axis=>Math.max(...axes[axis].ticks.map(v=>measure(format(v),'pill')));
 const left=80+45+tickWidth('left'),right=chartEdge-(axes.right?45+tickWidth('right'):10),top=200,bottom=(split?470:590)-legendRows.length*34;
 const maxLabel=Math.max(...data.categories.map(v=>measure(v,'body'))),slot=(right-left)/data.categories.length;
 if(slot<maxLabel+18||bottom-top<180)error('CAPACITY','当前区域无法按主题字号容纳类别或图例，请扩大区域、减少同页内容或改变呈现');
 const y=(v,axis)=>bottom-(v-axes[axis].min)/(axes[axis].max-axes[axis].min)*(bottom-top),x=i=>left+(i+.5)*slot;
 element(svg,'path',{d:'M'+left+' '+bottom+'H'+right+'h8l-4 3',fill:'none',stroke:'#'+colors.ink,'stroke-width':theme.rules.dividerWidthPx});
 for(const axis of axisNames){
 const xx=axis==='left'?left:right;
 element(svg,'path',{d:'M'+xx+' '+bottom+'V'+top+'v-8l'+(axis==='left'?-3:3)+' 4',fill:'none',stroke:'#'+colors.ink,'stroke-width':theme.rules.dividerWidthPx});
 for(const v of axes[axis].ticks){
 const yy=y(v,axis);
 if(axis==='left')element(svg,'line',{x1:left,y1:yy,x2:right,y2:yy,stroke:'#'+colors.line});
 text(xx+(axis==='left'?-12:12),yy+5,format(v),'pill',axis==='left'?'end':'start');
 }
 const title=chart.axes[axis].title+' / '+layers.find(s=>s.axis===axis).unit;
 const t=text(axis==='left'?85:chartEdge-10,(top+bottom)/2,title,'body','middle'),xxTitle=axis==='left'?85:chartEdge-10;
 t.setAttribute('transform',`rotate(-90 ${xxTitle} ${(top+bottom)/2})`);
 }
 data.categories.forEach((c,i)=>text(x(i),bottom+29,c,'body','middle'));
 const bars=legend.filter(s=>s.type==='bar'),barWidth=Math.min(36,(slot-25)/Math.max(1,bars.length)-6);
 const metrics=[];
 for(const s of legend){
 if(s.type==='bar')s.values.forEach((v,i)=>{
 const xx=x(i)+(bars.indexOf(s)-(bars.length-1)/2)*(barWidth+6),yy=y(v,s.axis);
 element(svg,'rect',{'data-series':s.field,x:xx-barWidth/2,y:yy,width:barWidth,height:bottom-yy,fill:s.color});
 metrics.push({field:s.field,index:i,x:x(i),y:yy,value:v,axis:s.axis});
 });
 else{
 let path='',pen=false;
 s.values.forEach((v,i)=>{if(v===null){pen=false;return}const xx=x(i),yy=y(v,s.axis);path+=!pen?`M${xx} ${yy}`:s.shape==='step'?`H${xx}V${yy}`:`L${xx} ${yy}`;pen=true;
 element(svg,'circle',{'data-series':s.field,cx:xx,cy:yy,r:3,fill:'#'+colors.paper,stroke:s.color});
 metrics.push({field:s.field,index:i,x:xx,y:yy,value:v,axis:s.axis});
 });
 element(svg,'path',{'data-series':s.field,d:path,fill:'none',stroke:s.color,'stroke-width':2});
 }
 }
 legendRows.forEach((items,i)=>{
 const total=items.reduce((a,b)=>a+b.width,0),space=Math.min(right-left,Math.max(total+38*(items.length-1),(right-left)*.75)),gap=items.length>1?(space-total)/(items.length-1):0;
 let cursor=(left+right-(items.length===1?total:space))/2;const yy=bottom+65+i*34;
 items.forEach(s=>{
 if(s.type==='bar')element(svg,'rect',{x:cursor,y:yy-6,width:18,height:12,fill:s.color});
 else element(svg,'path',{d:s.shape==='step'?`M${cursor} ${yy+4}h10v-8h14`:`M${cursor} ${yy}h24`,fill:'none',stroke:s.color,'stroke-width':2});
 const n=text(cursor+33,yy,s.name,'body');n.setAttribute('dominant-baseline','central');cursor+=s.width+gap;
 });
 });

 if(split){
 const wrap=(value,width,role='body')=>{const lines=[];let line='';for(const char of String(value)){if(measure(line+char,role)>width&&line){lines.push(line);line=char}else line+=char}if(line)lines.push(line);return lines};
 let yy=205;
 for(const block of scene.explanation||[]){
 for(const title of wrap(block.title,330,'cardTitle')){text(860,yy,title,'cardTitle');yy+=28}
 yy+=8;
 for(const line of wrap(block.body,330)){text(860,yy,line);yy+=roles.body.size*roles.body.lineHeight}
 yy+=26;
 }
 if(yy>650)error('CAPACITY','说明区域超出页面，请缩短说明或拆页');
 if(scene.table){
 const table=scene.table;if(!table.columns?.length||table.rows.some(row=>row.length!==table.columns.length))error('TABLE','表格列数不一致');
 const widths=table.columns.map((name,i)=>Math.max(measure(name,'pill'),...table.rows.map(row=>measure(String(row[i]),'pill')))+30);
 const total=widths.reduce((a,b)=>a+b,0);if(total>720||table.rows.length>3)error('CAPACITY','对照表超出预留区域');
 let x=80;
 for(let i=0;i<widths.length;i++){text(x+widths[i]/2,554,table.columns[i],'pill','middle');table.rows.forEach((row,k)=>text(x+widths[i]/2,586+k*29,String(row[i]),'pill','middle'));x+=widths[i]}
 element(svg,'line',{x1:80,y1:565,x2:80+total,y2:565,stroke:'#'+colors.line});
 }
 }
 text(80,684,scene.source,'source');text(1200,684,String(index+1).padStart(2,'0'),'pageNo','end');
 const collisions=[],outside=[],texts=[...svg.querySelectorAll('text')];for(let i=0;i<texts.length;i++){const a=texts[i].getBoundingClientRect(),frame=svg.getBoundingClientRect();if(a.left<frame.left-1||a.right>frame.right+1||a.top<frame.top-1||a.bottom>frame.bottom+1)outside.push(texts[i].textContent);for(let j=i+1;j<texts.length;j++){const b=texts[j].getBoundingClientRect();if(a.width&&b.width&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)collisions.push([texts[i].textContent,texts[j].textContent])}}
 if(collisions.length||outside.length)error('LAYOUT','主题字号下文字碰撞或越界，请调整内容或布局');
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
 svg.querySelectorAll('rect[data-series]').forEach(n=>{n.style.transformBox='fill-box';n.style.transformOrigin='center bottom';n.animate([{transform:'scaleY(0)'},{transform:'none'}],{duration:760,easing:'cubic-bezier(.22,1,.36,1)'})});
 svg.querySelectorAll('path[data-series]').forEach(n=>{const length=n.getTotalLength();n.animate([{strokeDasharray:length+' '+length,strokeDashoffset:length},{strokeDasharray:length+' '+length,strokeDashoffset:0}],{duration:760,easing:'cubic-bezier(.22,1,.36,1)'})});
 }
 return {id:scene.id,axes,plot:{left,right,top,bottom},metrics,legendCount:legend.length,collisions,outside};
 }
 for(let i=0;i<deck.pages.length;i++){try{reports.push({ok:true,...page(deck.pages[i],i)})}catch(e){reports.push({id:deck.pages[i].id,ok:false,code:e.code||'ERROR',message:e.message});document.querySelector('svg[data-page="'+(i+1)+'"]')?.remove();const p=document.createElement('p');p.className='failure';p.textContent=deck.pages[i].title+'：'+e.message;document.querySelector('main').append(p)}}
 window.validationReport=reports;window.renderComplete=true;
 document.querySelector('#status').textContent=reports.every(r=>r.ok)?'页面渲染与约束检查通过':'有页面需要调整，请查看验收记录';
})();
