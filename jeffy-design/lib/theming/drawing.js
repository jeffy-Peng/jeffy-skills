// All typography and paint is resolved here. Renderers supply semantics and geometry.
window.ThemeDrawing={
 async fonts(doc,theme){
  const missing=[];for(const family of new Set(Object.values(theme.fonts))){let font=`16px "${family}"`;await doc.fonts.load(font);const ctx=doc.createElement('canvas').getContext('2d'),sample='mmmmWWii 0123 中文测试',width=f=>{ctx.font='32px '+f;return ctx.measureText(sample).width},generic=['serif','sans-serif','monospace','system-ui'].includes(family),absent=!generic&&Math.abs(width(`"${family}",monospace`)-width('monospace'))<.01&&Math.abs(width(`"${family}",serif`)-width('serif'))<.01;if(!doc.fonts.check(font)||absent)missing.push(family)}
  await doc.fonts.ready;if(missing.length)throw Object.assign(Error('字体不可用：'+missing.join(', ')),{code:'FONT'});
 },
 create(svg,theme){
  const doc=svg.ownerDocument,ns='http://www.w3.org/2000/svg',roles=Object.fromEntries(theme.scale.map(x=>[x.role,x])),tokens=theme.materials,ctx=doc.createElement('canvas').getContext('2d');
  const color=role=>'#'+theme.colors[role];const family=r=>r.font==='latin'?`"${theme.fonts.latin}"`:`"${theme.fonts.latin}","${theme.fonts.ea}"`;
  function add(tag,a,value){let n=doc.createElementNS(ns,tag);for(let[k,v]of Object.entries(a))n.setAttribute(k,v);if(value!==undefined)n.textContent=value;svg.append(n);return n}
  function text(x,y,value,role='pill',anchor='middle',extra={}){let r=roles[role];if(!r)throw Error('THEME: unknown role '+role);return add('text',{x,y,'data-theme-role':role,'text-anchor':anchor,'dominant-baseline':'central','font-family':family(r),'font-size':r.size,'font-weight':r.weight,'letter-spacing':r.tracking,fill:color(r.color),...extra},value)}
  function measure(value,role='pill'){let r=roles[role];ctx.font=`${r.weight} ${r.size}px ${family(r)}`;let tracking=parseFloat(r.tracking)||0;return ctx.measureText(String(value)).width+Math.max(0,String(value).length-1)*tracking}
  function wrap(value,width,role='pill'){if(width<=0)throw Object.assign(Error('文字区域不足'),{code:'CAPACITY'});let out=[],line='';for(let c of String(value??'')){if(measure(line+c,role)>width&&line){out.push(line);line=c}else line+=c}if(line)out.push(line);return out}
  function block(x,y,value,width,role='pill',anchor='start',extra={}){let ls=wrap(value,width,role),step=roles[role].size*roles[role].lineHeight;ls.forEach((line,i)=>text(x,y+i*step,line,role,anchor,extra));return ls.length*step}
  function line(id,d,role='line',extra={}){return add('path',{'data-shape-role':role,'data-key':id,d,fill:'none',stroke:color(role),'stroke-width':theme.rules.dividerWidthPx,...extra})}
  function box(id,x,y,width,height,role=tokens.nodeFill,extra={}){return add('rect',{'data-shape-role':role,'data-key':id,x,y,width,height,rx:tokens.radius,fill:color(role),stroke:color('muted'),'stroke-width':theme.rules.dividerWidthPx,...extra})}
  function contrast(role){const c=theme.colors[role].match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),l=c[0]*.2126+c[1]*.7152+c[2]*.0722;return l>.35?'ink':'paper'}
  function series(i){return ['accent','accent2','body','muted'][i%4]}
  function legend(items,W,y){let sizes=items.map(x=>measure(x.name)+34),sum=sizes.reduce((a,b)=>a+b,0),gap=items.length>1?Math.min(50,(W-32-sum)/(items.length-1)):0;if(sum>W-32)throw Object.assign(Error('图例区域不足'),{code:'CAPACITY'});let x=(W-sum-gap*(items.length-1))/2;
   const g=add('g',{'data-unified-legend':'true'});for(let i=0;i<items.length;i++){let item=items[i],yy=y,n=item.type==='bar'?box('legend'+i,x,yy-6,16,12,item.paint,{stroke:'none'}):line('legend'+i,`M${x} ${yy}h20`,item.paint,{'stroke-dasharray':item.dash||''});g.append(n);let t=text(x+26,yy,item.name,'pill','start');g.append(t);x+=sizes[i]+gap}return g;
  }
  return{add,text,measure,wrap,block,line,box,color,contrast,series,legend,tokens,roles,theme};
 }
};
