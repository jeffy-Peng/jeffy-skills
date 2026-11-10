// 图表。全部输出内联 SVG，颜色走主题变量，构建时定型，不依赖脚本。
const F = 'var(--f-title)'
const A = 'var(--accent)'
const A2 = 'var(--accent2)'
const LINE = 'var(--line)'
const MUTED = 'var(--muted)'
const INK = 'var(--ink)'

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const txt = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${F}" font-size="${o.size || 11}" fill="${o.fill || MUTED}" text-anchor="${o.anchor || 'start'}" ${o.weight ? `font-weight="${o.weight}"` : ''}>${esc(s)}</text>`

const frame = (w, h, inner) =>
  `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block">${inner}</svg>`

// 横向条形：排名、构成占比都用它
export function barH(rows, opt = {}) {
  const W = 900
  const rowH = opt.rowH || 46
  const H = rows.length * rowH + 10
  const max = opt.max || Math.max(...rows.map((r) => r.value)) * 1.05
  const left = 150
  const right = W - 90
  const inner = rows
    .map((r, i) => {
      const y = i * rowH + 14
      const w = Math.max(2, ((r.value / max) * (right - left)))
      const fill = r.hl ? A : A2
      return (
        txt(left - 14, y + 14, r.label, { anchor: 'end', size: 12, fill: INK }) +
        `<rect x="${left}" y="${y}" width="${right - left}" height="16" fill="${LINE}" opacity="0.5"/>` +
        `<rect x="${left}" y="${y}" width="${w}" height="16" fill="${fill}"/>` +
        txt(left + w + 10, y + 14, r.display ?? r.value, { size: 11 })
      )
    })
    .join('')
  return frame(W, H, inner)
}

// 纵向柱：直方图、正负贡献
export function column(items, opt = {}) {
  const W = 900
  const H = opt.height || 300
  const padL = 40
  const padB = 34
  const padT = 16
  const n = items.length
  const maxV = Math.max(...items.map((d) => Math.abs(d.value))) || 1
  const zeroY = opt.zero ? padT + (H - padT - padB) / 2 : H - padB
  const scale = opt.zero ? (H - padT - padB) / 2 / maxV : (H - padT - padB) / maxV
  const bw = Math.max(6, (W - padL - 20) / n - 10)
  const inner = items
    .map((d, i) => {
      const x = padL + i * ((W - padL - 20) / n) + 5
      const h = Math.abs(d.value) * scale
      const y = d.value >= 0 ? zeroY - h : zeroY
      const fill = d.color === 'soft' ? LINE : d.neg ? A : A
      return (
        `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(1, h)}" fill="${d.color === 'soft' ? '#CFC8BF' : fill}"/>` +
        txt(x + bw / 2, H - padB + 16, d.label, { anchor: 'middle', size: 10.5 })
      )
    })
    .join('')
  const base = opt.zero ? `<line x1="${padL}" y1="${zeroY}" x2="${W - 20}" y2="${zeroY}" stroke="${INK}" stroke-width="1"/>` : `<line x1="${padL}" y1="${H - padB}" x2="${W - 20}" y2="${H - padB}" stroke="${INK}" stroke-width="1"/>`
  return frame(W, H, base + inner)
}

// 折线：单系列、多系列、加目标线
export function line(series, opt = {}) {
  const W = opt.width || 900
  const H = opt.height || 300
  const padL = 44
  const padR = 24
  const padT = 18
  const padB = 34
  const all = series.flatMap((s) => s.points)
  const minY = opt.min ?? Math.min(...all)
  const maxY = opt.max ?? Math.max(...all)
  const span = maxY - minY || 1
  const px = (i, n) => padL + (i * (W - padL - padR)) / Math.max(1, n - 1)
  const py = (v) => H - padB - ((v - minY) / span) * (H - padT - padB)
  let inner = ''
  if (opt.target != null) {
    const ty = py(opt.target)
    inner += `<line x1="${padL}" y1="${ty}" x2="${W - padR}" y2="${ty}" stroke="${A}" stroke-width="1" stroke-dasharray="4 4"/>`
    inner += txt(W - padR, ty - 6, opt.targetLabel || '目标', { anchor: 'end', size: 10.5, fill: A })
  }
  series.forEach((s, si) => {
    const pts = s.points.map((v, i) => `${px(i, s.points.length)},${py(v)}`).join(' ')
    inner += `<polyline points="${pts}" fill="none" stroke="${si === 0 ? A : A2}" stroke-width="2"/>`
    if (opt.dots !== false)
      s.points.forEach((v, i) => {
        inner += `<circle cx="${px(i, s.points.length)}" cy="${py(v)}" r="2.5" fill="${si === 0 ? A : A2}"/>`
      })
  })
  ;(opt.labels || []).forEach((l, i) => {
    inner += txt(px(i, opt.labels.length), H - padB + 18, l, { anchor: 'middle', size: 10.5 })
  })
  inner += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="${INK}" stroke-width="1"/>`
  inner += txt(padL - 8, padT + 4, String(Math.round(maxY)), { anchor: 'end', size: 10 })
  inner += txt(padL - 8, H - padB, String(Math.round(minY)), { anchor: 'end', size: 10 })
  return frame(W, H, inner)
}

// 环形构成
export function donut(items, opt = {}) {
  const S = 300
  const cx = S / 2
  const cy = S / 2
  const r = 96
  const sw = 34
  const total = items.reduce((a, b) => a + b.value, 0) || 1
  let acc = -Math.PI / 2
  const C = 2 * Math.PI * r
  let inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${LINE}" stroke-width="${sw}"/>`
  items.forEach((d, i) => {
    const frac = d.value / total
    const len = frac * C
    const col = i === 0 ? A : i === 1 ? A2 : '#CFC8BF'
    inner += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc * r}" transform="rotate(-90 ${cx} ${cy})"/>`
    acc += (d.value / total) * 2 * Math.PI
  })
  inner += txt(cx, cy + 6, opt.center || '100%', { anchor: 'middle', size: 22, fill: INK, weight: 600 })
  const legend = items
    .map((d, i) => {
      const col = i === 0 ? A : i === 1 ? A2 : '#CFC8BF'
      const y = 40 + i * 26
      return `<rect x="${S + 10}" y="${y - 9}" width="10" height="10" fill="${col}"/>` + txt(S + 28, y, `${d.label} ${Math.round((d.value / total) * 100)}%`, { size: 11.5 })
    })
    .join('')
  return frame(S + 190, S, `<g transform="translate(0,0)">${inner}${legend}</g>`)
}

// 百分比堆叠条
export function stack100(rows, opt = {}) {
  const W = 900
  const rowH = 54
  const H = rows.length * rowH + 20
  const left = 110
  const right = W - 20
  const total = opt.total || 100
  let inner = ''
  rows.forEach((r, i) => {
    const y = i * rowH + 10
    let x = left
    inner += txt(left - 14, y + 18, r.label, { anchor: 'end', size: 12, fill: INK })
    r.segments.forEach((s, si) => {
      const w = ((s.value / total) * (right - left))
      const col = si === 0 ? A2 : si === 1 ? A : '#CFC8BF'
      inner += `<rect x="${x}" y="${y}" width="${Math.max(1, w)}" height="24" fill="${col}"/>`
      if (w > 44) inner += txt(x + w / 2, y + 17, Math.round(s.value) + '%', { anchor: 'middle', size: 10.5, fill: '#fff' })
      x += w
    })
  })
  return frame(W, H, inner)
}

// 散点
export function scatter(points, opt = {}) {
  const W = 900
  const H = opt.height || 300
  const padL = 46
  const padB = 36
  const padT = 18
  const padR = 24
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const px = (v) => padL + ((v - x0) / (x1 - x0 || 1)) * (W - padL - padR)
  const py = (v) => H - padB - ((v - y0) / (y1 - y0 || 1)) * (H - padT - padB)
  let inner = `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="${INK}" stroke-width="1"/>`
  inner += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="${INK}" stroke-width="1"/>`
  inner += points
    .map((p) => `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="4.5" fill="${p.hl ? A : A2}" opacity="${p.hl ? 1 : 0.75}"/>`)
    .join('')
  if (opt.xLabel) inner += txt(W / 2, H - 6, opt.xLabel, { anchor: 'middle', size: 11 })
  if (opt.yLabel) inner += txt(12, padT + 4, opt.yLabel, { size: 11 })
  return frame(W, H, inner)
}

// 瀑布
export function waterfall(items, opt = {}) {
  const W = 900
  const H = opt.height || 300
  const padL = 44
  const padB = 36
  const padT = 20
  let run = 0
  const bounds = items.map((d) => {
    if (d.kind === 'total') {
      const start = 0
      return { start, end: d.value }
    }
    const start = run
    run += d.value
    return { start, end: run }
  })
  const all = bounds.flatMap((b) => [b.start, b.end])
  const lo = Math.min(0, ...all)
  const hi = Math.max(...all)
  const py = (v) => H - padB - ((v - lo) / (hi - lo || 1)) * (H - padT - padB)
  const bw = Math.max(8, (W - padL - 30) / items.length - 16)
  let inner = `<line x1="${padL}" y1="${py(0)}" x2="${W - 20}" y2="${py(0)}" stroke="${INK}" stroke-width="1"/>`
  items.forEach((d, i) => {
    const b = bounds[i]
    const x = padL + i * ((W - padL - 30) / items.length) + 8
    const y1 = py(Math.max(b.start, b.end))
    const y2 = py(Math.min(b.start, b.end))
    const col = d.kind === 'total' ? A2 : d.value >= 0 ? A : '#CFC8BF'
    inner += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1, y2 - y1)}" fill="${col}"/>`
    inner += txt(x + bw / 2, H - padB + 18, d.label, { anchor: 'middle', size: 10.5 })
    if (d.kind !== 'total') inner += txt(x + bw / 2, y1 - 6, (d.value > 0 ? '+' : '') + d.value, { anchor: 'middle', size: 10 })
  })
  return frame(W, H, inner)
}

// 哑铃
export function dumbbell(rows, opt = {}) {
  const W = 900
  const H = rows.length * 46 + 30
  const left = 140
  const right = W - 60
  const all = rows.flatMap((r) => [r.a, r.b])
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const px = (v) => left + ((v - lo) / (hi - lo || 1)) * (right - left)
  let inner = ''
  rows.forEach((r, i) => {
    const y = i * 46 + 20
    inner += txt(left - 14, y + 4, r.label, { anchor: 'end', size: 12, fill: INK })
    inner += `<line x1="${px(r.a)}" y1="${y}" x2="${px(r.b)}" y2="${y}" stroke="#CFC8BF" stroke-width="6"/>`
    inner += `<circle cx="${px(r.a)}" cy="${y}" r="5" fill="${A2}"/>`
    inner += `<circle cx="${px(r.b)}" cy="${y}" r="5" fill="${A}"/>`
    inner += txt(px(r.a), y - 12, r.a, { anchor: 'middle', size: 10 })
    inner += txt(px(r.b), y - 12, r.b, { anchor: 'middle', size: 10 })
  })
  const legend =
    `<rect x="${left}" y="${H - 12}" width="9" height="9" fill="${A2}"/>` + txt(left + 14, H - 4, opt.legendA || '当期', { size: 10.5 }) +
    `<rect x="${left + 90}" y="${H - 12}" width="9" height="9" fill="${A}"/>` + txt(left + 104, H - 4, opt.legendB || '上期', { size: 10.5 })
  return frame(W, H, inner + legend)
}

// 分面小图：三张小图并排，各自独立 SVG
export function panels(list, opt = {}) {
  const items = list
    .map(
      (s) =>
        `<div>${line([{ points: s.points }], { width: 300, height: 190, labels: s.labels, dots: true })}` +
        `<p class="ptitle">${esc(s.title || '')}</p></div>`
    )
    .join('')
  return `<div class="panels">${items}</div>`
}
