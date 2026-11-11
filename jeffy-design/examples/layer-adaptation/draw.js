const svg=document.querySelector('svg'),scene=window.caseInput,theme=window.caseTheme,pen=LayerDrawing.create(svg,theme);
svg.style.fontFamily=`"${theme.fonts.latin}","${theme.fonts.ea}",serif`;
const ns='http://www.w3.org/2000/svg',defs=document.createElementNS(ns,'defs');defs.innerHTML='<marker id="case-arrow" viewBox="0 0 8 6" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0 0L8 3L0 6Z" fill="#444"/></marker>';svg.append(defs);
pen.text(64,65,'层级归属不变，结构按内容重组','title');pen.connector('header','M64 118H1216');
for(const layer of scene.layers){pen.box('layer-'+layer.id,layer,{fill:'#fafafa',stroke:'#ddd','data-layer':layer.id});pen.text(115,layer.y+layer.h/2,layer.title,'cardTitle',{'text-anchor':'middle'})}
for(const group of scene.groups){pen.box('group-'+group.id,group,{fill:'none',stroke:'#999','stroke-dasharray':'4 4','data-group':group.id});pen.text(group.x+14,group.y+17,group.title,'pill')}
for(const relation of scene.relations){const line=pen.connector(relation.id,relation.path);line.setAttribute('marker-end','url(#case-arrow)')}
for(const m of scene.modules){pen.box(m.id,m,{'data-module':m.id,'data-membership':m.layers.join(',')});if(m.body){pen.text(m.x+16,m.y+21,m.title,'cardTitle',{'data-module-title':m.id});pen.text(m.x+16,m.y+(m.h>100?65:43),m.body,'body',{'data-node-description':'true'})}else pen.text(m.x+m.w/2,m.y+m.h/2,m.title,'cardTitle',{'text-anchor':'middle','data-module-title':m.id})}
for(const relation of scene.relations)pen.text(relation.label.x,relation.label.y,relation.action,'body',{'data-line-label':'true','text-anchor':'middle'});
pen.text(64,646,'跨层模块只出现一次；组框表示归属；只有箭头表示依赖。模块宽度不表示数量。','body');
pen.connector('footer','M64 666H1216');pen.text(64,685,'来源：结构适配教学示例，非真实业务架构。','source');pen.text(1190,685,'01','pageNo');
updateLineLabelMasks(svg);
window.renderComplete=true;
