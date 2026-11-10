import { readFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { barH } from './charts.mjs'
import { chain } from './flows.mjs'

const escape = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function required(v) {
  if (typeof v !== 'string' || !v.trim()) throw Error('模块缺少必要文字')
  return escape(v)
}
function body(m, dir) {
  if (m.type === 'image') {
    const mime = {'.jpg':'jpeg','.jpeg':'jpeg','.webp':'webp','.png':'png'}[extname(m.src).toLowerCase()]
    if (!mime) throw Error('图片须为本地 JPG、PNG 或 WebP')
    const bytes = readFileSync(resolve(dir,m.src))
    return `<img style="width:100%;max-height:370px;object-fit:contain" alt="${required(m.alt)}" src="data:image/${mime};base64,${bytes.toString('base64')}">`
  }
  if (!Array.isArray(m.items) || !m.items.length) throw Error('模块需要非空 items')
  if (m.type === 'text') return m.items.map(x => `<div style="border-top:var(--divider-width) solid var(--line);padding:16px 0"><strong style="color:var(--accent)">${required(x.title)}</strong><p>${required(x.body)}</p></div>`).join('')
  if (m.type === 'flow') {
    m.items.forEach(x => required(x.title))
    return chain(m.items,{height:150})
  }
  if (m.type === 'bar') {
    m.items.forEach(x => { required(x.label); if (!Number.isFinite(x.value) || x.value < 0) throw Error('条形比较需要非负数值') })
    return barH(m.items,{max:Math.max(1,...m.items.map(x => x.value))})
  }
  throw Error('未知模块 '+m.type)
}
export function compose(page,dir) {
  if (!Array.isArray(page.modules) || !page.modules.length) throw Error('M01 缺少 modules')
  const tracks = page.modules.map(m => {
    const weight = m.weight ?? 1
    if (!Number.isFinite(weight) || weight <= 0) throw Error('weight 必须为正数')
    return 'minmax(0,'+weight+'fr)'
  }).join(' ')
  if (!['row','stack'].includes(page.arrange ?? 'row')) throw Error('未知排列方式')
  const axis = page.arrange === 'stack' ? 'rows' : 'columns'
  return `<div style="flex:1;min-height:0;display:grid;grid-template-${axis}:${tracks};align-items:center;gap:24px">${page.modules.map(m => '<div>'+(m.heading ? '<strong>'+required(m.heading)+'</strong>' : '')+body(m,dir)+'</div>').join('')}</div>`+
    (page.conclusion ? '<div style="background:var(--soft);padding:14px 20px">'+required(page.conclusion)+'</div>' : '')+
    (page.footnote ? '<div class="foot" style="display:block;padding-top:5px">'+required(page.footnote)+'</div>' : '')
}
