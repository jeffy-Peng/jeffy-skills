
function playChartEntrance(svg){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 svg.querySelectorAll('[data-entrance]').forEach(n=>n.removeAttribute('data-entrance'));
 const rects=[...svg.querySelectorAll('rect[data-value]')];
 rects.forEach((n,i)=>{
 const w=+n.getAttribute('width'),h=+n.getAttribute('height'),horizontal=w>h;
 n.style.transformBox='fill-box';n.style.transformOrigin=horizontal?'left center':'center bottom';
 n.animate([{transform:horizontal?'scaleX(0)':'scaleY(0)'},{transform:'none'}],{duration:760,delay:Math.min(i*30,150),easing:'cubic-bezier(.22,1,.36,1)'});
 });
 svg.querySelectorAll('path[data-key^="series-"]').forEach(n=>{
 const length=n.getTotalLength();n.animate([{strokeDasharray:length+' '+length,strokeDashoffset:length},{strokeDasharray:length+' '+length,strokeDashoffset:0}],{duration:900,easing:'cubic-bezier(.22,1,.36,1)'});
 });
 svg.querySelectorAll('circle[data-key^="point-"]').forEach((n,i)=>n.animate([{opacity:0},{opacity:1}],{duration:300,delay:Math.min(i*65,550),fill:'backwards'}));
 // 由 PIE-001 生成的分块，保持原几何，用局部放大形成入场。
 svg.querySelectorAll('path[data-pie-sector]').forEach((n,i)=>{
 n.style.transformBox='fill-box';n.style.transformOrigin='center';
 n.animate([{transform:'scale(.92)',opacity:0},{transform:'none',opacity:1}],{duration:650,delay:Math.min(i*45,250),fill:'backwards',easing:'cubic-bezier(.22,1,.36,1)'});
 });
}
