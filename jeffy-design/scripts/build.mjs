// deck.json → 单文件 HTML。
// 顺序是：读契约和库 → 解析图标 → 校验容量 → 渲染 → 扫禁用项 → 出风格报告。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LAYOUTS } from '../lib/layouts.mjs'
import { page } from '../lib/shell.mjs'
import {
  checkDeck,
  loadContract,
  loadLibrary,
  resolveIcon,
  scanBanned,
  stats,
} from '../lib/library.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadTheme(name) {
  const p = resolve(ROOT, 'themes', `${name}.json`)
  if (!existsSync(p)) throw new Error(`找不到主题 ${name}`)
  return JSON.parse(readFileSync(p, 'utf8'))
}

function main() {
  const [src, out, notesFlag] = process.argv.slice(2)
  if (!src || !out) {
    console.error('用法 build.mjs deck.json out.html')
    process.exit(2)
  }

  const deck = JSON.parse(readFileSync(src, 'utf8'))
  const includeNotes = notesFlag === '--notes'
  if (includeNotes) {
    const missing = deck.slides.findIndex(s => typeof s.speakerNotes !== 'string' || !s.speakerNotes.trim())
    if (missing >= 0) throw new Error(`第 ${missing + 1} 页缺少 speakerNotes`)
  }
  const lib = loadLibrary(ROOT)
  const contract = loadContract(ROOT)

  // 图标允许写语义标签，先统一解析成 id，渲染层只认 id
  for (const s of deck.slides || []) {
    for (const c of s.cards || []) {
      if (c.icon) {
        try {
          c.icon = resolveIcon(c.icon, lib)
        } catch (e) {
          console.error('✗ ' + e.message)
          process.exit(1)
        }
      }
    }
  }

  const { errors, warns } = checkDeck(deck, lib, contract)
  if (errors.length) {
    errors.forEach((e) => console.error('✗ ' + e))
    console.error(`\n${errors.length} 个问题，先改 deck.json`)
    process.exit(1)
  }

  for (const s of deck.slides || []) {
    if (!LAYOUTS[s.layout]) {
      console.error(`✗ 版式 ${s.layout} 没有实现`)
      console.error(`  可用编号：${Object.keys(LAYOUTS).join(' ')}`)
      console.error(`  版式库：${ROOT}/library.json`)
      console.error('  回库挑一张真实的编号改 deck.json，不要手写 HTML。')
      process.exit(1)
    }
  }

  const theme = loadTheme(deck.theme || 'klein-blue')
  const n = deck.slides.length
  const slides = deck.slides
    .map((s, i) => {
      const body = LAYOUTS[s.layout](deck.meta, s, i + 1, n, dirname(resolve(src)))
      return `<section class="slide" data-layout="${s.layout}">\n${body}\n</section>`
    })
    .join('\n')

  const html = page(theme, slides, deck.meta)
  const banned = scanBanned(html, contract)

  mkdirSync(dirname(resolve(out)), { recursive: true })
  writeFileSync(resolve(out), html, 'utf8')

  const st = stats(deck)
  const mix = Object.entries(st.mix)
    .map(([k, v]) => `${k}×${v}`)
    .join(' ')

  console.log(`已生成 ${out}`)
  console.log(`页数 ${st.pages} · 主题 ${theme.name}`)
  console.log(`版式 ${mix}`)
  console.log(
    `正文 中位 ${st.bodyChars.median} 字（${st.bodyChars.min} 到 ${st.bodyChars.max}）`
  )
  console.log(`标红 ${st.accent} 处，平均 ${st.accentPerPage} / 页`)
  console.log(`图标 ${st.icons.join(' ') || '无'}`)

  for (const w of warns) console.log('! ' + w)
  if (banned.length) {
    for (const b of banned) console.error('✗ ' + b)
    process.exit(1)
  }
  if (includeNotes) {
    const contents = deck.slides.map((s, i) => {
      const number = String(i + 1).padStart(2, '0')
      return `## ${number}　${s.title || deck.meta.title}\n\n${s.speakerNotes.trim()}`
    })
    writeFileSync(resolve(out).replace(/\.html?$/i, '') + '.notes.md', contents.join('\n\n') + '\n', 'utf8')
  }

}

main()
