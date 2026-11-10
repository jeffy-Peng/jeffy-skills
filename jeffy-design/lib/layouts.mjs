// 版式。所有页面由「带」组成：entry / modules / base / note。
// 删掉哪条带，剩下的按权重重新分高度，不留空洞。
import { compose } from './compose.mjs'
import { icon } from './icons.mjs'
import { coverLeft, coverCenter, coverBlock, coverSplit, opening, toc, chapters, agenda, schedule, chapterDark, chapterTrans, guide, thanks, contact } from './covers.mjs'
import { chain, branch, merge, axis, milestones, gantt as ganttChart, stairs, lanes, curve, loop } from './flows.mjs'
import { tree, layers, entryModules, boundary, pillars, hub, network, fork, venn, nested } from './diagrams.mjs'
import { barH, column, line, donut, stack100, scatter, waterfall, dumbbell, panels } from './charts.mjs'

const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

const rich = (parts) =>
  (parts || [])
    .map((p) => (typeof p === 'string' ? esc(p) : `<span class="${p.hl ? 'hl' : ''}">${esc(p.t)}</span>`))
    .join('')

const pad2 = (n) => String(n).padStart(2, '0')

// 字符串直接转义，数组按富文本处理，用来标红关键词
const txt = (v) => (Array.isArray(v) ? rich(v) : esc(v ?? ''))

function chrome(meta, page, i, n) {
  return [
    `<div class="head"><h1 class="title">${esc(page.title)}</h1></div>`,
    `<div class="pageno">${pad2(i)}</div>`,
  ].join('')
}

function bandInner(b) {
  if (b.type === 'entry' || b.type === 'note') {
    return (
      (b.title ? `<p class="bt">${esc(b.title)}</p>` : '') + `<p class="bd">${txt(b.body)}</p>`
    )
  }
  if (b.type === 'modules') {
    return (
      '<div class="b-mods">' +
      (b.items || [])
        .map(
          (m, mi) =>
            `<div class="b-mod${b.emphasis === mi ? ' hi' + (b.emphasisStyle === 'soft' ? ' soft' : '') : ''}">` +
            (m.no ? `<div class="idx">${esc(m.no)}</div>` : '') +
            `<p class="mt">${esc(m.title)}</p><p class="mb">${txt(m.body)}</p>` +
            (m.en ? `<p class="me">${esc(m.en)}</p>` : '') +
            `</div>`
        )
        .join('') +
      '</div>'
    )
  }
  if (b.type === 'base') {
    return (
      (b.title ? `<p class="bt">${esc(b.title)}</p>` : '') +
      '<div class="b-base">' +
      (b.pills || []).map((x) => `<span class="pill">${esc(x)}</span>`).join('') +
      '</div>'
    )
  }
  return `<p class="bd">${txt(b.body)}</p>`
}

// P01 分带页
function P01(meta, page, i, n) {
  const bands = (page.bands || []).filter((b) => b && b.type)
  const html = bands
    .map(
      (b) =>
        `<div class="band ${b.type}">` +
        bandInner(b) +
        '</div>'
    )
    .join('')
  return `${chrome(meta, page, i, n)}
<div class="bands">${html}</div>
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// P02 观点页：一句话 + 一个数字
function P02(meta, page, i, n) {
  const hero = page.hero || {}
  return `<div class="p02-kicker">${esc(page.kicker || '')}</div>
<h1 class="p02-title">${esc(page.title || '')}</h1>
<div class="p02-rule"></div>
<p class="p02-lead">${txt(page.lead)}</p>
<div class="p02-hero"><span class="num">${esc(hero.num || '')}</span><span class="lab">${esc(hero.label || '')}</span></div>
<div class="p02-src">${esc(page.footnote || '')}</div>
<div class="foot">${esc(meta.short || '')}</div>
<div class="foothr"></div>
<div class="pageno">${pad2(i)} / ${pad2(n)}</div>`
}

// P03 三栏分隔：竖线分栏，无实色块，底部一句结论
function P03(meta, page, i, n) {
  const cols = (page.items || [])
    .map(
      (m) => `<div class="p03-col">
<div class="idx">${esc(m.no || '')}</div>
<p class="mt">${esc(m.title)}</p>
<p class="mb">${txt(m.body)}</p>${m.en ? `<p class="me">${esc(m.en)}</p>` : ''}
</div>`
    )
    .join('')
  let cross = ''
  if (page.cross) {
    const raw = String(page.cross).split('\n')
    const head = raw.length > 1 ? raw.shift() : ''
    const body = raw.join(' ').trim()
    cross = `<div class="p03-rail"><div>${head ? `<p class="p03-rail-h">${esc(head)}</p>` : ''}${body ? `<p class="p03-rail-b">${txt(body)}</p>` : ''}</div></div>`
  }
  const colsBlock = cross
    ? `<div class="p03-with-rail"><div class="p03-cols">${cols}</div>${cross}</div>`
    : `<div class="p03-cols">${cols}</div>`

  return `${chrome(meta, page, i, n)}
${colsBlock}
${page.conclusion ? `<div class="p03-con">${txt(page.conclusion)}</div>` : ''}
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// 双栏公共件
const pair = (zh, en) => `<p class="mb">${txt(zh)}</p>` + (en ? `<p class="me">${esc(en)}</p>` : '')

const duoWrap = (cls, cols) => `<div class="duo ${cls}">${cols.join('')}</div>`

// P04 双栏观点：两边各说一段，中缝一条竖线
function P04(meta, page, i, n) {
  const cols = (page.sides || []).map(
    (s) =>
      `<div class="duo-col"><p class="mt">${esc(s.title)}</p>` +
      (s.blocks || []).map((b) => pair(b.zh, b.en)).join('') +
      '</div>'
  )
  return `${chrome(meta, page, i, n)}${duoWrap('pa', cols)}
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// P05 双栏对照：同名条目逐行对齐，行间细线
function P05(meta, page, i, n) {
  const cols = (page.columns || []).map(
    (c) =>
      `<div class="duo-col"><p class="mt">${esc(c.name)}</p>` +
      (c.rows || [])
        .map((r) => `<div class="row"><p class="mt">${esc(r.k)}</p>${pair(r.zh, r.en)}</div>`)
        .join('') +
      '</div>'
  )
  return `${chrome(meta, page, i, n)}${duoWrap('pb', cols)}
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// P06 图文对读：上图下文，图位留空待填
function P06(meta, page, i, n) {
  const cols = (page.items || []).map(
    (it) =>
      `<div class="duo-col"><div class="duo-fig">${esc(it.figure || '图像位置')}</div>` +
      `<p class="mt">${esc(it.caption)}</p>` +
      pair(it.zh, it.en) +
      '</div>'
  )
  return `${chrome(meta, page, i, n)}${duoWrap('pc', cols)}
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// P07 指标并列：两块浅底，数字居中放大
function P07(meta, page, i, n) {
  const cols = (page.items || []).map(
    (it) =>
      `<div class="duo-col"><div class="panel"><p class="mt">${esc(it.label)}</p>` +
      `<div class="num">${esc(it.value)}</div>${pair(it.zh, it.en)}</div></div>`
  )
  return `${chrome(meta, page, i, n)}${duoWrap('', cols)}
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// 卡片族。20 张标准页共用一套网格，靠 group 和 variant 区分。
const CARDS_SPEC = {
  C01: ['g0', 'v0', 0], C02: ['g0', 'v1', 0], C03: ['g0', 'v2', 0], C04: ['g0', 'v3', 0],
  C05: ['g1', 'v0', 3], C06: ['g1', 'v1', 4], C07: ['g1', 'v2', 3], C08: ['g1', 'v3', 3],
  C09: ['g2', 'v0', 2], C10: ['g2', 'v1', 2], C11: ['g2', 'v2', 2], C12: ['g2', 'v3', 2],
  C13: ['g3', 'v0', 3], C14: ['g3', 'v1', 4], C15: ['g3', 'v2', 3], C16: ['g3', 'v3', 3],
  C17: ['g4', 'v0', 0], C18: ['g4', 'v1', 0], C19: ['g4', 'v2', 0], C20: ['g4', 'v3', 0],
}

const cardBody = (it, withIdx) =>
  (withIdx && it.idx ? `<span class="idx">${esc(it.idx)}</span>` : '') +
  (it.h2 ? `<h2>${esc(it.h2)}</h2>` : '') +
  (it.big ? `<div class="big">${esc(it.big)}</div>` : '') +
  (it.zh ? `<p>${txt(it.zh)}</p>` : '') +
  (it.en ? `<p class="en">${esc(it.en)}</p>` : '')

function CARDS(id, meta, page, i, n) {
  const [g, v, cols] = CARDS_SPEC[id]
  const style = cols ? ` style="grid-template-columns:repeat(${cols},1fr)"` : ''
  const hero = page.hero ? `<article class="hero">${cardBody(page.hero, false)}</article>` : ''
  const items = (page.items || []).map((it) => `<article class="item">${cardBody(it, true)}</article>`).join('')
  let inner = items
  if (page.hero && g === 'g0') inner = hero + `<div class="rail">${items}</div>`
  else if (page.hero && g === 'g4') inner = hero + items
  else if (page.hero) inner = hero + items
  const cls = ['cp', g, v, g === 'g1' ? 'cols' : '', g === 'g2' || g === 'g3' ? 'grid' : '']
    .filter(Boolean)
    .join(' ')
  return `${chrome(meta, page, i, n)}
<div class="${cls}"${style}>${inner}</div>
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// 标题与正文族。28 张共用一套 area 版式，靠修饰类区分。
const TX_SPEC = {
  T01: 'center', T02: '', T03: '', T04: 'side',
  T05: '', T06: '', T07: '', T08: 'side',
  T09: 'center', T10: '', T11: 'two', T12: 'side',
  T13: 'steps', T14: '', T15: 'two', T16: '',
  T17: '', T18: 'steps', T19: '', T20: 'two',
  T21: 'two', T22: 'three', T23: 'two', T24: 'two',
  T25: 'side', T26: 'steps', T27: 'two', T28: '',
}

const txParts = (it) =>
  (it.tag ? `<span class="tag">${esc(it.tag)}</span>` : '') +
  (it.quote ? `<span class="quote">${esc(it.quote)}</span>` : '') +
  (it.h2 ? `<h2>${esc(it.h2)}</h2>` : '') +
  (it.hero ? `<p class="heroText">${txt(it.hero)}</p>` : '') +
  (it.p ? `<p>${txt(it.p)}</p>` : '') +
  (it.en ? `<p class="en">${esc(it.en)}</p>` : '')

function TEXT(id, meta, page, i, n) {
  const area = TX_SPEC[id] ?? ''
  const items = page.items || []
  const dual = items.length === 2 && items.every((x) => x.tag && x.h2 && x.p)
  const inner =
    area === 'steps'
      ? items
          .map(
            (r) =>
              `<div class="row"><h2>${esc(r.h2 || '')}</h2><article>${r.p ? `<p>${txt(r.p)}</p>` : ''}` +
              `${r.en ? `<p class="en">${esc(r.en)}</p>` : ''}</article></div>`
          )
          .join('')
            : items
          .map((it) => {
            const art = `<article class="${it.mods || ''}">${txParts(it)}</article>`
            return it.wrap === 'tint' ? `<div class="tint-wrap">${art}</div>` : art
          })
          .join('')
  return `${chrome(meta, page, i, n)}
<div class="tx ${area}${page.fill ? ' fill' : ''}${items[0] && items[0].quote ? ' quote-page' : ''}${dual ? ' dual' : ''}">${inner}</div>
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// 表格族：交叉比较表、明细表
const TABLE_SPEC = { X01: 'matrix', D01: 'std', D02: 'split2', D03: 'turn', D04: 'focus' }

const tbl = (cols, rows, hl) =>
  '<table>' +
  (cols && cols.length ? `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : '') +
  '<tbody>' +
  (rows || [])
    .map(
      (r, ri) =>
        `<tr class="${hl != null && hl === ri + 1 ? 'hot' : ''}">` +
        r.map((c) => `<td>${esc(c)}</td>`).join('') +
        '</tr>'
    )
    .join('') +
  '</tbody></table>'

function TABLE(id, meta, page, i, n) {
  const v = TABLE_SPEC[id] || 'std'
  let inner = ''
  if (v === 'matrix' && (page.formula || page.effects?.length)) {
    const formula = page.formula
      ? `<header><b>${esc(page.formula)}</b><span>${esc(page.example)}</span></header>` : ''
    const effects = (page.effects || []).map(item =>
      `<article><b>${esc(item.title)}</b><p>${esc(item.body)}</p></article>`
    ).join('')
    return chrome(meta, page, i, n) + '<div class="analysis-table">' + formula
      + (page.caption ? `<p class="cap">${esc(page.caption)}</p>` : '')
      + tbl(page.columns, page.rows, page.highlight)
      + (effects ? `<div class="analysis-effects">${effects}</div>` : '') + '</div>'
      + (page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : '')
  }
  if (v === 'split2') {
    inner = (page.groups || [])
      .map(
        (g) =>
          `<div><p class="rng">${esc(g.range || '')}</p>` +
          tbl(g.columns, g.rows) +
          '</div>'
      )
      .join('')
  } else if (v === 'focus') {
    const note = page.note || {}
    inner =
      tbl(page.columns, page.rows, page.highlight) +
      `<aside class="aside">` +
      (note.index ? `<div class="ix">${esc(note.index)}${note.label ? ' / ' + esc(note.label) : ''}</div>` : '') +
      (note.title ? `<h3>${esc(note.title)}</h3>` : '') +
      (note.body ? `<p>${txt(note.body)}</p>` : '') +
      (note.en ? `<p class="en">${esc(note.en)}</p>` : '') +
      '</aside>'
  } else {
    inner = (page.caption ? `<p class="cap">${esc(page.caption)}</p>` : '') + tbl(page.columns, page.rows, page.highlight)
  }
  return `${chrome(meta, page, i, n)}
<div class="tb ${v}">${inner}</div>
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// 表格族第二批：分组、评分、热力、象限、角色
const T2_SPEC = {
  G01: 'groupband', G02: 'twins', G03: 'rating', G04: 'rank',
  H01: 'heat', H02: 'heat-twins', Q01: 'quad', Q02: 'quad-plot',
  R01: 'raci', R02: 'raci-twins',
}

const heatTable = (t) => {
  const cols = t.columns || []
  const rows = t.rows || []
  const cell = (v) =>
    typeof v === 'string' && /^h[1-4]$/.test(v) ? `<td class="${v}c"></td>` : `<td>${esc(v == null ? '' : v)}</td>`
  return (
    '<table class="heat"><thead><tr>' +
    cols.map((c) => `<th>${esc(c)}</th>`).join('') +
    '</tr></thead><tbody>' +
    rows
      .map((r) => '<tr>' + r.map((v, i) => (i === 0 ? `<th>${esc(v)}</th>` : cell(v))).join('') + '</tr>')
      .join('') +
    '</tbody></table>'
  )
}

const quadBlock = (page) => {
  const cells = (page.cells || []).map((c) => `<div class="cell">${c.title ? `<h2>${esc(c.title)}</h2>` : ''}${c.body ? `<p>${esc(c.body)}</p>` : ''}${(c.points || []).map((pt) => `<span class="point" style="left:${pt.x}%;bottom:${pt.y}%">${esc(pt.label || '')}</span>`).join('')}</div>`).join('')
  const ax = page.axis ? `<div class="ax"><span>${esc(page.axis[0] || '')}</span><span>${esc(page.axis[1] || '')}</span></div>` : ''
  return `<div><div class="axisnote">${esc(page.axisnote || '')}</div><div class="quad">${cells}</div>${ax}</div>`
}

const rowsOf = (rows, hl) =>
  (rows || [])
    .map((r, ri) =>
      r.group
        ? `<tr><td class="groupband" colspan="${r.span || 3}">${esc(r.group)}</td></tr>`
        : `<tr class="${hl != null && hl === ri + 1 ? 'hot' : ''}">` + r.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>'
    )
    .join('')

function TABLE2(id, meta, page, i, n) {
  const v = T2_SPEC[id]
  let inner = ''
  const cue = page.cue ? `<p class="cue">${esc(page.cue)}</p>` : ''
  if (v === 'groupband' || v === 'rating') {
    inner =
      cue +
      '<table>' +
      `<thead><tr>${(page.columns || []).map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` +
      `<tbody>${rowsOf(page.rows, page.highlight)}</tbody></table>`
  } else if (v === 'twins' || v === 'heat-twins' || v === 'raci-twins') {
    const blocks = page.blocks || []
    inner =
      cue +
      '<div class="twins">' +
      blocks
        .map(
          (b) =>
            `<article>${b.title ? `<h2>${esc(b.title)}</h2>` : ''}` +
            (v === 'heat-twins' ? heatTable(b) : tbl(b.columns, b.rows)) +
            '</article>'
        )
        .join('') +
      '</div>'
  } else if (v === 'rank') {
    inner =
      cue +
      '<div class="twins"><div class="stack">' +
      (page.bars || [])
        .map(
          (b) =>
            `<div class="barrow"><span>${esc(b.label)}</span><div class="track"><i style="width:${b.pct}%"></i></div><span>${esc(b.value || '')}</span></div>`
        )
        .join('') +
      `</div><div>${page.tableTitle ? `<h2>${esc(page.tableTitle)}</h2>` : ''}${tbl(page.columns, page.rows)}</div></div>`
  } else if (v === 'heat') {
    inner = cue + heatTable(page)
  } else if (v === 'quad') {
    inner = cue + quadBlock(page)
  } else if (v === 'quad-plot') {
    inner = cue + `<div class="plotbox">${quadBlock(page)}<aside>${tbl(page.columns, page.rows)}</aside></div>`
  } else if (v === 'raci') {
    inner = cue + tbl(page.columns, page.rows)
  }
  const cls = ['tb', v].filter(Boolean).join(' ')
  return `${chrome(meta, page, i, n)}
<div class="${cls}">${inner}</div>
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}`
}

// 图表族：指标 + 图 + 读法
const metricBlock = (m, big) =>
  `<article class="k">${m.label ? `<h2>${esc(m.label)}</h2>` : ''}<div class="metric"${big ? ' style="font-size:64px"' : ''}>${esc(m.value || '')}</div>${m.note ? `<p>${esc(m.note)}</p>` : ''}</article>`

const readingBlock = (page) => {
  const r = page.reading
  if (!r) return ''
  return (
    '<aside class="reading">' +
    (r.h2 ? `<h2>${esc(r.h2)}</h2>` : '<h2></h2>') +
    (r.p ? `<p>${esc(r.p)}</p>` : '<p></p>') +
    (r.small ? `<small>${esc(r.small)}</small>` : '<small></small>') +
    '</aside>'
  )
}

function CHART(id, meta, page, i, n) {
  let body = ''
  if (id === 'K01') body = `<div class="solo">${metricBlock(page.metric || {}, true)}</div>`
  else if (id === 'K02') body = `<div class="duo-chart">${metricBlock(page.metric || {}, true)}<div>${line(page.series || [], page.opts || {})}</div></div>`
  else if (id === 'K03') body = `<div class="ks">${(page.metrics || []).map((m) => metricBlock(m)).join('')}</div>`
  else if (id === 'K04')
    body = `<div class="rows">${(page.rows || [])
      .map(
        (r) =>
          `<div class="r"><h2>${esc(r.label)}</h2><span class="bar"><i style="width:${r.pct}%"></i></span><p>${esc(r.note || '')}</p></div>`
      )
      .join('')}</div>`
  else if (id === 'K05') body = barH(page.rows || [])
  else if (id === 'K06') body = dumbbell(page.rows || [], page.legend || {})
  else if (id === 'K07') body = line(page.series || [], page.opts || {})
  else if (id === 'K08') body = panels(page.panels || [])
  else if (id === 'K09') body = donut(page.items || [], page.center ? { center: page.center } : {})
  else if (id === 'K10') body = stack100(page.rows || [])
  else if (id === 'K11') body = column(page.items || [], page.opts || {})
  else if (id === 'K12') body = scatter(page.points || [], page.opts || {})
  else if (id === 'K13') body = waterfall(page.items || [])
  else if (id === 'K14') body = column(page.items || [], { zero: true, height: 320 })
  else if (id === 'K15')
    body = `<div class="duo-chart">${metricBlock(page.metric || {}, true)}<div>${line(page.series || [], { height: 260, labels: [] })}</div></div>`

  return `${chrome(meta, page, i, n)}
<div class="kc">
${page.caption ? `<p class="cap">${esc(page.caption)}</p>` : ''}
<div class="chartbody">${body}</div>
${readingBlock(page)}
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}
</div>`
}

// 流程族：图 + 读法
const FLOW_SPEC = {
  F01: 'chain', F02: 'branch', F03: 'merge', F04: 'axis', F05: 'milestones', F06: 'stairs',
  F07: 'gantt', F08: 'gantt', F09: 'lanes', F10: 'journey', F11: 'curve', F12: 'loop',
}

function FLOW(id, meta, page, i, n) {
  const kind = FLOW_SPEC[id]
  let body = ''
  if (kind === 'chain') body = chain(page.steps || [], { hl: page.hl })
  else if (kind === 'branch') body = branch(page)
  else if (kind === 'merge') body = merge(page)
  else if (kind === 'axis') body = axis(page)
  else if (kind === 'milestones') body = milestones(page)
  else if (kind === 'stairs') body = stairs(page)
  else if (kind === 'gantt') body = ganttChart(page)
  else if (kind === 'lanes') body = lanes(page)
  else if (kind === 'curve') body = curve(page)
  else if (kind === 'loop') body = loop(page)
  else if (kind === 'journey')
    body = `<table class="jc"><thead><tr>${(page.columns || []).map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(page.rows || []).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`

  return `${chrome(meta, page, i, n)}
<div class="kc flow">
${page.caption ? `<p class="cap">${esc(page.caption)}</p>` : ''}
<div class="chartbody">${body}</div>
${readingBlock(page)}
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}
</div>`
}

// 架构与关系族
const DIAG_SPEC = {
  A01: 'tree', A02: 'layers', A03: 'entry', A04: 'boundary', A05: 'pillars', A06: 'hub',
  A07: 'network', A08: 'converge', A09: 'diverge', A10: 'venn', A11: 'nested',
}

function DIAG(id, meta, page, i, n) {
  const kind = DIAG_SPEC[id]
  let body = ''
  if (kind === 'tree') body = tree(page)
  else if (kind === 'layers') body = layers(page)
  else if (kind === 'entry') body = entryModules(page)
  else if (kind === 'boundary') body = boundary(page)
  else if (kind === 'pillars') body = pillars(page)
  else if (kind === 'hub') body = hub(page)
  else if (kind === 'network') body = network(page)
  else if (kind === 'converge') body = fork(page, 'converge')
  else if (kind === 'diverge') body = fork(page, 'diverge')
  else if (kind === 'venn') body = venn(page)
  else if (kind === 'nested') body = nested(page)

  return `${chrome(meta, page, i, n)}
<div class="kc flow">
${page.caption ? `<p class="cap">${esc(page.caption)}</p>` : ''}
<div class="chartbody">${body}</div>
${readingBlock(page)}
${page.footnote ? `<div class="source-line">${esc(page.footnote)}</div>` : ''}
</div>`
}

// 封面与导航族：整版排版，不走页眉
const COVER_SPEC = {
  S01: coverLeft, S02: coverCenter, S03: coverBlock, S04: coverSplit, S05: opening, S06: toc,
  S07: chapters, S08: agenda, S09: schedule, S10: chapterDark, S11: chapterTrans,
  S12: guide, S13: thanks, S14: contact,
}

function COVER(id, page) {
  const fn = COVER_SPEC[id]
  return fn ? fn(page) : ''
}

const LAYOUTS = { M01: (meta, page, i, n, dir) => chrome(meta, page, i, n) + compose(page, dir), P01, P02, P03, P04, P05, P06, P07 }
for (const id of Object.keys(CARDS_SPEC)) LAYOUTS[id] = (m, p, i, n) => CARDS(id, m, p, i, n)
for (const id of Object.keys(TX_SPEC)) LAYOUTS[id] = (m, p, i, n) => TEXT(id, m, p, i, n)
for (const id of Object.keys(TABLE_SPEC)) LAYOUTS[id] = (m, p, i, n) => TABLE(id, m, p, i, n)
for (const id of Object.keys(T2_SPEC)) LAYOUTS[id] = (m, p, i, n) => TABLE2(id, m, p, i, n)
for (const id of ['K01','K02','K03','K04','K05','K06','K07','K08','K09','K10','K11','K12','K13','K14','K15'])
  LAYOUTS[id] = (m, p, i, n) => CHART(id, m, p, i, n)
for (const id of Object.keys(FLOW_SPEC)) LAYOUTS[id] = (m, p, i, n) => FLOW(id, m, p, i, n)
for (const id of Object.keys(DIAG_SPEC)) LAYOUTS[id] = (m, p, i, n) => DIAG(id, m, p, i, n)
for (const id of Object.keys(COVER_SPEC)) LAYOUTS[id] = (m, p, i, n) => COVER(id, p)
export { LAYOUTS }
