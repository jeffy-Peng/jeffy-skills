const NS='http://www.w3.org/2000/svg',theme=window.theme;
function context(id,title,index){let s=document.getElementById(id),p=LayerDrawing.create(s,theme);s.style.fontFamily=`"${theme.fonts.latin}","${theme.fonts.ea}",serif`;let defs=document.createElementNS(NS,'defs');defs.innerHTML=`<marker id="${id}-arrow" viewBox="0 0 8 6" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0 0L8 3L0 6Z" fill="#555"/></marker>`;s.append(defs);p.text(64,65,title,'title');p.connector('header','M64 118H1216');p.text(64,685,'来源：合成场景与测试数据；图内布局由本次内容设计，不代表真实业务。','source');p.text(1190,685,String(index).padStart(2,'0'),'pageNo');return{s,p}}
function raw(s,tag,a){let n=document.createElementNS(NS,tag);for(let[k,v]of Object.entries(a))n.setAttribute(k,v);s.append(n);return n}
function wrap(p,x,y,value,width,role='body',attrs={}){let measure=p.text(0,0,'',role),lines=[],line='';for(let ch of value){measure.textContent=line+ch;if(measure.getBBox().width>width&&line){lines.push(line);line=ch}else line+=ch}if(line)lines.push(line);measure.remove();lines.forEach((v,i)=>p.text(x,y+(i-(lines.length-1)/2)*20,v,role,attrs));}
{
const data=cases.flow,{s,p}=context('flow',data.title,1);
for(const e of data.edges){const n=p.connector(e.id,e.path);n.setAttribute('marker-end','url(#flow-arrow)');if(e.feedback)n.setAttribute('stroke-dasharray','6 4')}
for(const n of data.nodes){if(n.type==='decision')raw(s,'path',{'data-flow-node':n.id,'data-node-type':n.type,d:`M${n.x+n.w/2} ${n.y}L${n.x+n.w} ${n.y+n.h/2}L${n.x+n.w/2} ${n.y+n.h}L${n.x} ${n.y+n.h/2}Z`,fill:'white',stroke:'#777'});else p.box(n.id,n,{rx:['start','end'].includes(n.type)?24:0,'data-flow-node':n.id,'data-node-type':n.type});(n.lines||[n.title]).forEach((line,i,lines)=>p.text(n.x+n.w/2,n.y+n.h/2+(i-(lines.length-1)/2)*20,line,'body',{'text-anchor':'middle','data-node-title':n.id}))}
for(const e of data.edges)if(e.label)p.text(e.labelX,e.labelY,e.label,'pill',{'text-anchor':'middle','data-line-label':'true'});
p.text(64,650,'边界：本例先核对结果，最多同键重试一次；转人工是自动流程出口，不代表争议已经解决。','body');updateLineLabelMasks(s);
}
{
const data=cases.bar,{s,p}=context('bar',data.title,2),left=370,right=870,bottom=610;
p.text(64,151,'处理环节（名称完整保留）','body');p.text(620,151,'处理耗时','body',{'text-anchor':'middle'});p.text(920,151,'已知原因 / 排查方向','body');
for(const row of data.rows)if(row.focus)p.box('focus-row',{x:64,y:row.y-26,w:1152,h:52},{fill:'#f1f1f1',stroke:'none'});
for(let v=0;v<=100;v+=20){let x=left+(right-left)*v/100;p.connector('grid'+v,`M${x} 198V${bottom}`).setAttribute('stroke','#ddd');p.text(x,631,String(v),'pill',{'text-anchor':'middle'})}
p.connector('axis',`M${left} 198V${bottom}H${right}l8 0l-4 3`);p.text(right,653,'耗时 / 分钟','pill',{'text-anchor':'end'});p.text(64,184,'申请审核','cardTitle');p.text(64,405,'退款执行','cardTitle');
for(const row of data.rows){wrap(p,64,row.y,row.label,270,'body',{'data-category':row.id});let bar=p.box(row.id,{x:left,y:row.y-10,w:(right-left)*row.value/data.max,h:20},{fill:row.focus?'#222':'#aaa',stroke:'none','data-bar':row.id,'data-value':row.value});p.text(left+(right-left)*row.value/data.max+10,row.y,String(row.value),'body');wrap(p,920,row.y,row.reason,280,'body',{'data-reason':row.id})}
}
{
const data=cases.sequence,{s,p}=context('sequence',data.title,3),positions=new Map(data.participants.map(x=>[x.id,x.x]));
for(const a of data.participants){let n=p.connector('life-'+a.id,`M${a.x} 188V650`);n.setAttribute('stroke','#ccc');n.setAttribute('stroke-dasharray','5 5');n.removeAttribute('data-connector');p.box(a.id,{x:a.x-75,y:145,w:150,h:43},{'data-participant':a.id});p.text(a.x,166,a.title,'cardTitle',{'text-anchor':'middle'})}
p.box('timeout',{x:430,y:305,w:340,h:40},{fill:'#f3f3f3',stroke:'#bbb'});p.text(600,325,'等待超时：处理结果未知','body',{'text-anchor':'middle','data-node-description':'true'});
p.box('condition',{x:395,y:354,w:805,h:242},{fill:'none',stroke:'#aaa','stroke-dasharray':'4 3'});p.text(415,371,'超时后先查询；查询结果决定是否重试','pill');
for(const m of data.messages){let x1=positions.get(m.source),x2=positions.get(m.target);let path=p.connector(m.id,`M${x1} ${m.y}H${x2}`);path.setAttribute('data-message',m.id);path.setAttribute('marker-end','url(#sequence-arrow)');if(m.return)path.setAttribute('stroke-dasharray','6 4');p.text((x1+x2)/2,m.y,m.label,'body',{'text-anchor':'middle','data-line-label':'true'})}
p.text(420,482,'已受理：禁止重复提交','pill');p.text(795,482,'未受理且未重试：沿用 K 重试','pill');p.text(64,659,'顺序示意，纵向间距不是耗时；条件区域内的重试消息只在对应条件成立时发生。','pill');updateLineLabelMasks(s);
}
window.renderComplete=true;
