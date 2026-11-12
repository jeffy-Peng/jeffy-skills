export function resolveTheme(theme,defaults){
 const fail=m=>{throw Error('THEME: '+m)};
 for(const key of ['ea','latin'])if(typeof theme.fonts?.[key]!=='string'||!theme.fonts[key].trim())fail('missing font '+key);
 for(const key of ['ink','body','muted','line','soft','accent','accent2','paper'])if(!/^[0-9a-f]{6}$/i.test(theme.colors?.[key]||''))fail('missing/invalid color '+key);
 const required=['title','cardTitle','body','pill','source','pageNo'];
 if(!Array.isArray(theme.scale)||new Set(theme.scale.map(x=>x.role)).size!==theme.scale.length)fail('invalid scale');
 for(const key of required)if(!theme.scale.some(x=>x.role===key))fail('missing role '+key);
 for(const r of theme.scale)if(!r.role||!Number.isFinite(r.size)||r.size<=0||!Number.isFinite(r.lineHeight)||r.lineHeight<=0||!Number.isFinite(r.weight)||!/^[0-9a-f]{6}$/i.test(theme.colors[r.color]||''))fail('invalid role '+r.role);
 if(!Number.isFinite(theme.rules?.dividerWidthPx)||theme.rules.dividerWidthPx<=0||!Number.isFinite(theme.rules.headerWidthPx)||theme.rules.headerWidthPx<=0)fail('invalid strokes');
 const page=theme.page;
 if(!page||!Number.isFinite(page.canvas?.width)||!Number.isFinite(page.canvas?.height)||page.canvas.width<=0||page.canvas.height<=0)fail('invalid canvas');
 for(const key of ['title','content','source','pageNo']){const b=page[key];if(!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>page.canvas.width||b.y+b.height>page.canvas.height)fail('invalid page region '+key)}
 const h=page.headerRule;if(!h||!['x','y','width'].every(k=>Number.isFinite(h[k]))||h.x<0||h.y<0||h.width<=0||h.x+h.width>page.canvas.width||h.y>page.canvas.height)fail('invalid header rule');
 const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
 for(const key of ['title','source','pageNo'])if(intersects(page.content,page[key]))fail('content overlaps '+key);
 for(const key of ['scenarios','audience'])if(!theme.usage?.[key]?.trim())fail('missing usage '+key);
 for(const key of ['prompt','title','body','narration','review'])if(!theme.writing?.[key]?.trim())fail('missing writing '+key);
 const allowed=Object.keys(defaults);for(const k of Object.keys(theme.materials||{}))if(!allowed.includes(k))fail('unknown material token '+k);
 const materials={...defaults,...theme.materials};
 for(const k of ['gap','padding','labelGap','radius'])if(!Number.isFinite(materials[k])||materials[k]<0)fail('invalid material token '+k);
 if(!['solid','outline'].includes(materials.barMode)||!theme.colors[materials.nodeFill])fail('invalid visual profile');
 return {...theme,materials};
}
