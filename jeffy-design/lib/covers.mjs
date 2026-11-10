// 封面与导航族。这些页没有页眉横线，整版自己排版。
const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

const metaBlock = (meta, cls = '') =>
  (meta || [])
    .map((m) => `<p class="cv-meta ${cls}"><span>${esc(m.k)}</span>${esc(m.v)}</p>`)
    .join('')

// S01 封面左对齐
export function coverLeft(p) {
  return `<div class="cv">
<div class="cv-body cv-left">
  <h1 class="cv-title">${esc(p.title)}</h1>
  ${p.subtitle ? `<p class="cv-sub">${esc(p.subtitle)}</p>` : ''}
  ${p.en ? `<p class="cv-en">${esc(p.en)}</p>` : ''}
</div>
<div class="cv-foot"><span>${esc(p.footerLeft || '')}</span><span>${esc(p.footerRight || '')}</span></div>
</div>`
}

// S02 封面居中
export function coverCenter(p) {
  return `<div class="cv">
<div class="cv-top"><span>${esc(p.eyebrow || '')}</span><span>${esc(p.topRight || '')}</span></div>
<div class="cv-body cv-center">
  <h1 class="cv-title">${esc(p.title)}</h1>
  ${p.subtitle ? `<p class="cv-sub">${esc(p.subtitle)}</p>` : ''}
  ${p.en ? `<p class="cv-en">${esc(p.en)}</p>` : ''}
</div>
<div class="cv-foot"><span>${esc(p.footerLeft || '')}</span><span>${esc(p.footerRight || '')}</span></div>
</div>`
}

// S03 封面大标题 + 右下元信息
export function coverBlock(p) {
  return `<div class="cv cv-tint">
<div class="cv-body cv-top-left">
  <h1 class="cv-title">${esc(p.title)}</h1>
</div>
<div class="cv-meta-block">
  ${p.subtitle ? `<p class="cv-sub">${esc(p.subtitle)}</p>` : ''}
  ${p.en ? `<p class="cv-en">${esc(p.en)}</p>` : ''}
  ${metaBlock(p.meta)}
</div>
</div>`
}

// S04 封面左右分
export function coverSplit(p) {
  return `<div class="cv">
<div class="cv-split">
  <div class="cv-split-l"><h1 class="cv-title">${esc(p.title)}</h1></div>
  <div class="cv-split-r">
    ${p.subtitle ? `<p class="cv-sub">${esc(p.subtitle)}</p>` : ''}
    ${p.en ? `<p class="cv-en">${esc(p.en)}</p>` : ''}
  </div>
</div>
<div class="cv-foot"><span>${esc(p.footerLeft || '')}</span><span>${esc(p.footerRight || '')}</span></div>
</div>`
}

// S05 开篇引导
export function opening(p) {
  return `<div class="cv">
<div class="cv-body cv-bottom-left">
  ${p.eyebrow ? `<p class="cv-eyebrow">${esc(p.eyebrow)}</p>` : ''}
  <h1 class="cv-title">${esc(p.title)}</h1>
  ${p.note ? `<p class="cv-note">${esc(p.note)}</p>` : ''}
</div>
</div>`
}

// S06 目录
export function toc(p) {
  const items = (p.items || [])
    .map(
      (it) => `<div class="cv-row">
<span class="cv-no">${esc(it.no)}</span>
<div><p class="cv-row-t">${esc(it.title)}</p><p class="cv-row-n">${esc(it.note || '')}</p></div>
</div>`
    )
    .join('')
  return `<div class="cv">
<div class="cv-head"><h1 class="cv-title">${esc(p.title)}</h1><div class="cv-rule"></div></div>
<div class="cv-rows">${items}</div>
</div>`
}

// S07 全篇结构（三列章节）
export function chapters(p) {
  const items = (p.items || [])
    .map(
      (it) => `<div class="cv-col">
<span class="cv-no">${esc(it.no)}</span>
<p class="cv-row-t">${esc(it.title)}</p>
<p class="cv-row-n">${esc(it.note || '')}</p>
</div>`
    )
    .join('')
  return `<div class="cv">
<div class="cv-head"><h1 class="cv-title">${esc(p.title)}</h1><div class="cv-rule"></div></div>
<div class="cv-cols">${items}</div>
</div>`
}

// S08 会议议程
export function agenda(p) {
  const items = (p.items || [])
    .map(
      (it) => `<div class="cv-row cv-agenda-row">
<span class="cv-no">${esc(it.time)}</span>
<div><p class="cv-row-t">${esc(it.title)}</p><p class="cv-row-n">${esc(it.note || '')}</p></div>
</div>`
    )
    .join('')
  return `<div class="cv">
<div class="cv-head"><h1 class="cv-title">${esc(p.title)}</h1><div class="cv-rule"></div></div>
<div class="cv-rows">${items}</div>
</div>`
}

// S09 时间分配
export function schedule(p) {
  const slots = (p.slots || [])
    .map(
      (s) =>
        `<div class="cv-slot ${s.tone || ''}" style="flex:${s.weight || 1}">` +
        `<p class="cv-slot-t">${esc(s.title)}</p><p class="cv-slot-n">${esc(s.note || '')}</p></div>`
    )
    .join('')
  return `<div class="cv">
<div class="cv-body cv-bottom-left">
  <h1 class="cv-title">${esc(p.title)}</h1>
  <div class="cv-slots">${slots}</div>
  ${p.note ? `<p class="cv-note">${esc(p.note)}</p>` : ''}
</div>
</div>`
}

// S10 章节封（深色整版）
export function chapterDark(p) {
  return `<div class="cv cv-dark">
<div class="cv-body cv-bottom-left">
  <p class="cv-eyebrow">${esc(p.eyebrow || '')}</p>
  <h1 class="cv-title cv-title-dark">${esc(p.title)}</h1>
</div>
</div>`
}

// S11 章节过渡
export function chapterTrans(p) {
  return `<div class="cv">
<div class="cv-body cv-center">
  <p class="cv-trans-no">${esc(p.no || '01')}<span class="cv-trans-sep">/</span><span class="cv-trans-all">${esc(p.total || '03')}</span></p>
  <h1 class="cv-title">${esc(p.title)}</h1>
</div>
<div class="cv-foot cv-foot-cols">
  ${(p.items || []).map((it) => `<span>${esc(it.no)} · ${esc(it.title)}</span>`).join('')}
</div>
</div>`
}

// S12 本章导读
export function guide(p) {
  const points = (p.points || [])
    .map((pt) => `<div class="cv-pt"><p class="cv-pt-t">${esc(pt.title)}</p><p class="cv-pt-n">${esc(pt.note || '')}</p></div>`)
    .join('')
  return `<div class="cv">
<div class="cv-head"><h1 class="cv-title">${esc(p.title)}</h1><div class="cv-rule"></div></div>
<div class="cv-guide">
  <div><p class="cv-eyebrow">${esc(p.eyebrow || '')}</p><h2 class="cv-q">${esc(p.question)}</h2></div>
  <div class="cv-guide-r">${points}</div>
</div>
</div>`
}

// S13 谢谢
export function thanks(p) {
  return `<div class="cv">
<div class="cv-body cv-center">
  <h1 class="cv-thanks">${esc(p.title)}</h1>
  ${p.en ? `<p class="cv-en">${esc(p.en)}</p>` : ''}
</div>
</div>`
}

// S14 交流与讨论
export function contact(p) {
  return `<div class="cv">
<div class="cv-head"><p class="cv-eyebrow">${esc(p.eyebrow || '')}</p><h1 class="cv-title">${esc(p.title)}</h1></div>
<div class="cv-contact">
  <p class="cv-q">${esc(p.question)}</p>
  ${p.note ? `<p class="cv-note cv-note-dark">${esc(p.note)}</p>` : ''}
</div>
</div>`
}
