
function renderScatter(svg,input,opt={}){
 if(!input.data?.length||input.data.some(d=>!d.label||!Number.isFinite(d.x)||!Number.isFinite(d.y)))throw Error('每个对象需要名称及有效的 x、y 数值');
 if(svg._frame)cancelAnimationFrame(svg._frame);
 const old=new Map([...svg.querySelectorAll('[data-key]')].map(n=>[n.dataset.key,Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))]));
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(tag,a,value)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);if(value!==undefined)n.textContent=value;svg.append(n);return n};
 const text=(key,x,y,v,anchor='middle',size=16)=>add('text',{'data-key':key,x,y,'text-anchor':anchor,'font-size':size},v);
 const fmt=v=>v!==0&&(Math.abs(v)>=1e7||Math.abs(v)<.00001)?v.toExponential(2):Number(v.toPrecision(6)).toString();
 const measure=v=>{const t=text('measure',0,0,v);const w=t.getBBox().width;t.remove();return w};
 function extent(key){const vs=input.data.map(d=>d[key]);let lo=Math.min(...vs),hi=Math.max(...vs),pad=(hi-lo||Math.abs(hi)||1)*.12;lo-=pad;hi+=pad;if(opt.zero){lo=Math.min(lo,0);hi=Math.max(hi,0)}const raw=(hi-lo)/5,pow=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].find(v=>v*pow>=raw)*pow;return {min:Math.floor(lo/step)*step,max:Math.ceil(hi/step)*step,step}}
 const X=extent('x'),Y=extent('y'),width=Math.max(900,opt.width||0),height=600,top=85,bottom=450,left=Math.max(100,measure(fmt(Y.min))+55,measure(fmt(Y.max))+55),right=width-80;
 const x=v=>left+(v-X.min)/(X.max-X.min)*(right-left),y=v=>bottom-(v-Y.min)/(Y.max-Y.min)*(bottom-top);
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',input.title);
 text('title',(left+right)/2,30,input.title,'middle',20);
 for(const [key,e] of [['x',X],['y',Y]])for(let i=0;i<=Math.round((e.max-e.min)/e.step);i++){
 const v=+(e.min+i*e.step).toPrecision(12),xx=x(v),yy=y(v);
 add('line',{'data-key':key+'grid'+i,x1:key==='x'?xx:left,y1:key==='x'?top:yy,x2:key==='x'?xx:right,y2:key==='x'?bottom:yy,stroke:v===0?'#aaaaaa':'#dddddd'});
 key==='x'?text('xt'+i,xx,bottom+27,fmt(v),'middle',14):text('yt'+i,left-12,yy+5,fmt(v),'end',14);
 }
 add('path',{'data-key':'axes',d:`M${left} ${top}V${bottom}H${right}h8l-4 3 M${left} ${top}v-8l-3 4`,stroke:'#222',fill:'none','stroke-width':1.2});
 text('xunit',right,bottom+57,input.xName+' / '+input.xUnit,'end',14);
 let unit=text('yunit',25,(top+bottom)/2,input.yName+' / '+input.yUnit);unit.setAttribute('transform',`rotate(-90 25 ${(top+bottom)/2})`);
 const occupied=[];
 const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 input.data.forEach((d,i)=>{
 const xx=x(d.x),yy=y(d.y),focus=opt.focus===i;
 const c=add('circle',{'data-key':'point-'+i,cx:xx,cy:yy,r:focus?6:4.5,fill:focus?'#222222':'#999999',stroke:'#ffffff','stroke-width':1.2,tabindex:0,role:'img','aria-label':d.label+'，'+input.xName+' '+fmt(d.x)+'，'+input.yName+' '+fmt(d.y)});
 const title=document.createElementNS(ns,'title');title.textContent=c.getAttribute('aria-label');c.append(title);
 occupied.push({x:xx-7,y:yy-7,w:14,h:14});
 });
 if(opt.labels)input.data.forEach((d,i)=>{
 const xx=x(d.x),yy=y(d.y),w=measure(d.label),h=20;
 const positions=[[10,-10],[10,24],[-w-10,-10],[-w-10,24],[10,-34],[10,48]];
 const pos=positions.map(([dx,dy])=>({x:xx+dx,y:yy+dy-h,w,h})).find(b=>b.x>=left&&b.x+b.w<=right&&b.y>=top&&b.y+h<=bottom&&!occupied.some(a=>overlaps(a,b)));
 if(pos){text('label-'+i,pos.x,pos.y+16,d.label,'start',14);occupied.push(pos)}
 });
 if(old.size&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const transitions=[];svg.querySelectorAll('[data-key]').forEach(n=>{const p=old.get(n.dataset.key);if(!p)return;for(const key of ['x','y','x1','x2','y1','y2','cx','cy','r'])if(n.hasAttribute(key)&&p[key]!==undefined)transitions.push({n,key,from:+p[key],to:+n.getAttribute(key)})});
 const start=performance.now();function frame(now){const t=Math.min(1,(now-start)/760),e=1-(1-t)**4;transitions.forEach(d=>d.n.setAttribute(d.key,d.from+(d.to-d.from)*e));svg._frame=t<1?requestAnimationFrame(frame):null}frame(start);
 }
 return {X,Y,points:input.data.length,labels:svg.querySelectorAll('[data-key^=label]').length};
}
const sample={title:'图表标题',xName:'名称',xUnit:'单位',yName:'名称',yUnit:'单位',data:[{label:'A',x:12,y:26},{label:'B',x:22,y:18},{label:'C',x:30,y:35},{label:'D',x:44,y:29},{label:'E',x:53,y:46},{label:'F',x:66,y:39}]};
function refresh(){try{renderScatter(document.querySelector('svg'),sample,{labels:document.querySelector('[name=labels]').checked,zero:document.querySelector('[name=zero]').checked,focus:document.querySelector('[name=focus]').checked?0:undefined});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
