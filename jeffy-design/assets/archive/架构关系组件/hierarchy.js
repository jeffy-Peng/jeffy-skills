
function renderHierarchy(svg,input,opt={}){
 const root=input.root;if(!root?.title)throw Error('需要根节点标题');
 const ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const add=(t,a,v)=>{let n=document.createElementNS(ns,t);for(let[k,x]of Object.entries(a))n.setAttribute(k,x);if(v!==undefined)n.textContent=v;svg.append(n);return n};
 const measure=v=>{const n=add('text',{'font-size':16},v),w=n.getBBox().width;n.remove();return w};
 const nodes=[],links=[];let leaves=0,maxDepth=0;
 function visit(node,depth,parent){
 if(!node.title||node.children&&!Array.isArray(node.children))throw Error('节点需包含标题与可选 children 数组');
 const item={...node,depth,index:nodes.length};nodes.push(item);maxDepth=Math.max(maxDepth,depth);
 if(parent)links.push([parent,item]);
 if(node.children?.length){const kids=node.children.map(n=>visit(n,depth+1,item));item.slot=(kids[0].slot+kids.at(-1).slot)/2}else item.slot=leaves++;
 return item;
 }
 visit(root,0);
 const vertical=opt.direction!=='horizontal',nodeW=Math.max(140,Math.min(280,Math.max(...nodes.map(n=>measure(n.title)))+40)),nodeH=58,gap=45,depthGap=100;
 const width=vertical?Math.max(800,leaves*(nodeW+gap)+60):Math.max(800,(maxDepth+1)*(nodeW+depthGap)+60);
 const height=vertical?150+(maxDepth+1)*(nodeH+depthGap):Math.max(380,leaves*(nodeH+gap)+130);
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',input.title);
 add('text',{x:width/2,y:32,'text-anchor':'middle','font-size':20},input.title);
 nodes.forEach(n=>{n.x=vertical?(width-leaves*(nodeW+gap))/2+n.slot*(nodeW+gap):40+n.depth*(nodeW+depthGap);n.y=vertical?100+n.depth*(nodeH+depthGap):90+n.slot*(nodeH+gap)});
 links.forEach(([p,c])=>{
 const x1=vertical?p.x+nodeW/2:p.x+nodeW,y1=vertical?p.y+nodeH:p.y+nodeH/2,x2=vertical?c.x+nodeW/2:c.x,y2=vertical?c.y:c.y+nodeH/2;
 const d=vertical?`M${x1} ${y1}V${(y1+y2)/2}H${x2}V${y2}`:`M${x1} ${y1}H${(x1+x2)/2}V${y2}H${x2}`;
 add('path',{d,fill:'none',stroke:'#aaaaaa','stroke-width':1.2});
 });
 nodes.forEach(n=>{
 const focus=opt.focus&&n.depth===0;
 add('rect',{x:n.x,y:n.y,width:nodeW,height:nodeH,fill:focus?'#222222':'#ffffff',stroke:focus?'#222222':'#aaaaaa'});
 let lines=[],line='';for(const ch of n.title){if(measure(line+ch)>nodeW-28&&line){lines.push(line);line=ch}else line+=ch}if(line)lines.push(line);
 lines.forEach((v,i)=>add('text',{x:n.x+nodeW/2,y:n.y+nodeH/2-(lines.length-1)*10+i*20+5,'text-anchor':'middle','font-size':16,fill:focus?'#ffffff':'#222222'},v));
 });
 return {nodes:nodes.length,links:links.length,width,height};
}
function refresh(){const count=Number(document.querySelector('[name=count]:checked').value);const root={title:'主体 A',children:Array.from({length:count},(_,i)=>({title:'主体 '+String.fromCharCode(66+i),children:[{title:'节点 '+(i+1)+'-1'},{title:'节点 '+(i+1)+'-2'}]}))};renderHierarchy(document.querySelector('svg'),{title:'结构标题',root},{direction:document.querySelector('[name=direction]:checked').value,focus:document.querySelector('[name=focus]').checked})}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
