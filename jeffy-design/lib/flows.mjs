// 流程与时间图形。全部内联 SVG，颜色走主题变量。
const F = 'var(--f-title)'
const A = 'var(--accent)'
const A2 = 'var(--accent2)'
const MUTED = 'var(--muted)'
const INK = 'var(--ink)'
const LINE = 'var(--line)'

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const t = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${F}" font-size="${o.size || 13}" fill="${o.fill || INK}" text-anchor="${o.anchor || 'start'}" ${o.weight ? `font-weight="${o.weight}"` : ''}>${esc(s)}</text>`
const svg = (w, h, inner, label) =>
  `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(label || '')}">${inner}</svg>`

const arrowDefs = (id = 'ar') =>
  `<defs><marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#736E67"/></marker></defs>`

// 横向链条
export function chain(items, opt = {}) {
  const W = 1100
  const H = opt.height || 400
  const n = items.length
  const gap = (W - 60) / n
  const y = H / 2
  let inner = arrowDefs()
  items.forEach((it, i) => {
    const x = 30 + i * gap
    const bw = gap - 60
    inner += `<rect x="${x}" y="${y - 26}" width="${bw}" height="52" fill="${i === opt.hl ? A : 'none'}" stroke="${i === opt.hl ? A : LINE}"/>`
    inner += t(x + bw / 2, y + 5, it.title, { anchor: 'middle', size: 13, fill: i === opt.hl ? '#fff' : INK })
    if (it.note) inner += t(x + bw / 2, y + 46, it.note, { anchor: 'middle', size: 11, fill: MUTED })
    if (it.step) inner += t(x, y - 40, it.step, { size: 11, fill: A })
    if (i < n - 1) inner += `<path d="M${x + bw + 8} ${y}h${gap - bw - 20}" stroke="#736E67" stroke-width="1.6" marker-end="url(#ar)"/>`
  })
  return svg(W, H, inner, '横向连续步骤')
}

// 条件分流：起点 + 判定 + 两支
export function branch(page) {
  const W = 1100
  const H = 420
  const inner =
    arrowDefs() +
    `<rect x="30" y="120" width="150" height="52" fill="none" stroke="${LINE}"/>` +
    t(105, 151, page.start || '起点', { anchor: 'middle' }) +
    `<path d="M180 146h120" stroke="#736E67" stroke-width="1.6" marker-end="url(#ar)"/>` +
    `<path d="M420 90L500 146L420 202L340 146Z" fill="none" stroke="${A}"/>` +
    t(420, 151, page.decision || '判定', { anchor: 'middle', size: 12 }) +
    `<path d="M500 126h150v-56h120" stroke="#736E67" stroke-width="1.6" fill="none" marker-end="url(#ar)"/>` +
    `<path d="M500 166h150v56h120" stroke="#736E67" stroke-width="1.6" fill="none" marker-end="url(#ar)"/>` +
    `<rect x="770" y="40" width="180" height="52" fill="none" stroke="${LINE}"/>` +
    t(860, 71, page.yes || '是', { anchor: 'middle' }) +
    `<rect x="770" y="222" width="180" height="52" fill="none" stroke="${LINE}"/>` +
    t(860, 253, page.no || '否', { anchor: 'middle' }) +
    t(520, 100, page.yesLabel || '', { size: 11, fill: MUTED }) +
    t(520, 214, page.noLabel || '', { size: 11, fill: MUTED })
  return svg(W, H, inner, '条件分流')
}

// 分流后汇合
export function merge(page) {
  const W = 1100
  const H = 420
  const inner =
    arrowDefs() +
    `<rect x="20" y="120" width="150" height="52" fill="none" stroke="${LINE}"/>` +
    t(95, 151, page.start || '起点', { anchor: 'middle' }) +
    `<path d="M170 146h60" stroke="#736E67" stroke-width="1.6" marker-end="url(#ar)"/>` +
    `<path d="M230 146h80V96h120" stroke="#736E67" stroke-width="1.6" fill="none" marker-end="url(#ar)"/>` +
    `<path d="M230 146h80v100h120" stroke="#736E67" stroke-width="1.6" fill="none" marker-end="url(#ar)"/>` +
    `<rect x="440" y="70" width="200" height="52" fill="none" stroke="${LINE}"/>` +
    t(540, 101, page.a || '分支一', { anchor: 'middle' }) +
    `<rect x="440" y="220" width="200" height="52" fill="none" stroke="${LINE}"/>` +
    t(540, 251, page.b || '分支二', { anchor: 'middle' }) +
    `<path d="M640 96h60v50" stroke="#736E67" stroke-width="1.6" fill="none"/>` +
    `<path d="M640 246h60v-50" stroke="#736E67" stroke-width="1.6" fill="none"/>` +
    `<path d="M700 146h60" stroke="#736E67" stroke-width="1.6" marker-end="url(#ar)"/>` +
    `<rect x="770" y="120" width="200" height="52" fill="${A2}" stroke="${A2}"/>` +
    t(870, 151, page.end || '汇合', { anchor: 'middle', fill: '#fff' })
  return svg(W, H, inner, '分流后汇合')
}

// 等距事件轴
export function axis(page) {
  const W = 1100
  const H = 380
  const items = page.points || []
  const n = items.length
  const y = H / 2
  let inner = ``
  inner += `<path d="M40 ${y}H${W - 40}" stroke="${INK}" stroke-width="1"/>`
  items.forEach((p, i) => {
    const x = 40 + (i * (W - 80)) / (n - 1)
    const up = i % 2 === 0
    inner += `<path d="M${x} ${y}V${up ? y - 34 : y + 34}" stroke="${INK}" stroke-width="1"/>`
    inner += `<circle cx="${x}" cy="${y}" r="4" fill="${A}"/>`
    inner += t(x, up ? y - 44 : y + 52, p.title, { anchor: 'middle', size: 12 })
    inner += t(x, up ? y - 62 : y + 70, p.when || '', { anchor: 'middle', size: 11, fill: MUTED })
  })
  return svg(W, H, inner, '等距事件轴')
}

// 纵向大事记
export function milestones(page) {
  const W = 1100
  const items = page.items || []
  const rowH = 74
  const H = items.length * rowH + 20
  const x = 150
  let inner = `<path d="M${x} 10V${H - 10}" stroke="${LINE}" stroke-width="1"/>`
  items.forEach((it, i) => {
    const y = 20 + i * rowH
    inner += `<circle cx="${x}" cy="${y}" r="4.5" fill="${A}"/>`
    inner += t(x - 18, y + 4, it.when || '', { anchor: 'end', size: 12, fill: MUTED })
    inner += t(x + 24, y + 4, it.title, { size: 13, weight: 600 })
    if (it.note) inner += t(x + 24, y + 24, it.note, { size: 11.5, fill: MUTED })
  })
  return svg(W, H, inner, '纵向大事记')
}

// 甘特：时间段 + 任务条
export function gantt(page) {
  const W = 1100
  const periods = page.periods || []
  const rows = page.tasks || []
  const left = 170
  const top = 34
  const rowH = 62
  const H = top + rows.length * rowH + 30
  const colW = (W - left - 30) / Math.max(1, periods.length)
  let inner = ''
  periods.forEach((p, i) => {
    inner += t(left + i * colW + colW / 2, 20, p, { anchor: 'middle', size: 11.5, fill: MUTED })
  })
  rows.forEach((r, ri) => {
    const y = top + ri * rowH
    inner += `<path d="M20 ${y + rowH - 6}H${W - 20}" stroke="${LINE}" stroke-width="1"/>`
    inner += t(20, y + 22, r.label, { size: 13 })
    const x = left + r.start * colW
    const w = Math.max(colW * 0.9, r.span * colW - 8)
    inner += `<rect x="${x + 4}" y="${y + 10}" width="${w}" height="22" fill="${r.color === 'accent' ? A : A2}"/>`
    if (r.mark) inner += `<circle cx="${x + w - 4}" cy="${y + 21}" r="4" fill="${A}"/>`
  })
  return svg(W, H, inner, '甘特排期')
}

// 阶梯路线
export function stairs(page) {
  const W = 1100
  const H = 380
  const items = page.stages || []
  const bw = (W - 80) / items.length
  let inner = ''
  items.forEach((s, i) => {
    const x = 40 + i * bw
    const y = H - 70 - i * 34
    inner += `<rect x="${x + 8}" y="${y}" width="${bw - 20}" height="52" fill="${i === items.length - 1 ? A2 : LINE}" opacity="${i === items.length - 1 ? 1 : 0.55}"/>`
    inner += t(x + 8 + (bw - 20) / 2, y + 31, s.title, { anchor: 'middle', size: 12.5, fill: i === items.length - 1 ? '#fff' : INK })
    if (s.note) inner += t(x + 8 + (bw - 20) / 2, y - 10, s.note, { anchor: 'middle', size: 11, fill: MUTED })
  })
  return svg(W, H, inner, '阶梯式阶段路线')
}

// 泳道：跨角色交接
export function lanes(page) {
  const W = 1100
  const rows = page.lanes || []
  const top = 20
  const rowH = 76
  const H = top + rows.length * rowH + 20
  const left = 140
  let inner = ''
  rows.forEach((r, ri) => {
    const y = top + ri * rowH
    inner += `<path d="M20 ${y + rowH}H${W - 20}" stroke="${LINE}" stroke-width="1"/>`
    inner += t(20, y + 30, r.label, { size: 12.5 })
    inner += `<rect x="${left + r.start * 6}" y="${y + 14}" width="${r.w * 6}" height="28" fill="${r.color === 'accent' ? A : A2}"/>`
    inner += t(left + r.start * 6 + 12, y + 33, r.title, { size: 11.5, fill: '#fff' })
    if (r.hand) inner += `<path d="M${left + (r.start + r.w) * 6} ${y + 28}l30 34" stroke="${A}" stroke-width="1.2" stroke-dasharray="3 3"/>`
  })
  return svg(W, H, inner, '跨角色交接')
}

// 体验曲线
export function curve(page) {
  const W = 1100
  const H = 400
  const pts = page.points || []
  const padL = 40
  const padB = 60
  const padT = 30
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const px = (v) => padL + ((v - x0) / (x1 - x0 || 1)) * (W - padL - 40)
  const py = (v) => H - padB - ((v - y0) / (y1 - y0 || 1)) * (H - padT - padB)
  let inner = `<path d="M${pts.map((p) => `${px(p.x)} ${py(p.y)}`).join('L')}" fill="none" stroke="${A}" stroke-width="2"/>`
  pts.forEach((p) => {
    inner += `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="4" fill="${A}"/>`
    inner += t(px(p.x), py(p.y) - 12, p.label || '', { anchor: 'middle', size: 11.5 })
    inner += t(px(p.x), py(p.y) + 22, p.note || '', { anchor: 'middle', size: 11, fill: MUTED })
  })
  return svg(W, H, inner, '体验起伏旅程')
}

// 闭环迭代：2×2 四节点顺时针
export function loop(page) {
  const W = 1100
  const H = 420
  const nodes = page.nodes || []
  const boxW = 260
  const boxH = 80
  const xs = [140, 700]
  const ys = [50, 290]
  const pos = [[xs[0], ys[0]], [xs[1], ys[0]], [xs[1], ys[1]], [xs[0], ys[1]]]
  const box = (n, k) => {
    const [x, y] = pos[k]
    const acc = n.color === 'accent'
    return (
      `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" fill="${acc ? A : 'none'}" stroke="${acc ? A : LINE}" stroke-width="1.4"/>` +
      t(x + boxW / 2, y + 47, n.title, { anchor: 'middle', size: 17, fill: acc ? '#fff' : INK })
    )
  }
  let inner = arrowDefs() + nodes.map(box).join('')
  inner += `<path d="M${xs[0] + boxW + 12} ${ys[0] + boxH / 2}H${xs[1] - 12}" stroke="#736E67" stroke-width="1.8" marker-end="url(#ar)"/>`
  inner += `<path d="M${xs[1] + boxW / 2} ${ys[0] + boxH + 12}V${ys[1] - 12}" stroke="#736E67" stroke-width="1.8" marker-end="url(#ar)"/>`
  inner += `<path d="M${xs[1] - 12} ${ys[1] + boxH / 2}H${xs[0] + boxW + 12}" stroke="#736E67" stroke-width="1.8" marker-end="url(#ar)"/>`
  inner += `<path d="M${xs[0] + boxW / 2} ${ys[1] - 12}V${ys[0] + boxH + 12}" stroke="#736E67" stroke-width="1.8" marker-end="url(#ar)" stroke-dasharray="5 5"/>`
  return svg(W, H, inner, '闭环迭代')
}
