import {resolveTheme} from '../lib/theming/resolve.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('用法 node scripts/build-composition.mjs input.json output.html');
const deck=JSON.parse(readFileSync(input,'utf8'));
if(!/^[a-z0-9-]+$/.test(deck.theme))throw Error('主题标识无效');

if(!Array.isArray(deck.pages)||!deck.pages.length)throw Error('CONTRACT: 需要 pages');
for(const p of deck.pages){if(!Array.isArray(p.components)||!p.components.length)throw Error('CONTRACT: 页面需要 components');const ids=[...p.components,...(p.text||[])].map(x=>x.id);if(new Set(ids).size!==ids.length)throw Error('CONTRACT: 页面内 ID 重复');for(const x of [...p.components,...(p.text||[])]){const b=x.box;if(!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.width<=0||b.height<=0)throw Error('CONTRACT: 需要有限且为正的目标尺寸');}}
const theme=resolveTheme(JSON.parse(readFileSync(resolve(root,'themes',deck.theme+'.json'),'utf8')),JSON.parse(readFileSync(resolve(root,'lib/theming/defaults.json'),'utf8')));
const registry=JSON.parse(readFileSync(resolve(root,'lib/composition/adapters.json'),'utf8'));
const used=new Set(deck.pages?.flatMap(p=>p.components.map(c=>c.material)));
const adapters={};
for(const id of used){const a=registry[id];if(!a)throw Error('UNSUPPORTED: '+id);const full=readFileSync(resolve(root,'assets',a.file),'utf8');const boundary=full.indexOf(a.cut);if(boundary<0)throw Error('适配器边界失效: '+id);if(a.renderer!=='theme-v1')throw Error('UNSUPPORTED: '+id+' 尚未迁移跨主题绘制');adapters[id]={...a,code:a.renderer==='theme-v1'?'':full.slice(0,boundary)}}
const lineLabels=readFileSync(resolve(root,'assets/共用/line-labels.js'),'utf8');
const legend=readFileSync(resolve(root,'assets/共用/legend.js'),'utf8');
const themeDrawing=readFileSync(resolve(root,'lib/theming/drawing.js'),'utf8');
const themeRenderers=readFileSync(resolve(root,'lib/theming/renderers.js'),'utf8');
const runtime=readFileSync(resolve(root,'lib/composition/runtime.js'),'utf8');
const payload=JSON.stringify({deck,theme,adapters,legend,lineLabels,themeDrawing,themeRenderers}).replace(/</g,'\\u003c');
mkdirSync(dirname(resolve(output)),{recursive:true});
writeFileSync(output,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>组件组装验证</title><style>body{margin:24px;background:#eee;color:#222}main{width:${theme.page.canvas.width}px;margin:auto}.sheet{background:white;position:relative;width:${theme.page.canvas.width}px;height:${theme.page.canvas.height}px;margin:28px 0;overflow:hidden}.block{position:absolute;box-sizing:border-box}.component{overflow:hidden}.component iframe{border:0;width:100%;height:100%;display:block}.panel-title{margin:0}.failure{background:#eee;padding:12px;overflow:auto;font:14px Georgia,serif}details{padding:16px;background:white;margin:12px 0}.report{font:14px Georgia,serif;white-space:pre-wrap}@media print{body{margin:0}details,.report{display:none}.sheet{margin:0;break-after:page}}</style><main></main><script>window.compositionInput=${payload};</script><script>${themeDrawing}</script><script>${runtime}</script></html>`);
writeFileSync(output.replace(/\.html?$/i,'')+'.notes.md',deck.pages.map(p=>`## ${p.title}\n\n${p.speakerNotes}`).join('\n\n'));
console.log(output);
