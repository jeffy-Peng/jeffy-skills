
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const [src,out]=process.argv.slice(2)
if(!src||!out)throw Error('用法 node scripts/build-page.mjs pages.json out.html')
const deck=JSON.parse(readFileSync(src,'utf8'))
if(!Array.isArray(deck.pages)||!deck.pages.length)throw Error('需要 pages')
if(!/^[a-z0-9-]+$/.test(deck.theme))throw Error('主题标识无效')
const theme=JSON.parse(readFileSync(resolve(root,'themes',deck.theme+'.json'),'utf8'))
const runtime=readFileSync(resolve(root,'lib/page-engine/runtime.js'),'utf8')
const catalog=JSON.parse(readFileSync(resolve(root,'lib/page-engine/catalog.json'),'utf8'))
const payload=JSON.stringify({deck,theme,catalog}).replace(/</g,'\u003c')
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>统一页面生成</title><style>body{margin:24px;background:#eee;color:#222;font:16px "${theme.fonts.latin}","${theme.fonts.ea}",serif}main{max-width:1280px;margin:auto}svg{width:100%;display:block;background:#${theme.colors.paper};margin:24px 0}svg text{font-family:"${theme.fonts.latin}","${theme.fonts.ea}",serif}.failure{padding:30px;background:white}#status{text-align:center}@media print{body{margin:0}#status{display:none}svg{break-after:page;margin:0}}</style><div id="status">正在生成</div><main></main><script>window.presentationInput=${payload};</script><script>${runtime}</script></html>`
mkdirSync(dirname(resolve(out)),{recursive:true});writeFileSync(out,html)
writeFileSync(out.replace(/\.html?$/i,'')+'.notes.md',deck.pages.map((p,i)=>`## ${i+1} ${p.title}

${p.speakerNotes}`).join('\n\n'))
console.log(out)
