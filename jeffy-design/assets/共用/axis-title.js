function layoutRightAxisTitle(svg,{axisX,top,bottom,titleNode}){
 const ticks=[...svg.querySelectorAll('text')].filter(n=>!n.hasAttribute('transform')&&+n.getAttribute('x')>axisX&&+n.getAttribute('y')>=top&&+n.getAttribute('y')<=bottom+10);
 const tickEdge=Math.max(axisX,...ticks.map(n=>{const b=n.getBBox();return b.x+b.width}));
 const x=tickEdge+28,y=(top+bottom)/2;
 titleNode.setAttribute('x',x);titleNode.setAttribute('y',y);titleNode.setAttribute('text-anchor','middle');titleNode.setAttribute('dominant-baseline','central');titleNode.setAttribute('transform',`rotate(-90 ${x} ${y})`);
 svg.viewBox.baseVal.width=Math.max(svg.viewBox.baseVal.width,x+35);
 return {x,y,tickEdge};
}