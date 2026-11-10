
function renderLegend(svg,items,area){
 svg.querySelector('[data-unified-legend]')?.remove();
 const ns='http://www.w3.org/2000/svg',g=document.createElementNS(ns,'g');g.dataset.unifiedLegend='true';svg.append(g);
 function add(tag,attrs,v){let n=document.createElementNS(ns,tag);for(let[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(v!==undefined)n.textContent=v;g.append(n);return n}
 const left=area.left,right=area.right,available=right-left,fontSize=area.fontSize||14;
 const measured=items.map(item=>{let t=add('text',{'font-size':fontSize},item.name),w=t.getBBox().width+44;t.remove();return {...item,w}});
 const rows=[];let row=[],used=0;
 measured.forEach(item=>{if(row.length&&used+item.w+30>available){rows.push(row);row=[];used=0}row.push(item);used+=item.w+30});if(row.length)rows.push(row);
 rows.forEach((row,i)=>{
 const total=row.reduce((s,v)=>s+v.w,0),span=Math.min(available,Math.max(total+(row.length-1)*38,available*.72)),gap=row.length>1?(span-total)/(row.length-1):0;
 let x=(left+right-span)/2;if(row.length===1)x=(left+right-total)/2;
 const baseY=area.axisLabelBottom===undefined?area.top:area.axisLabelBottom+(area.top-area.axisLabelBottom)/2;
 const y=baseY+i*32;
 row.forEach(item=>{
 if(item.type==='bar')add('rect',{x,y:y-10,width:17,height:12,fill:item.color||'#777'});
 else{
 const d=item.shape==='step'?`M${x} ${y}h10v-8h14`:`M${x} ${y-4}h24`;
 add('path',{d,stroke:item.color||'#222',fill:'none','stroke-width':1.8,'stroke-dasharray':item.dash||''});
 if(item.points)add('circle',{cx:x+12,cy:y-4,r:2.5,fill:'white',stroke:item.color||'#222'});
 }
 add('text',{x:x+32,y:y-4,'font-size':fontSize,'dominant-baseline':'central'},item.name);x+=item.w+gap;
 });
 });
 return {rows:rows.length,bottom:(area.axisLabelBottom===undefined?area.top:area.axisLabelBottom+(area.top-area.axisLabelBottom)/2)+Math.max(0,rows.length-1)*32+16};
}
