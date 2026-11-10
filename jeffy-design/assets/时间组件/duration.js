
function renderDuration(svg,input,opt={}){
 if(!input.items?.length)throw Error('需要事项及起止日期');
 const rows=input.items.map(d=>({...d,a:Date.parse(d.start),b:Date.parse(d.end)}));
 if(rows.some(d=>!d.title||!Number.isFinite(d.a)||!Number.isFinite(d.b)||d.b<d.a))throw Error('结束日期须不早于开始日期');
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(t,a,v)=>{let n=document.createElementNS(ns,t);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const text=(x,y,v,size=16,anchor='start')=>add('text',{x,y,'font-size':size,'text-anchor':anchor},v);
 const measure=v=>{let n=text(0,0,v),w=n.getBBox().width;n.remove();return w};
 const left=Math.max(160,Math.max(...rows.map(d=>measure(d.title)))+50),right=1000,top=75,rowH=80,height=top+rows.length*rowH+70,lo=Math.min(...rows.map(d=>d.a)),hi=Math.max(...rows.map(d=>d.b)),span=hi-lo||86400000,x=v=>left+(v-lo)/span*(right-left);
 svg.setAttribute('viewBox',`0 0 1060 ${height}`);svg.setAttribute('aria-label','时间段');
 for(let i=0;i<=4;i++){const t=lo+span*i/4,xx=x(t),date=new Date(t).toISOString().slice(0,10);
 add('line',{x1:xx,y1:top-12,x2:xx,y2:top+rows.length*rowH,stroke:'#dddddd'});text(xx,top-30,date,13,'middle')}
 rows.forEach((d,i)=>{
 const y=top+i*rowH+30; text(left-20,y+5,d.title,16,'end');
 const bar=add('rect',{x:x(d.a),y:y-11,width:Math.max(1,x(d.b)-x(d.a)),height:22,fill:opt.focus&&i===1?'#222222':'#aaaaaa'});
 const title=document.createElementNS(ns,'title');title.textContent=d.title+'：'+d.start+' 至 '+d.end;bar.append(title);
 const label=text(x(d.a),y+31,d.body||'',13);label.style.opacity=opt.dates?'1':'0';if(!matchMedia('(prefers-reduced-motion: reduce)').matches)label.animate([{opacity:opt.dates?0:1},{opacity:opt.dates?1:0}],{duration:400});
 });
 return {rows:rows.length,height};
}
const sample={items:[{title:'事项 A',start:'2026-01-01',end:'2026-03-01',body:'这一阶段的说明文本'},{title:'事项 B',start:'2026-02-01',end:'2026-06-01',body:'这一阶段的说明文本'},{title:'事项 C',start:'2026-04-01',end:'2026-08-01',body:'这一阶段的说明文本'},{title:'事项 D',start:'2026-07-01',end:'2026-09-01',body:'这一阶段的说明文本'}]};
function refresh(){try{renderDuration(document.querySelector('svg'),sample,{dates:document.querySelector('[name=dates]').checked,focus:document.querySelector('[name=focus]').checked});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
