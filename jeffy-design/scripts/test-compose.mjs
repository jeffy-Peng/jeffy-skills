import assert from 'node:assert/strict'
import { compose } from '../lib/compose.mjs'
const flow = {type:'flow',items:[{title:'接单'},{title:'交付'}]}
const bar = {type:'bar',heading:'示例耗时（分钟）',items:[{label:'接单',value:1},{label:'交付',value:4}]}
for(const modules of [[flow],[bar],[flow,bar],[{type:'text',items:[{title:'定义',body:'解释适用范围'}]}]]) {
  const html = compose({modules,arrange:'stack'},'.')
  assert.ok(html.includes('grid-template-rows'))
  assert.equal((html.match(/<svg\b/g)||[]).length, modules.filter(m=>m.type!=='text').length)
}
assert.throws(()=>compose({modules:[{type:'unknown',items:[{}]}]},'.'),/未知模块/)
assert.throws(()=>compose({modules:[{type:'image',src:'absent.jpg',alt:'示例'}]},'.'),/ENOENT/)
console.log('模块组合与错误输入通过')
