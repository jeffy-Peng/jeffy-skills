// Recompute transparent line cutouts from the final label geometry, in SVG coordinates.
function updateLineLabelMasks(svg,padding=7){
 const ns='http://www.w3.org/2000/svg',labels=[...svg.querySelectorAll('text[data-line-label]')],edges=[...svg.querySelectorAll('[data-connector]')];
 if(!edges.length)return;
 let defs=svg.querySelector('defs');if(!defs){defs=document.createElementNS(ns,'defs');svg.prepend(defs)}
 if(!svg.dataset.lineMaskId)svg.dataset.lineMaskId='line-label-gaps-'+(++updateLineLabelMasks.sequence);
 const id=svg.dataset.lineMaskId;let mask=defs.querySelector('[data-line-label-mask]');
 if(!mask){mask=document.createElementNS(ns,'mask');mask.dataset.lineLabelMask='true';defs.append(mask)}
 const v=svg.viewBox.baseVal,extent={x:v.x-10000,y:v.y-10000,width:v.width+20000,height:v.height+20000};
 for(const[k,value]of Object.entries({id,maskUnits:'userSpaceOnUse',...extent}))mask.setAttribute(k,value);
 mask.replaceChildren();
 function rect(attrs){const n=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);mask.append(n)}
 rect({...extent,fill:'white'});
 for(const label of labels){const b=label.getBBox();rect({x:b.x-padding,y:b.y-padding,width:b.width+padding*2,height:b.height+padding*2,fill:'black'})}
 edges.forEach(n=>n.setAttribute('mask',`url(#${id})`));
 return{labels:labels.length,connectors:edges.length};
}
updateLineLabelMasks.sequence=0;
