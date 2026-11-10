// 图标。线框 SVG，坐标画在 100×100 的框里。
// 数据在 icons/core.json，加图标改那个文件，不用碰代码。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ICONS = JSON.parse(readFileSync(join(HERE, '..', 'icons', 'core.json'), 'utf8'))

export function icon(name, size = 36) {
  const body = ICONS[name]
  if (!body) throw new Error(`图标库里没有 ${name}，现有 ${Object.keys(ICONS).join('、')}`)
  return `<svg class="icon" viewBox="0 0 100 100" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}
