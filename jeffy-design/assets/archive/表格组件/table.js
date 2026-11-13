
function renderTable(container,input,options={}){
 if(!input.columns?.length||!Array.isArray(input.rows)||input.rows.some(row=>!Array.isArray(row)||row.length!==input.columns.length))throw Error('表头和每行数据的列数必须一致');
 container.replaceChildren();
 const table=document.createElement('table');table.className='detail-table';
 const caption=document.createElement('caption');caption.textContent=input.title;table.append(caption);
 const colgroup=document.createElement('colgroup');
 const ctx=document.createElement('canvas').getContext('2d');ctx.font=getComputedStyle(container).font;
 const weights=input.columns.map((col,i)=>Math.max(90,Math.min(270,Math.max(ctx.measureText(col).width,...input.rows.map(row=>ctx.measureText(String(row[i]??'—')).width))+32)));
 const minimum=weights.reduce((a,b)=>a+b,0);table.style.minWidth=minimum+'px';
 weights.forEach(w=>{const c=document.createElement('col');c.style.width=(w/minimum*100)+'%';colgroup.append(c)});table.append(colgroup);
 const head=document.createElement('thead'),tr=document.createElement('tr');
 input.columns.forEach((name,i)=>{const th=document.createElement('th');th.style.textAlign='center';th.style.verticalAlign='middle';th.scope='col';th.textContent=name;if(options.focus===i)th.classList.add('focus');tr.append(th)});head.append(tr);table.append(head);
 const body=document.createElement('tbody');
 const numeric=input.columns.map((_,i)=>input.rows.length>0&&input.rows.every(row=>row[i]===null||typeof row[i]==='number'));
 input.rows.forEach((row,i)=>{const tr=document.createElement('tr');if(options.stripe&&i%2)tr.classList.add('stripe');
 row.forEach((value,k)=>{const td=document.createElement(k===0?'th':'td');td.style.textAlign='center';td.style.verticalAlign='middle';if(k===0)td.scope='row';td.textContent=typeof value==='boolean'?(value?'●':'○'):value===null?'—':typeof value==='number'?new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(value):String(value);if(numeric[k])td.classList.add('number');if(options.focus===k)td.classList.add('focus');tr.append(td)});body.append(tr)});
 table.append(body);container.append(table);
 const note=document.createElement('p');note.className='table-note';note.textContent=input.note||'';container.append(note);
 return {rows:input.rows.length,columns:input.columns.length,minWidth:minimum};
}
const detailSample={title:'表格标题',columns:['类别','指标一（单位）','指标二（单位）','说明'],rows:[['A',120,18.5,'标准说明文本'],['B',95,22.4,'标准说明文本'],['C',86,16.8,'标准说明文本'],['D',72,20.1,'标准说明文本'],['E',64,15.6,'标准说明文本'],['F',58,12.3,'标准说明文本']],note:'来源或口径说明'};
const matrixSample={title:'矩阵标题',columns:['对象','维度一','维度二','维度三','维度四'],rows:[['A',true,true,false,true],['B',true,false,true,true],['C',false,true,true,false],['D',true,true,true,false]],note:'● 表示具备；○ 表示不具备；— 表示缺失。来源或口径说明。'};
const numericMatrix={...matrixSample,rows:[['A',12,8,15,6],['B',9,14,7,11],['C',16,10,12,8],['D',7,13,9,15]],note:'各维度应分别注明单位或使用同一评分口径。来源或口径说明。'};
function refresh(){const sample=document.querySelector('main').dataset.kind==='matrix'?(document.querySelector('[name=mode]:checked').value==='numeric'?numericMatrix:matrixSample):detailSample;try{renderTable(document.querySelector('#table'),sample,{stripe:document.querySelector('[name=stripe]').checked,focus:document.querySelector('[name=focus]').checked?1:undefined});document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}}
document.querySelectorAll('input').forEach(n=>n.onchange=refresh);refresh();
