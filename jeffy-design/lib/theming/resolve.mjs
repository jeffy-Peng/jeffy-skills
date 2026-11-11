export function resolveTheme(theme,defaults){
 const fail=m=>{throw Error('THEME: '+m)};
 for(const key of ['ea','latin'])if(typeof theme.fonts?.[key]!=='string'||!theme.fonts[key].trim())fail('missing font '+key);
 for(const key of ['ink','body','muted','line','soft','accent','accent2','paper'])if(!/^[0-9a-f]{6}$/i.test(theme.colors?.[key]||''))fail('missing/invalid color '+key);
 const required=['title','cardTitle','body','pill','source','pageNo'];
 if(!Array.isArray(theme.scale)||new Set(theme.scale.map(x=>x.role)).size!==theme.scale.length)fail('invalid scale');
 for(const key of required)if(!theme.scale.some(x=>x.role===key))fail('missing role '+key);
 for(const r of theme.scale)if(!r.role||!Number.isFinite(r.size)||r.size<=0||!Number.isFinite(r.lineHeight)||r.lineHeight<=0||!Number.isFinite(r.weight)||!/^[0-9a-f]{6}$/i.test(theme.colors[r.color]||''))fail('invalid role '+r.role);
 if(!Number.isFinite(theme.rules?.dividerWidthPx)||theme.rules.dividerWidthPx<=0||!Number.isFinite(theme.rules.headerWidthPx)||theme.rules.headerWidthPx<=0)fail('invalid strokes');
 const allowed=Object.keys(defaults);for(const k of Object.keys(theme.materials||{}))if(!allowed.includes(k))fail('unknown material token '+k);
 const materials={...defaults,...theme.materials};
 for(const k of ['gap','padding','labelGap','radius'])if(!Number.isFinite(materials[k])||materials[k]<0)fail('invalid material token '+k);
 if(!['solid','outline'].includes(materials.barMode)||!theme.colors[materials.nodeFill])fail('invalid visual profile');
 return {...theme,materials};
}
