// 库层。清单只放 id 和元信息，实现在代码里。
// 这一层负责三件事：把 id 解析成实现、按容量校验内容、给出一份风格统计。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function loadLibrary(root) {
  return loadJson(resolve(root, 'library.json'))
}

export function loadContract(root) {
  return loadJson(resolve(root, 'contract.json'))
}

// 图标可以写 id，也可以写语义标签。标签是唯一的，所以结果确定。
export function resolveIcon(name, lib) {
  if (lib.icons.some((i) => i.id === name)) return name
  const hit = lib.tags[name]
  if (hit && hit.length) return hit[0]
  throw new Error(
    `图标 ${name} 不在库里。可用 id：${lib.icons.map((i) => i.id).join('、')}；` +
      `可用标签：${Object.keys(lib.tags).join('、')}`
  )
}

export function layoutOf(id, lib) {
  return lib.layouts.find((l) => l.id === id)
}

function bodyChars(page) {
  let n = 0
  for (const c of page.cards || []) n += (c.body || '').length
  for (const p of page.body || []) n += p.length
  for (const s of page.stats || []) n += (s.note || '').length
  const count = value => Array.isArray(value) ? value.reduce((sum, item) => sum + count(item), 0)
    : typeof value === 'string' ? value.length : typeof value === 'number' ? String(value).length
    : value && typeof value === 'object' ? Object.values(value).reduce((sum,item) => sum + count(item),0) : 0
  return n + count([page.rows, page.groups, page.note, page.formula, page.example, page.effects])
}

export function checkDeck(deck, lib, contract) {
  const errors = []
  const warns = []
  const lim = contract.limits
  const slides = deck.slides || []

  if (slides.length < lim.pages[0] || slides.length > lim.pages[1]) {
    warns.push(`页数 ${slides.length} 不在 ${lim.pages[0]} 到 ${lim.pages[1]}`)
  }

  slides.forEach((s, i) => {
    const n = i + 1
    const meta = layoutOf(s.layout, lib)
    if (!meta) {
      const ids = (lib.layouts || []).map((l) => l.id)
      const guess = (lib.layouts || [])
        .filter((l) => l.cat === s.cat || l.sub === s.sub)
        .map((l) => l.id + ' ' + l.name)
        .slice(0, 6)
      errors.push(
        `第 ${n} 页 layout=${s.layout} 没有登记进 library.json。可用编号 ${ids.slice(0, 14).join(' ')} 等 ${ids.length} 张` +
          (guess.length ? `；同类可选 ${guess.join(' / ')}` : '')
      )
      return
    }
    for (const key of ['formula', 'example', 'effects']) {
      if (s[key] != null && s.layout !== 'X01') errors.push(`第 ${n} 页 ${s.layout} 不支持 ${key} 区域`)
    }
    if (s.example && !s.formula) errors.push(`第 ${n} 页算例需要 formula`)
    if (s.effects != null && (!Array.isArray(s.effects) || s.effects.length < 1 || s.effects.length > 2 ||
        s.effects.some(item => !item || typeof item.title !== 'string' || !item.title.trim() || typeof item.body !== 'string' || !item.body.trim()))) {
      errors.push(`第 ${n} 页 effects 需要 1–2 条带标题和正文的判断`)
    }
    if (s.caption && ['D02','D04'].includes(s.layout)) warns.push(`第 ${n} 页 ${s.layout} 不显示 caption，请移入可见区域`)
    const cap = meta.capacity || {}

    const tr = contract.titleRules || {}
    if (s.title) {
      const t = s.title.trim()
      const f = tr.forbidden || {}
      if (f.dash && /[—–]/.test(t)) warns.push(`第 ${n} 页标题「${t}」有破折号，改掉`)
      if (f.colon && /：/.test(t)) warns.push(`第 ${n} 页标题「${t}」有提示性冒号，改成一句话`)
      const badWords = [...(f.jargon || []), ...(f.signpost || []), ...(f.empty || [])].filter((w) => t.includes(w))
      if (badWords.length) warns.push(`第 ${n} 页标题「${t}」有黑话或空词 ${badWords.join('、')}`)
      if (tr.hardMax && t.length > tr.hardMax) warns.push(`第 ${n} 页标题「${t}」${t.length} 字，超过 ${tr.hardMax} 会压内容区`)
    }

    // 标题长度只是排版参考，超了提醒一句，不拦构建
    if (s.title) {
      const [lo, hi] = cap.title || [0, 99]
      if (s.title.length > hi && !(tr.hardMax && s.title.length > tr.hardMax)) {
        warns.push(`第 ${n} 页标题 ${s.title.length} 字，版式常见 ${lo} 到 ${hi}，可能压到内容区`)
      }
    }

    for (const c of s.cards || []) {
      if (!c.body) continue
      const [lo, hi] = cap['card.body'] || [0, 999]
      if (c.body.length < lo || c.body.length > hi) {
        errors.push(
          `第 ${n} 页卡片「${c.title}」正文 ${c.body.length} 字，要求 ${lo} 到 ${hi}`
        )
      }
    }

    if (s.layout === 'L06' && s.sources && s.sources.length > lim.sources) {
      errors.push(`第 ${n} 页来源 ${s.sources.length} 条，上限 ${lim.sources}`)
    }

    const hl = (s.cards || []).filter((c) => c.hl).length +
      (s.stats || []).filter((x) => x.hl).length +
      (s.takeaway || []).filter((x) => x.hl).length
    if (hl > lim.accentPerPage) {
      errors.push(`第 ${n} 页标红 ${hl} 处，上限 ${lim.accentPerPage}`)
    }

    const chars = bodyChars(s)
    const [blo, bhi] = lim.pageBodyChars
    if (chars && (chars < blo || chars > bhi)) {
      warns.push(`第 ${n} 页正文 ${chars} 字，目标 ${blo} 到 ${bhi}`)
    }
  })

  return { errors, warns }
}

export function stats(deck) {
  const slides = deck.slides || []
  const mix = {}
  let accent = 0
  const chars = []

  for (const s of slides) {
    mix[s.layout] = (mix[s.layout] || 0) + 1
    accent += (s.cards || []).filter((c) => c.hl).length
    accent += (s.stats || []).filter((x) => x.hl).length
    accent += (s.takeaway || []).filter((x) => x.hl).length
    const c = bodyChars(s)
    if (c) chars.push(c)
  }

  chars.sort((a, b) => a - b)
  const median = chars.length ? chars[Math.floor(chars.length / 2)] : 0
  const icons = new Set()
  for (const s of slides) for (const c of s.cards || []) if (c.icon) icons.add(c.icon)

  return {
    pages: slides.length,
    mix,
    accent,
    accentPerPage: slides.length ? +(accent / slides.length).toFixed(1) : 0,
    bodyChars: { min: chars[0] || 0, max: chars[chars.length - 1] || 0, median },
    icons: [...icons],
  }
}

// 扫描产物里的禁用项。有些问题只能在成品里看出来。
export function scanBanned(html, contract) {
  return contract.banned
    .filter((b) => html.includes(b.pattern))
    .map((b) => `${b.pattern} 出现在产物里（${b.why}）`)
}
