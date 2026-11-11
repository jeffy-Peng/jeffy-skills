(async()=>{
const {deck,theme,adapters,legend,lineLabels,themeDrawing,themeRenderers}=window.compositionInput,roles=Object.fromEntries(theme.scale.map(x=>[x.role,x])),reports=[];
const issue=(code,message,extra={})=>({code,message,...extra});
const overlap=(a,b,g=0)=>a.x<b.x+b.width-g&&a.x+a.width>b.x+g&&a.y<b.y+b.height-g&&a.y+a.height>b.y+g;
function textBlock(parent,id,text,box,role='body'){
 const r=roles[role];if(!r)throw Error('未知主题角色 '+role);let n=document.createElement('div');n.className='block';n.dataset.block=id;n.dataset.themeRole=role;n.textContent=text;n.style.cssText=`left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;font-size:${r.size}px;line-height:${r.lineHeight};font-weight:${r.weight};letter-spacing:${r.tracking};color:#${theme.colors[r.color]}`;parent.append(n);return n;
}
async function mount(host,spec){
 const a=adapters[spec.material],r=roles[spec.labelRole||'pill'];
 if(!r)return {ok:false,issues:[issue('THEME','标签角色不存在')]};
 const frame=document.createElement('iframe');frame.title=spec.purpose;host.append(frame);
 const font=`"${theme.fonts.latin}","${theme.fonts.ea}",serif`;
 await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{background:#${theme.colors.paper};margin:0;font: ${roles.body.size}px ${font};color:#${theme.colors.body}}svg{display:block;font-family:${font}}table{border-collapse:collapse;width:100%;table-layout:fixed}caption{text-align:left;font-weight:600;padding-bottom:8px}th,td{font-weight:400;text-align:center;vertical-align:middle;padding:9px 10px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}thead{background:#${theme.colors.soft}}.number{text-align:center}.focus{background:#eee}.table-note{font-size:${roles.source.size}px}</style><svg></svg><div id="table"></div>`});
 const win=frame.contentWindow,doc=frame.contentDocument;await doc.fonts.ready;
 const script=doc.createElement('script');script.textContent=legend+'\n'+lineLabels+'\n'+themeDrawing+'\n'+themeRenderers+'\n'+a.code;doc.body.append(script);
 if(a.renderer==='theme-v1')return await mountNative(frame,spec);
 let result;try{result=win[a.fn](spec.material.startsWith('TABLE')?doc.querySelector('#table'):doc.querySelector('svg'),spec.data,{...a.defaults,...spec.options,...(a.defaults.kind?{kind:a.defaults.kind}:{})})}catch(e){return{ok:false,issues:[issue('DATA',e.message)],material:spec.material}}
 // Initial render is complete; cancel native preview motion before measuring/exporting.
 const svg=doc.querySelector('svg');for(const key of ['_frame','_transitionFrame'])if(svg[key])win.cancelAnimationFrame(svg[key]);
 if(spec.material.startsWith('TABLE')){svg.remove();const table=doc.querySelector('table');table.style.minWidth='0';doc.querySelectorAll('caption,.table-note').forEach(n=>{if(!n.textContent.trim())n.remove()});const height=doc.body.scrollHeight;let minWidth=result.minWidth;const issues=[];
 if(height>spec.box.height||spec.box.width<minWidth)issues.push(issue('CAPACITY','表格无法按主题字号容纳',{required:{width:Math.ceil(minWidth),height},available:spec.box}));
 return{ok:!issues.length,issues,material:spec.material,required:{width:minWidth,height},actual:{width:spec.box.width,height},regions:[],result};}
 doc.querySelector('#table').remove();
 if(spec.material==='FLOW-001')for(const t of svg.querySelectorAll('text'))if(spec.data.nodes.some(n=>n.title===t.textContent)&&t.getAttribute('text-anchor')==='start'){t.setAttribute('x',Number(t.getAttribute('x'))+t.getBBox().width/2);t.setAttribute('text-anchor','middle');}
 let legendItems=result.legendData,legendY=null;const nativeLegend=svg.querySelector('[data-unified-legend]');if(nativeLegend)legendY=nativeLegend.getBBox().y+12;
 if(spec.material==='PIE-001'){const h=svg.viewBox.baseVal.height;legendY=h-55;svg.querySelectorAll('text,rect').forEach(n=>{if(Number(n.getAttribute('y'))>=h-70)n.remove()});legendItems=spec.data.data.map((d,i)=>{let v=spec.data.data.length===1?45:Math.round(40+i*175/(spec.data.data.length-1));return{name:d.label,type:'bar',color:`rgb(${v},${v},${v})`}});}
 if(legendItems?.length&&legendY!==null)win.renderLegend(svg,legendItems,{left:60,right:svg.viewBox.baseVal.width-60,top:legendY,fontSize:r.size});
 const original=svg.getBBox(),pad=26,natural={x:original.x-pad,y:original.y-pad,width:original.width+2*pad,height:original.height+2*pad};
 let scale=Math.min(spec.box.width/natural.width,spec.box.height/natural.height);
 svg.setAttribute('role','img');svg.setAttribute('aria-label',spec.purpose);svg.setAttribute('viewBox',Object.values(natural).join(' '));svg.style.width=spec.box.width+'px';svg.style.height=spec.box.height+'px';svg.style.overflow='hidden';
 // Geometry scales into the slot; text and strokes retain theme size in page pixels.
 for(const t of svg.querySelectorAll('text')){t.setAttribute('font-size',r.size/scale);t.setAttribute('font-weight',r.weight);t.style.letterSpacing='0';}
 svg.querySelectorAll('path,line,rect,circle,ellipse,polygon').forEach(n=>n.setAttribute('vector-effect','non-scaling-stroke'));
 // Reserve actual text extents instead of shrinking labels at the slot edges.
 for(let iteration=0;iteration<6;iteration++){let b=svg.getBBox(),dx=Math.max(0,natural.x-b.x,b.x+b.width-(natural.x+natural.width)),dy=Math.max(0,natural.y-b.y,b.y+b.height-(natural.y+natural.height));if(dx<.5&&dy<.5)break;natural.x-=dx+4;natural.y-=dy+4;natural.width+=2*(dx+4);natural.height+=2*(dy+4);scale=Math.min(spec.box.width/natural.width,spec.box.height/natural.height);svg.setAttribute('viewBox',Object.values(natural).join(' '));svg.querySelectorAll('text').forEach(t=>t.setAttribute('font-size',r.size/scale));}
 if(legendItems?.length&&legendY!==null)win.renderLegend(svg,legendItems,{left:natural.x+30,right:natural.x+natural.width-30,top:legendY,fontSize:r.size/scale});
 if(typeof win.updateLineLabelMasks==='function')win.updateLineLabelMasks(svg,7/scale);
 let bounds=svg.getBoundingClientRect(),regions=[...svg.querySelectorAll('text')].filter(n=>n.textContent.trim()&&getComputedStyle(n).opacity!=='0').map(n=>{let b=n.getBoundingClientRect();return {text:n.textContent,x:b.x-bounds.x,y:b.y-bounds.y,width:b.width,height:b.height,fontSize:parseFloat(win.getComputedStyle(n).fontSize)*Math.hypot(n.getScreenCTM().a,n.getScreenCTM().b)}}),issues=[];
 for(const b of regions)if(!Number.isFinite(b.fontSize)||Math.abs(b.fontSize-r.size)>.2)issues.push(issue('THEME','最终字号与主题不符',{text:b.text,actual:b.fontSize,expected:r.size}));
 if(['FLOW-001','REL-006','REL-001'].includes(spec.material)){let shapes=[...svg.querySelectorAll('rect,circle,path')].filter(n=>n.tagName!=='path'||/Z\s*$/i.test(n.getAttribute('d')||''));for(const node of (spec.data.nodes||[...svg.querySelectorAll('text')].filter(t=>t.textContent.trim()).map(t=>({id:t.textContent,title:t.textContent})))){const t=[...svg.querySelectorAll('text')].find(t=>t.textContent===node.title);if(!t)continue;const tb=t.getBoundingClientRect();let sorted=shapes.map(n=>({n,b:n.getBoundingClientRect()})).sort((a,b)=>Math.hypot(a.b.x+a.b.width/2-tb.x-tb.width/2,a.b.y+a.b.height/2-tb.y-tb.height/2)-Math.hypot(b.b.x+b.b.width/2-tb.x-tb.width/2,b.b.y+b.b.height/2-tb.y-tb.height/2));const shape=sorted[0];if(shape&&(tb.width+6>shape.b.width||tb.height+4>shape.b.height))issues.push(issue('CAPACITY','节点放不下主题字号',{node:node.id,text:node.title}));}}
 for(const b of regions)if(b.x<0||b.y<0||b.x+b.width>spec.box.width||b.y+b.height>spec.box.height)issues.push(issue('CAPACITY','标签超出目标区域',{text:b.text}));
 for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++)if(overlap(regions[i],regions[j],1))issues.push(issue('LAYOUT','图内标签碰撞',{texts:[regions[i].text,regions[j].text]}));
 const factor=issues.length?1.25:1;
 return{ok:!issues.length,issues,material:spec.material,required:{width:Math.ceil(spec.box.width*factor),height:Math.ceil(spec.box.height*factor),estimate:!!issues.length},actual:{width:spec.box.width,height:spec.box.height},plot:natural,regions,result,capability:'fixed-text-fit; no label reflow or topology solver'};
}
async function mountNative(frame,spec){
 const win=frame.contentWindow,doc=frame.contentDocument,issues=[];let result;
 try{if(spec.labelRole&&spec.labelRole!=='pill')throw Object.assign(Error('theme-v1按元素语义选择角色，不支持labelRole覆盖'),{code:'UNSUPPORTED'});if(spec.data.title?.trim())throw Object.assign(Error('组件标题需分配独立主题文字区域，不得静默丢弃'),{code:'UNSUPPORTED'});await win.ThemeDrawing.fonts(doc,theme);result=win.ThemeRenderers.render(spec.material.startsWith('TABLE')?doc.querySelector('#table'):doc.querySelector('svg'),spec.data,spec.options||{},theme,spec.box,spec.material)}catch(e){return{ok:false,material:spec.material,issues:[issue(e.code||'DATA',e.message)],capability:'theme-v1'}}
 if(spec.material.startsWith('TABLE')){doc.querySelector('svg').remove();const height=doc.body.scrollHeight;if(height>spec.box.height||result.minWidth>spec.box.width)issues.push(issue('CAPACITY','表格主题字号下区域不足',{required:{width:result.minWidth,height}}));return{ok:!issues.length,issues,material:spec.material,required:{width:result.minWidth,height},actual:spec.box,regions:[],result,capability:'theme-v1'}}
 doc.querySelector('#table').remove();const svg=doc.querySelector('svg');svg.setAttribute('aria-label',spec.purpose);svg.setAttribute('role','img');win.updateLineLabelMasks(svg,theme.materials.labelGap);
 const bounds=svg.getBoundingClientRect(),regions=[...svg.querySelectorAll('text')].filter(t=>t.textContent.trim()).map(t=>{let b=t.getBoundingClientRect(),css=win.getComputedStyle(t),role=t.dataset.themeRole;return{text:t.textContent,role,x:b.x-bounds.x,y:b.y-bounds.y,width:b.width,height:b.height,fontSize:parseFloat(css.fontSize),expectedSize:roles[role]?.size,fontFamily:css.fontFamily}});
 for(const b of regions){if(!Number.isFinite(b.expectedSize)||Math.abs(b.fontSize-b.expectedSize)>.2)issues.push(issue('THEME','角色字号不符',{text:b.text}));if(b.x<-.5||b.y<-.5||b.x+b.width>spec.box.width+.5||b.y+b.height>spec.box.height+.5)issues.push(issue('CAPACITY','主题文字超出目标区域',{text:b.text}));}
 for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++)if(overlap(regions[i],regions[j],1))issues.push(issue('LAYOUT','主题文字碰撞',{texts:[regions[i].text,regions[j].text]}));
 const colors=new Set(Object.values(theme.colors).map(v=>'#'+v.toLowerCase()));for(const node of [...svg.querySelectorAll('[fill],[stroke]')].filter(n=>!n.closest('mask')))for(const key of ['fill','stroke']){const value=node.getAttribute(key);if(value&&!['none','transparent'].includes(value)&&!colors.has(value.toLowerCase()))issues.push(issue('THEME','存在绕过主题的颜色',{value}));}
 return{ok:!issues.length,issues,material:spec.material,required:{width:spec.box.width,height:spec.box.height},actual:spec.box,regions,result,capability:'theme-v1'};
}
await ThemeDrawing.fonts(document,theme);
for(const [i,page]of deck.pages.entries()){
 const report={id:page.id,ok:false,issues:[],components:[],reviews:page.review||{},manualReview:'pending'};reports.push(report);
 const sheet=document.createElement('section');sheet.className='sheet';sheet.dataset.page=page.id;sheet.style.background='#'+theme.colors.paper;sheet.style.fontFamily=`"${theme.fonts.latin}","${theme.fonts.ea}",serif`;document.querySelector('main').append(sheet);
 if(!page.question||!page.claim||!page.readingOrder?.length||!page.speakerNotes||!page.source)report.issues.push(issue('CONTENT','缺少问题、观点、阅读顺序、讲稿或来源'));
 textBlock(sheet,'title',page.title,{x:64,y:34,width:1152,height:70},'title');
 const line=document.createElement('div');line.className='block';line.style.cssText=`left:64px;top:118px;width:1152px;border-top:${theme.rules.headerWidthPx}px solid #${theme.colors.ink}`;sheet.append(line);
 const occupied=[];for(const c of page.components){if(!c.id||!c.purpose||!c.box||!adapters[c.material]){report.issues.push(issue('CONTRACT','组件缺少 ID、任务、目标区域或适配器'));continue}
 if(c.box.x<64||c.box.y<136||c.box.x+c.box.width>1216||c.box.y+c.box.height>654)report.issues.push(issue('CAPACITY','组件侵入页眉页脚或越界',{component:c.id}));
 occupied.push({id:c.id,...c.box});const host=document.createElement('div');host.className='block component';host.dataset.block=c.id;host.style.cssText=`left:${c.box.x}px;top:${c.box.y}px;width:${c.box.width}px;height:${c.box.height}px`;sheet.append(host);
 const response=await mount(host,c);report.components.push({id:c.id,purpose:c.purpose,...response});report.issues.push(...response.issues.map(v=>({...v,component:c.id})));}
 for(const t of page.text||[]){occupied.push({id:t.id,...t.box});textBlock(sheet,t.id,t.text,t.box,t.role||'body')}
 for(let a=0;a<occupied.length;a++)for(let b=a+1;b<occupied.length;b++)if(overlap(occupied[a],occupied[b]))report.issues.push(issue('LAYOUT','页面区域相交',{blocks:[occupied[a].id,occupied[b].id]}));
 const known=new Set(occupied.map(x=>x.id));if(page.readingOrder.some(x=>!known.has(x)))report.issues.push(issue('CONTENT','阅读顺序引用不存在的组件'));
 for(const shared of page.bindings||[]){let names=shared.members.map(m=>{let c=page.components.find(c=>c.id===m.component);return m.field?m.field.split('.').reduce((v,k)=>v?.[k],c?.data):undefined});if(names.some(n=>!n)||new Set(names).size!==1)report.issues.push(issue('BINDING','跨组件名称不一致',{binding:shared.id,names}));}
 textBlock(sheet,'source',page.source,{x:64,y:675,width:1110,height:25},'source');textBlock(sheet,'pageNo',String(i+1).padStart(2,'0'),{x:1180,y:675,width:36,height:25},'pageNo');
 for(const n of sheet.querySelectorAll('.block:not(.component)'))if(n.scrollHeight>n.clientHeight+1||n.scrollWidth>n.clientWidth+1)report.issues.push(issue('CAPACITY','文字区域装不下',{block:n.dataset.block}));
 report.ok=report.issues.length===0;
 const note=document.createElement('details');note.innerHTML='<summary>逐字稿与验收状态</summary>';const content=document.createElement('p');content.textContent=page.speakerNotes;note.append(content);const status=document.createElement('pre');status.className='report';status.textContent=JSON.stringify({automatic:report.ok?'pass':'fail',issues:report.issues,expressionReview:'需要人工核对观点、证据及关系完整性'},null,2);note.append(status);document.querySelector('main').append(note);
}
window.validationReport=reports;window.renderComplete=true;
})().catch(e=>{window.validationReport=[{ok:false,issues:[{code:e.code||'RUNTIME',message:e.message}]}];window.renderComplete=true;document.querySelector('main').textContent=e.message});
