// Drawing primitives, not a layer-layout template. The page author supplies geometry.
window.LayerDrawing={
 create(svg,theme){const ns='http://www.w3.org/2000/svg',roles=Object.fromEntries(theme.scale.map(r=>[r.role,r]));
 function add(tag,attrs,text){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n}
 return{box(id,b,attrs={}){return add('rect',{'data-object':id,x:b.x,y:b.y,width:b.w,height:b.h,fill:'#'+theme.colors.paper,stroke:'#'+theme.colors.muted,'stroke-width':theme.rules.dividerWidthPx,...attrs})},
 text(x,y,text,role='body',attrs={}){const r=roles[role];return add('text',{x,y,'font-size':r.size,'font-weight':r.weight,'dominant-baseline':'central',fill:'#'+theme.colors[r.color],...attrs},text)},
 connector(id,d){return add('path',{'data-relation':id,'data-connector':'true',d,fill:'none',stroke:'#'+theme.colors.body,'stroke-width':theme.rules.dividerWidthPx})}}
 }};
