// 架构与关系图形。全部内联 SVG，颜色走主题变量。
const F = 'var(--f-title)'
const A = 'var(--accent)'
const A2 = 'var(--accent2)'
const MUTED = 'var(--muted)'
const INK = 'var(--ink)'
const LINE = 'var(--line)'
const SOFT = 'var(--soft)'

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const t = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${F}" font-size="${o.size || 14}" fill="${o.fill || INK}" text-anchor="${o.anchor || 'middle'}" ${o.weight ? `font-weight="${o.weight}"` : ''}>${esc(s)}</text>`
const svg = (w, h, inner) => `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${inner}</svg>`

// 浅底实心块
const softBox = (x, y, w, h, label, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.fill || SOFT}" ${o.stroke ? `stroke="${o.stroke}"` : ''}/>` +
  (label ? t(x + w / 2, y + h / 2 + 5, label, { size: o.size || 14, fill: o.color || INK }) : '')

// 深色块
const darkBox = (x, y, w, h, label, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.fill || A2}"/>` +
  (label ? t(x + w / 2, y + h / 2 + 5, label, { size: o.size || 14, fill: '#fff' }) : '')

const line = (x1, y1, x2, y2, o = {}) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${o.color || '#8C857C'}" stroke-width="${o.w || 1.2}" ${o.dash ? 'stroke-dasharray="4 4"' : ''}/>`

// A01 层级树
export function tree(page) {
  const W = 1100
  const H = 400
  const root = page.root || {}
  const branches = page.branches || []
  const bw = Math.min(240, (W - 80) / branches.length - 24)
  const gap = (W - 80) / branches.length
  let inner = softBox(W / 2 - 110, 20, 220, 46, root.title, { size: 15 })
  if (root.note) inner += t(W / 2, 84, root.note, { size: 11.5, fill: MUTED })
  branches.forEach((b, i) => {
    const cx = 40 + gap * i + gap / 2
    inner += line(W / 2, 66, cx, 130)
    inner += darkBox(cx - bw / 2, 130, bw, 44, b.title, { fill: A2 })
    ;(b.leaves || []).forEach((leaf, j) => {
      const lw = bw / (b.leaves.length || 1) - 10
      const lx = cx - bw / 2 + j * (bw / b.leaves.length)
      inner += line(cx, 174, lx + lw / 2, 210)
      inner += softBox(lx + 2, 210, lw, 40, leaf, { size: 13 })
    })
  })
  return svg(W, H, inner)
}

// A02 横向分层 + 贯穿栏
export function layers(page) {
  const W = 1100
  const H = 400
  const rows = page.rows || []
  const leftW = 150
  const crossW = page.cross ? 170 : 0
  const avail = W - 20 - leftW - 24 - crossW
  const rowH = Math.min(78, 340 / Math.max(1, rows.length))
  let inner = ''
  rows.forEach((r, i) => {
    const y = 20 + i * (rowH + 12)
    inner += darkBox(10, y, leftW, rowH, r.label, { fill: A2, size: 14 })
    const n = (r.boxes || []).length || 1
    ;(r.boxes || []).forEach((b, j) => {
      const bw = avail / n - 12
      inner += softBox(leftW + 24 + j * (avail / n) + 6, y, bw, rowH, b, { size: 13.5 })
    })
  })
  if (page.cross) {
    const h = rows.length * (rowH + 12) - 12
    inner += softBox(W - 10 - crossW, 20, crossW, h, '', { fill: SOFT, stroke: LINE })
    const lines = String(page.cross).split('\n')
    lines.forEach((l, i) => {
      inner += t(W - 10 - crossW / 2, 20 + h / 2 - (lines.length - 1) * 11 + i * 22, l, { size: 13.5 })
    })
  }
  return svg(W, H + 10, inner)
}

// A03 左侧接入 + 模块 + 底座。没有 entry 时模块铺满整行，底座仍跨全宽。
export function entryModules(page) {
  const W = 1100
  const H = 210
  const entry = page.entry
  const mods = page.modules || []
  const base = page.base || []
  const left = 10
  const mx = entry ? 200 : left
  const mw = (W - 10 - mx) / Math.max(1, mods.length)

  let inner = ''
  if (entry) {
    inner += darkBox(left, 30, 160, 104, '', { fill: A2 })
    inner += t(left + 80, 78, entry.title || '', { size: 15, fill: '#fff' })
    if (entry.note) inner += t(left + 80, 102, entry.note, { size: 11.5, fill: 'rgba(255,255,255,.75)' })
  }

  mods.forEach((m, i) => {
    inner += softBox(mx + i * mw + 6, 30, mw - 12, 62, m.title || m, { size: 13.5 })
    if (m.note) inner += t(mx + i * mw + mw / 2, 108, m.note, { size: 11.5, fill: MUTED })
  })

  // 底座：始终横跨模块区的完整宽度
  const bandX = left
  const bandW = W - left * 2
  const bandY = 152
  inner += softBox(bandX, bandY, bandW, 44, '', { fill: SOFT })

  const labelW = 140
  const label = page.baseLabel || '底座'
  inner += t(bandX + 20, bandY + 27, label, { size: 12.5, fill: MUTED, anchor: 'start' })

  const itemsW = (bandW - labelW - 30) / Math.max(1, base.length)
  base.forEach((b, i) => {
    inner += t(bandX + labelW + 20 + i * itemsW + itemsW / 2, bandY + 27, b, { size: 13 })
  })

  return svg(W, H, inner)
}

// A04 边界与接口
export function boundary(page) {
  const W = 1100
  const H = 380
  const inputs = page.inputs || []
  const outputs = page.outputs || []
  const core = page.core || {}
  let inner = `<rect x="20" y="40" width="${W - 40}" height="250" fill="none" stroke="${LINE}" stroke-dasharray="6 4"/>`
  inner += t(40, 30, page.frameLabel || '', { size: 12, fill: MUTED, anchor: 'start' })
  inputs.forEach((s, i) => {
    const y = 70 + i * 74
    inner += softBox(50, y, 210, 52, s, { size: 13.5 })
    inner += line(262, y + 26, 400, 150, {})
  })
  inner += darkBox(400, 120, 200, 70, '', { fill: A2 })
  inner += t(500, 150, core.title || '', { size: 15, fill: '#fff' })
  if (core.note) inner += t(500, 174, core.note, { size: 11.5, fill: 'rgba(255,255,255,.8)' })
  inner += line(602, 155, 740, 155, {})
  outputs.forEach((s, i) => {
    const y = 70 + i * 80
    inner += softBox(760, y, 200, 52, s, { size: 13.5 })
    inner += line(700, 155, 758, y + 26, {})
  })
  if (outputs.length === 1) inner += softBox(760, 130, 200, 52, outputs[0], { size: 13.5 })
  return svg(W, H, inner)
}

// A05 共同目标 + 并列支柱
export function pillars(page) {
  const W = 1100
  const H = 380
  const goal = page.goal || {}
  const cols = page.pillars || []
  let inner = darkBox(140, 30, W - 280, 60, '', { fill: A2 })
  inner += t(W / 2, 58, goal.title || '', { size: 15, fill: '#fff' })
  if (goal.note) inner += t(W / 2, 78, goal.note, { size: 11.5, fill: 'rgba(255,255,255,.8)' })
  const cw = (W - 280) / Math.max(1, cols.length)
  cols.forEach((c, i) => {
    const x = 140 + i * cw
    inner += line(x + cw / 2, 90, x + cw / 2, 130, {})
    inner += softBox(x + 10, 130, cw - 20, 92, '', { fill: SOFT })
    inner += t(x + cw / 2, 168, c.title || '', { size: 14 })
    if (c.note) inner += t(x + cw / 2, 192, c.note, { size: 12, fill: MUTED })
  })
  if (page.base) {
    inner += darkBox(140, 250, W - 280, 52, page.base, { fill: A })
    inner += t(W / 2, 326, page.baseNote || '', { size: 12, fill: MUTED })
  }
  return svg(W, H, inner)
}

// A06 单中心辐射
export function hub(page) {
  const W = 1100
  const H = 380
  const cx = W / 2
  const cy = 190
  const center = page.center || {}
  const spokes = page.spokes || []
  let inner = ''
  const pos = [
    [cx - 380, cy],
    [cx + 380, cy],
    [cx, cy - 130],
    [cx, cy + 130],
  ]
  spokes.slice(0, 4).forEach((s, i) => {
    const [x, y] = pos[i]
    inner += line(cx, cy, x, y, { dash: true })
    inner += softBox(x - 80, y - 26, 160, 52, s.title || '', { size: 13.5 })
    const lx = (cx + x) / 2 + (i < 2 ? 0 : 90)
    const ly = (cy + y) / 2 + (i < 2 ? -8 : 0)
    if (s.label) inner += t(lx, ly, s.label, { size: 11, fill: MUTED })
  })
  inner += darkBox(cx - 90, cy - 34, 180, 68, '', { fill: A2 })
  inner += t(cx, cy - 2, center.title || '', { size: 15, fill: '#fff' })
  if (center.note) inner += t(cx, cy + 20, center.note, { size: 11.5, fill: 'rgba(255,255,255,.8)' })
  return svg(W, H, inner)
}

// A07 多节点网络
export function network(page) {
  const W = 1100
  const H = 380
  const nodes = page.nodes || []
  const at = (id) => nodes.find((n) => n.id === id) || { x: 0, y: 0 }
  let inner = ''
  for (const [a, b, label] of page.links || []) {
    const p = at(a)
    const q = at(b)
    inner += line(p.x, p.y, q.x, q.y, { dash: true })
    if (label) inner += t((p.x + q.x) / 2, (p.y + q.y) / 2 - 6, label, { size: 11, fill: MUTED })
  }
  nodes.forEach((n) =>
    n.kind === 'accent'
      ? (inner += darkBox(n.x - 80, n.y - 24, 160, 48, n.label, { fill: A2, size: 13.5 }))
      : (inner += softBox(n.x - 70, n.y - 22, 140, 44, n.label, { size: 13 }))
  )
  return svg(W, H, inner)
}

// A08 多因汇聚 / A09 单因分化
export function fork(page, mode) {
  const W = 1100
  const H = 360
  const center = page.center || {}
  let inner = ''
  if (mode === 'converge') {
    const ins = page.inputs || []
    ins.forEach((s, i) => {
      const y = 70 + i * 110
      inner += softBox(40, y, 220, 56, s, { size: 13.5 })
      inner += line(262, y + 28, 420, 180, {})
    })
    inner += darkBox(420, 145, 220, 72, '', { fill: A2 })
    inner += t(530, 176, center.title || '', { size: 15, fill: '#fff' })
    if (center.note) inner += t(530, 200, center.note, { size: 11.5, fill: 'rgba(255,255,255,.8)' })
    inner += line(642, 181, 780, 181, {})
    inner += softBox(790, 155, 240, 56, page.output || '', { size: 13.5 })
  } else {
    inner += softBox(40, 155, 220, 56, page.input || '', { size: 13.5 })
    inner += line(262, 183, 420, 183, {})
    inner += darkBox(420, 145, 220, 72, '', { fill: A2 })
    inner += t(530, 176, center.title || '', { size: 15, fill: '#fff' })
    if (center.note) inner += t(530, 200, center.note, { size: 11.5, fill: 'rgba(255,255,255,.8)' })
    const outs = page.outputs || []
    outs.forEach((s, i) => {
      const y = 70 + i * 110
      inner += line(642, 181, 780, y + 28, {})
      inner += softBox(790, y, 240, 56, s, { size: 13.5 })
    })
  }
  return svg(W, H, inner)
}

// A10 双集合交集
export function venn(page) {
  const W = 1100
  const H = 380
  const a = page.a || {}
  const b = page.b || {}
  const cy = 190
  const r = 110
  let inner =
    `<circle cx="${W / 2 - 70}" cy="${cy}" r="${r}" fill="${SOFT}" stroke="${LINE}" opacity="0.9"/>` +
    `<circle cx="${W / 2 + 70}" cy="${cy}" r="${r}" fill="color-mix(in srgb, ${A} 16%, ${SOFT})" stroke="${LINE}"/>`
  inner += t(W / 2 - 110, cy - 6, a.title || '', { size: 14 })
  if (a.note) inner += t(W / 2 - 110, cy + 18, a.note, { size: 11.5, fill: MUTED })
  inner += t(W / 2 + 110, cy - 6, b.title || '', { size: 14 })
  if (b.note) inner += t(W / 2 + 110, cy + 18, b.note, { size: 11.5, fill: MUTED })
  inner += t(W / 2, cy, page.both || '', { size: 15, fill: A, weight: 600 })
  inner += t(W / 2, cy + 24, page.bothNote || '', { size: 11.5, fill: MUTED })
  return svg(W, H, inner)
}

// A11 逐层包含
export function nested(page) {
  const W = 1100
  const H = 380
  const outer = page.outer || {}
  const innerBox = page.inner || {}
  const core = page.core || {}
  const oy = 40
  const ow = W - 120
  const oh = 280
  let s = `<rect x="60" y="${oy}" width="${ow}" height="${oh}" fill="${SOFT}" stroke="${LINE}"/>`
  s += t(80, oy + 26, outer.title || '', { size: 13, fill: MUTED, anchor: 'start' })
  s += t(80, oy + 52, outer.items || '', { size: 13, anchor: 'start' })
  const iy = oy + 76
  const iw = ow - 160
  const ih = oh - 130
  s += `<rect x="140" y="${iy}" width="${iw}" height="${ih}" fill="color-mix(in srgb, ${A} 10%, ${SOFT})" stroke="${LINE}"/>`
  s += t(160, iy + 26, innerBox.title || '', { size: 13, fill: MUTED, anchor: 'start' })
  s += t(160, iy + 52, innerBox.items || '', { size: 13, anchor: 'start' })
  const cy2 = iy + 92
  s += darkBox(W / 2 - 200, cy2, 400, 56, core.title || '', { fill: A2, size: 14 })
  if (core.note) s += t(W / 2, cy2 + 80, core.note, { size: 12, fill: MUTED })
  return svg(W, H, s)
}
