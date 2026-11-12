import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolveTheme} from '../lib/theming/resolve.mjs';
const defaults=JSON.parse(readFileSync(new URL('../lib/theming/defaults.json',import.meta.url)));
const dir=new URL('../themes/',import.meta.url),themes=readdirSync(dir).filter(x=>x.endsWith('.json')).map(x=>JSON.parse(readFileSync(new URL(x,dir))));
assert.deepEqual(themes.map(t=>t.name),['klein-blue']);
for(const t of themes)assert.ok(resolveTheme(t,defaults).page.content.width>0);
const base=themes.find(x=>x.name==='klein-blue');
for(const mutate of [t=>delete t.writing.narration,t=>delete t.usage.scenarios,t=>t.page.content.y=30,t=>t.page.source.width=5000]){const t=structuredClone(base);mutate(t);assert.throws(()=>resolveTheme(t,defaults),/THEME/)}
const custom=structuredClone(base);custom.page.content.x=80;custom.page.content.width=1100;assert.equal(resolveTheme(custom,defaults).page.content.x,80);
console.log(themes.length+' theme configurations + 5 contract cases passed');
