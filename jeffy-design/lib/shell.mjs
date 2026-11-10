// 外壳：CSS、页面骨架、翻页脚本。样式只在这里改，layouts 只管结构。

const NAV = `
const slides = [...document.querySelectorAll('.slide')]
let i = 0
function show(n) {
  i = Math.max(0, Math.min(slides.length - 1, n))
  slides.forEach((s, k) => s.classList.toggle('on', k === i))
  const p = document.getElementById('pageno')
  if (p) p.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0')
  location.hash = String(i + 1)
}
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') { show(i + 1); e.preventDefault() }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { show(i - 1); e.preventDefault() }
  if (e.key === 'Home') show(0)
  if (e.key === 'End') show(slides.length - 1)
})
addEventListener('click', (e) => { if (!e.metaKey) show(i + 1) })
function fit() {
  const s = Math.min(innerWidth / 1280, innerHeight / 720) * 0.96
  document.documentElement.style.setProperty('--s', String(s))
}
addEventListener('resize', fit)
fit()
show(parseInt(location.hash.slice(1), 10) - 1 || 0)
if (new URLSearchParams(location.search).get('debug')) document.body.classList.add('debug')
`

function css(t) {
  const type = Object.fromEntries(t.scale.map(role => [role.role, role]))
  const roleStyle = name => {
    const r = type[name]
    return `font-size:${r.size}px;line-height:${r.lineHeight};font-weight:${r.weight};letter-spacing:${r.tracking === 0 ? '0' : r.tracking}`
  }
  return `
*{box-sizing:border-box}
:root{
  --divider-width:${t.rules.dividerWidthPx}px;
  --ink:#${t.colors.ink};--body:#${t.colors.body};--muted:#${t.colors.muted};
  --line:#${t.colors.line};--soft:#${t.colors.soft};--accent:#${t.colors.accent};
  --accent2:#${t.colors.accent2};--paper:#${t.colors.paper};--inverse:#${t.colors.inverse};
  --title:${'#' + t.colors.accent};--bgword:#F4F4F4;
  --f-title:"${t.fonts.latin}","${t.fonts.ea}","Source Han Serif SC","Songti SC","SimSun",serif;
  --f-body:"${t.fonts.latin}","${t.fonts.ea}","Source Han Serif SC","Songti SC","SimSun",serif;
}
html,body{margin:0}
body{
  background:#ECECEC;color:var(--body);
  font-family:var(--f-body);
  display:grid;place-items:center;min-height:100vh;cursor:pointer;
  -webkit-font-smoothing:antialiased;
}
#wrap{width:calc(1280px * var(--s,1));height:calc(720px * var(--s,1))}
#stage{width:1280px;height:720px;transform:scale(var(--s,1));transform-origin:top left;background:var(--paper)}
.slide{position:absolute;inset:0;display:none;overflow:hidden;background:var(--paper)}
.slide.on{display:flex;flex-direction:column;padding:72px 80px 40px}
.head{border-bottom:${t.rules.headerWidthPx}px solid var(--ink);padding-bottom:${t.rules.headerGapPx}px;flex:none}

/* 页眉页脚 */
.analysis-table{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-evenly;gap:12px}.analysis-table header{display:flex;align-items:baseline;justify-content:space-between;background:#f4f1ec;padding:12px 18px}.analysis-table header b{color:#99432f;font-size:20px}.analysis-table header span{font-size:16px}.analysis-table table{width:100%;border-collapse:collapse;font-size:16px;line-height:1.5}.analysis-table th,.analysis-table td{text-align:left;padding:10px 12px;border-bottom:1px solid #dfdbd5}.analysis-table th{color:#33566b;background:#f3f5f4}.analysis-table td:first-child{white-space:nowrap;font-weight:600}.analysis-effects{display:grid;grid-template-columns:1fr 1fr;gap:24px}.analysis-effects article{border-top:2px solid #33566b;padding:10px 0}.analysis-effects b{font-size:20px}.analysis-effects p{font-size:16px;line-height:1.55;margin:5px 0 0}
.kicker{display:none}
.title{margin:0;${roleStyle('title')};color:var(--ink);font-family:var(--f-title)}

.slide[data-layout="M01"] p{${roleStyle('body')};margin:${t.paragraph.beforePx}px 0 ${t.paragraph.afterPx}px}
.slide[data-layout="M01"] strong{${roleStyle('cardTitle')}}
.slide[data-layout="M01"] .foot{${roleStyle('source')}}
.foothr{display:none}
.bgword{position:absolute;left:-30px;top:150px;font-size:280px;font-weight:800;line-height:.8;color:var(--bgword);
  letter-spacing:-10px;pointer-events:none;user-select:none}
.foot{display:none}
.pageno{position:absolute;right:80px;bottom:16px;${roleStyle('pageNo')};color:var(--muted);font-variant-numeric:tabular-nums}

/* 封面 */
.cover{position:absolute;inset:0}
.cover-kicker{position:absolute;left:0;top:150px;width:1280px;text-align:center;font-size:13px;color:var(--muted);letter-spacing:3px}
.cover-title{position:absolute;left:120px;top:196px;width:1040px;margin:0;text-align:center;font-size:58px;line-height:1.22;font-weight:700;color:var(--ink)}
.cover-sub{position:absolute;left:120px;margin:0;width:1040px;text-align:center;font-size:18px;color:var(--body)}
.cover-meta{position:absolute;left:0;width:1280px;text-align:center;font-size:15px;line-height:2.1;color:var(--body)}



/* 章节页 */
.chapter{position:absolute;inset:0;background:var(--inverse)}
.ch-no{position:absolute;left:68px;top:120px;font-size:130px;line-height:1;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}
.ch-title{position:absolute;left:68px;top:352px;width:960px;margin:0;font-size:46px;line-height:1.22;font-weight:700;color:var(--paper)}
.ch-lead{position:absolute;left:68px;top:470px;margin:0;font-size:17px;color:#B0B0B0}
.chapter .pageno,.chapter .foot{color:#B0B0B0}

/* 卡片 */
.cards{position:absolute;left:44px;top:118px;width:1192px;display:flex;gap:16px}
.card{position:relative;flex:1;background:var(--paper);border:1px solid var(--line);padding:32px;display:flex;flex-direction:column}
.cards.grid2{flex-wrap:wrap;align-content:space-between}
.cards.grid2 .card{flex:0 0 calc(50% - 11.5px);height:calc(50% - 11.5px)}
.card .icon{color:var(--body);margin-bottom:16px}
.card h3{margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:500;color:var(--ink)}
.card p.card-body{margin:0;font-size:17px;line-height:1.55;color:var(--body)}
.card .no{position:absolute;right:28px;top:26px;font-size:14px;letter-spacing:2px;color:var(--accent);font-variant-numeric:tabular-nums}
.card .metric{margin-top:auto;padding-top:18px;border-top:1px solid var(--line);font-size:35px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.1}
.card .metric.hl{color:var(--accent)}
.card .mlabel{margin:10px 0 0;font-size:12px;color:var(--muted)}

/* 结论条 */
.take{position:absolute;left:68px;top:600px;width:1144px;border-top:1px solid var(--line);padding-top:14px;font-size:17px;line-height:1.5;color:var(--body)}
.take .hl{color:var(--accent)}

/* 数据页 */
.stat .num{font-size:48px;line-height:1.05;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:-.5px}
.stat .num.hl{color:var(--accent)}
.stat .lab{margin:8px 0 0;font-size:14px;color:var(--body)}
.stat .note{margin:4px 0 0;font-size:12px;line-height:1.5;color:var(--muted)}
.figure .cap{font-size:14px;color:var(--muted);margin:0 0 14px}
.stack{display:flex;height:72px;width:100%}
.seg{height:100%}
.legend{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:14px;font-size:12px;color:var(--body)}
.legend i{display:inline-block;width:9px;height:9px;margin-right:6px;vertical-align:1px}
.reading p{margin:0 0 12px}
.source-line{flex:none;border-top:1px solid var(--line);padding-top:10px;font-size:11px;color:var(--muted);font-family:var(--f-body)}

/* 来源页 */
.srcs{position:absolute;left:68px;top:128px;width:1144px;display:flex;gap:38px}
.srcs .col{flex:1}
.src{margin:0 0 11px;font-size:12px;line-height:1.5;color:var(--body)}
.src b{color:var(--accent);font-weight:400;letter-spacing:.5px}
.src span{color:var(--muted)}

.ending{position:absolute;left:150px;top:270px;margin:0;font-size:76px;line-height:1.1;font-weight:400;
  color:var(--ink);font-family:Georgia,"Songti SC","Noto Serif SC",serif}
.ending-sub{position:absolute;left:154px;top:392px;margin:0;font-size:17px;color:var(--body)}

/* 红头卡片 */
.card.bar{padding:0;overflow:hidden}
.card-head{background:var(--accent);color:#fff;font-size:17px;font-weight:600;text-align:center;
  padding:12px 16px;letter-spacing:1.5px}
.card-inner{padding:24px;display:flex;flex-direction:column;gap:20px;flex:1}
.hl{color:var(--accent)}

/* 观点页：尺度和留白撑画面 */
.p02-kicker{position:absolute;left:96px;top:92px;font-size:13px;letter-spacing:3px;color:var(--muted)}
.p02-title{position:absolute;left:92px;top:146px;width:1010px;margin:0;font-size:66px;line-height:1.18;
  font-weight:300;color:var(--ink);letter-spacing:-1px}
.p02-lead{position:absolute;left:96px;top:424px;width:600px;margin:0;font-size:18px;line-height:1.8;color:var(--body)}
.p02-hero{position:absolute;right:96px;top:372px;text-align:right}
.p02-hero .num{display:block;font-size:150px;font-weight:200;color:var(--accent);line-height:.88;letter-spacing:-8px}
.p02-hero .lab{display:block;margin-top:18px;font-size:13px;color:var(--muted);letter-spacing:3px}
.p02-src{position:absolute;left:96px;top:648px;font-size:11px;color:var(--muted);letter-spacing:.5px}
.p02-rule{position:absolute;left:96px;top:372px;width:120px;height:1px;background:var(--ink);opacity:.5}

/* 分带页：区域可增删，空间按权重重新分配 */
.bands{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-start;gap:36px;padding-top:38px;margin-bottom:8px}
.band.modules{flex:1 1 auto;min-height:0}
.band.modules .b-mods{height:100%}
.band.modules .b-mod{height:100%}
.band{display:flex;flex-direction:column;overflow:hidden;min-height:0;flex:0 0 auto}
.band .bt{font-size:11px;font-weight:500;color:var(--muted);margin:0 0 14px;letter-spacing:2.5px;font-family:var(--f-title)}
.band .bd{font-size:17px;line-height:1.85;color:var(--body);margin:0;max-width:860px;font-family:var(--f-body)}
.b-mods{display:flex;gap:64px;flex:1;min-height:0}
.b-mod{flex:1;border-top:1px solid var(--ink);padding-top:18px;display:flex;flex-direction:column;overflow:hidden}
.b-mod .idx,.p03-col .idx{font-size:38px;font-weight:200;color:var(--accent);line-height:1;letter-spacing:-1px;margin-bottom:14px;font-variant-numeric:tabular-nums}
.b-mod .mt,.p03-col .mt{font-family:var(--f-title);font-size:20px;font-weight:600;color:var(--ink);margin:0 0 10px;letter-spacing:.2px}
.b-mod .mb,.p03-col .mb{font-size:16px;line-height:1.9;color:var(--body);margin:0;font-family:var(--f-body)}
.b-mod .me,.p03-col .me{margin:6px 0 0;font-size:12.5px;line-height:1.7;color:var(--muted);font-family:"Georgia","Noto Serif SC",serif;letter-spacing:.1px}
.b-mod.hi .me{color:rgba(255,255,255,.62)}
.b-mod.hi{background:var(--accent);border-top-color:var(--accent);padding:18px 26px 24px;display:flex;flex-direction:column;justify-content:flex-start}
.b-mod.hi .idx{color:rgba(255,255,255,.5)}
.b-mod.hi .mt{color:var(--paper)}
.b-mod.hi .mb{color:rgba(255,255,255,.88)}
.b-mod.hi .hl{color:#fff;font-weight:600}
.b-mod.hi.soft{background:rgba(180,85,60,.075);border-top-color:var(--accent);border-left:2px solid var(--accent);
  padding:18px 24px 24px}
.b-mod.hi.soft .idx{color:var(--accent)}
.b-mod.hi.soft .mt{color:var(--ink)}
.b-mod.hi.soft .mb{color:var(--body)}
.b-mod.hi.soft .hl{color:var(--accent);font-weight:400}
.b-base{display:flex;align-items:center;gap:30px;flex:1;flex-wrap:wrap}
.pill{font-size:14.5px;color:var(--body);letter-spacing:.3px;font-family:var(--f-body)}
.band.base{background:var(--soft);padding:16px 20px}


/* P03 三栏分隔 */
.p03-col .idx{font-size:46px}
.p03-col .mt{font-size:23px;margin-bottom:14px}
.p03-col .mb{font-size:18px;line-height:1.95}
.p03-col .me{font-size:13.5px;margin-top:10px}
.p03-con{font-size:22px}
.p03-with-rail{flex:1;min-height:0;display:grid;grid-template-columns:1fr 186px;gap:34px;padding-top:40px}
.p03-with-rail .p03-cols{flex:1;min-height:0;display:flex;padding-top:0}
.p03-rail{border-left:1px solid var(--line);padding-left:24px;display:flex;align-items:center}
.p03-rail p{margin:0;font-family:var(--f-body)}
.p03-rail-h{font-size:12.5px;line-height:1.6;color:var(--ink);letter-spacing:.4px;margin-bottom:10px!important}
.p03-rail-b{font-size:13px;line-height:1.9;color:var(--body)}
.p03-cols{flex:1;min-height:0;display:flex;padding-top:40px}
.p03-col{flex:1;padding:0 34px;border-right:1px solid var(--line);min-width:0;display:flex;flex-direction:column;justify-content:flex-start}
.p03-col:first-child{padding-left:0}
.p03-col:last-child{border-right:0;padding-right:0}
.p03-con{flex:none;margin-top:30px;border-top:1px solid var(--ink);padding-top:16px;
  font-size:20px;line-height:1.65;color:var(--ink);font-family:var(--f-title)}
.p03-con .hl{color:var(--accent)}

/* 对称双栏 */
.duo{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:64px;margin-top:38px}
.duo-col{position:relative;min-width:0;display:flex;flex-direction:column}
.duo-col + .duo-col::before{content:'';position:absolute;left:-32px;top:30px;bottom:0;width:1px;background:#C9C1B8}
.duo .mt{font-family:var(--f-title);font-size:16px;line-height:1.3;font-weight:600;letter-spacing:.2px;color:var(--ink);margin:0}
.duo .mb{font-family:var(--f-body);font-size:16px;line-height:1.9;color:var(--body);margin:16px 0 0}
.duo .me{font-family:var(--f-title);font-size:12.5px;line-height:1.7;color:var(--muted);margin:3px 0 0;letter-spacing:.1px}
.duo .row{padding:10px 0;border-bottom:1px solid var(--line)}
.duo .row:last-child{border-bottom:0}
.duo .row .mb,.duo .row .me{margin-top:3px}
.duo .row .mb{margin-top:6px}
.duo .pa{padding-top:40px}
.duo .pb{padding-top:8px}
.duo .pc{padding-top:0}
.duo-fig{height:200px;background:var(--soft);border:1px solid var(--line);display:grid;place-content:center;
  color:var(--muted);font-size:16px;margin:0 0 18px;font-family:var(--f-body)}
.duo .panel{flex:1;background:var(--soft);text-align:center;padding:34px 16px 30px;display:flex;flex-direction:column;
  align-items:center;justify-content:center}
.duo .panel .mt,.duo .panel .mb{font-size:16px}
.duo .panel .num{font-family:var(--f-title);font-size:48px;line-height:1.18;font-weight:300;color:var(--accent);
  letter-spacing:-1.2px;margin:20px 0;font-variant-numeric:tabular-nums}
.duo .panel .me{margin-top:22px}

/* 卡片族：主次双栏 / 多栏 / 四宫格 / 多卡网格 / 主卡＋辅卡 */
.cp{flex:1;min-height:0;display:grid;gap:14px}
.cp .hero,.cp .item{padding:16px 22px;display:flex;flex-direction:column;justify-content:center;min-width:0;overflow:hidden}
.cp .hero{background:var(--soft);border-left:3px solid var(--accent);padding:36px}
.cp .big{font-family:var(--f-title);font-size:48px;line-height:1.18;font-weight:300;color:var(--accent);
  margin-bottom:12px;font-variant-numeric:tabular-nums}
.cp .rail{display:grid;gap:8px}
.cp .rail .item,.cp .cols .item{border-top:1px solid #B9B4AD}
.cp .grid .item{background:var(--soft)}
.cp .idx{display:block;font-family:var(--f-title);font-size:12.5px;line-height:1.7;color:var(--accent);margin-bottom:9px}
.cp h2{font-family:var(--f-title);font-size:16px;font-weight:600;line-height:1.3;margin:0 0 9px;color:var(--ink)}
.cp p{margin:0}
.cp p{font-family:var(--f-body);font-size:16px;line-height:1.9;color:var(--body);margin:0}
.cp .en{font-family:var(--f-title);font-size:12.5px;line-height:1.7;color:var(--muted);margin-top:3px}
.cp.g0{grid-template-columns:1.65fr 1fr}
.cp.v1.g0,.cp.v2.g0{grid-template-columns:1fr 1.65fr}
.cp.v1.g0 .hero,.cp.v2.g0 .hero{order:2}
.cp.v2 .hero{background:var(--accent2);border-left:0}
.cp.v2 .hero *{color:#fff}
.cp.v3.g0 .hero{background:none;border-top:2px solid var(--accent);border-left:0}
.cp .cols .item{justify-content:flex-start;padding-top:44px}
.cp.cols.v1 .item{background:var(--soft)}
.cp.cols.v2 .item{justify-content:center}
.cp.cols.v3 .item{border-top:3px solid var(--accent);background:var(--soft)}
.cp.g2{grid-template-columns:repeat(2,1fr)}
.cp.g2.v0 .item,.cp.g3.v1 .item{background:var(--paper);border:1px solid var(--line)}
.cp.g2.v2 .item,.cp.g3.v2 .item{background:none;border-top:1px solid #AAA}
.cp.g2.v3{gap:2px;background:var(--paper)}
.cp.g2.v3 .item{background:var(--soft)}
.cp.g2.v3 .item:first-child{background:rgba(180,85,60,.16)}
.cp.g3.v3 .item:nth-child(n+4){border-left:3px solid var(--accent2)}
.cp.g3.v3 .item:nth-child(-n+3){border-left:3px solid var(--accent)}
.cp.g4 .hero{background:var(--accent2);border:0}
.cp.g4 .hero *{color:#fff}
.cp.g4.v0,.cp.g4.v2{grid-template-columns:repeat(3,1fr);grid-template-rows:1.1fr 1fr}
.cp.g4.v0 .hero,.cp.g4.v2 .hero{grid-column:1/-1}
.cp.g4.v2{grid-template-columns:1fr 1fr}
.cp.g4.v1,.cp.g4.v3{grid-template-columns:1.55fr 1fr}
.cp.g4.v1 .hero{grid-row:span 2}
.cp.g4.v3 .hero{grid-row:span 3}
.cp.g4 .item{background:var(--soft)}
.cp.g4.v2 .hero{background:var(--accent)}

/* 标题与正文族 */
.tx{flex:1;min-height:0;display:grid;align-content:center;gap:18px}
.tx article{min-width:0}
.tx h2{font-family:var(--f-title);font-size:16px;font-weight:600;line-height:1.3;margin:0 0 8px;color:var(--ink)}
.tx p{font-family:var(--f-body);font-size:16px;line-height:1.9;color:var(--body);margin:0}
.tx .en{font-family:var(--f-title);font-size:12.5px;line-height:1.7;color:var(--muted);margin-top:3px}
.tx .heroText{font-family:var(--f-title);font-size:72px;font-weight:300;letter-spacing:-1.6px;line-height:1.14;color:var(--ink)}
.tx .tag{display:block;font-family:var(--f-title);font-size:12.5px;line-height:1.7;color:var(--accent);margin-bottom:8px}
.tx .quote{font-family:var(--f-title);font-size:48px;line-height:1;color:var(--accent)}
.tx.center{text-align:center}
.tx.center article{max-width:810px;justify-self:center}
.tx .tint{background:var(--soft);padding:30px}
.tx .tint-wrap{background:var(--soft);padding:34px 36px}
.tx .tint-wrap .quote{font-size:72px;line-height:.5;display:block;margin-bottom:18px}
.tx .tint-wrap p:not(.en){font-size:30px;line-height:1.55;letter-spacing:-.3px;color:var(--ink)}
.tx .line{border-left:3px solid var(--accent);padding-left:24px}
.tx .row{display:grid;grid-template-columns:160px 1fr;gap:24px;border-top:1px solid var(--line);padding-top:14px}
.tx.two,.tx.three{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:42px}
.tx.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.tx .wide{grid-column:1/-1}
.tx.side{grid-template-columns:2fr 1fr}
.tx .dark{background:var(--accent2);padding:26px}
.tx .dark *{color:#fff}
.tx .article{border-top:1px solid #B9B4AD;padding-top:18px}
.tx .reading{background:var(--soft);padding:56px;display:flex;flex-direction:column;justify-content:center}
.tx .reading h2{font-size:18px;margin-bottom:14px}
.tx .reading p{font-size:26px;line-height:1.9;max-width:920px}
.tx .reading .en{font-size:13px;margin-top:10px}
.tx.fill{align-content:stretch}
.tx.dual{align-content:center}
.tx.dual article{border-top:1px solid var(--ink);padding-top:20px}
.tx.dual h2{font-size:13px;font-weight:500;color:var(--muted);letter-spacing:1.5px;margin-bottom:14px}
.tx.dual .tag{font-size:12.5px;margin-bottom:10px}
.tx.dual article > p:not(.en){font-size:32px;line-height:1.65;letter-spacing:-.2px;color:var(--ink)}
.tx.dual .en{font-size:12.5px;margin-top:10px}
.tx.side article{align-self:center}
.tx.side .tint-wrap,.tx.side .tint{display:flex;flex-direction:column;justify-content:center;padding:44px 46px}
.tx.side .tint p:not(.en){font-size:24px;line-height:1.75}
.tx.side .tint-wrap p:not(.en){font-size:24px;line-height:1.75}
.tx.side .quote{font-size:64px}
.tx.quote-page{align-content:stretch;grid-template-rows:1fr auto}
.tx.quote-page article:first-child{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.tx.quote-page .quote{font-size:96px;line-height:.55;margin-bottom:26px;color:var(--accent)}
.tx.quote-page article:first-child p:not(.en){font-size:40px;line-height:1.45;letter-spacing:-.5px;color:var(--ink);max-width:900px}
.tx.quote-page article:first-child .en{font-size:13px;margin-top:12px}
.tx.quote-page article:last-child{border-top:1px solid var(--line);padding-top:18px;margin-top:28px;text-align:center}
.tx.quote-page article:last-child h2{font-size:14px;margin-bottom:4px}
.tx.quote-page article:last-child p{font-size:14px}
.tx.quote-page article:last-child .en{font-size:12px}
.tx.steps{align-content:space-evenly}

/* 表格族 */
.tb{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-start;gap:14px}
.tb table{width:100%;border-collapse:collapse;font-family:var(--f-body);font-size:16px;color:var(--body);
  font-variant-numeric:tabular-nums}
.tb th,.tb td{text-align:left;padding:10px 15px;border-bottom:1px solid var(--line);line-height:1.4}
.tb th{font-family:var(--f-title);font-weight:600;color:var(--ink);background:var(--soft)}
.tb thead{border-top:1px solid var(--ink)}
.tb caption{text-align:left;padding:0 0 14px;color:var(--muted);font-size:12.5px;font-family:var(--f-title)}
.tb.matrix table,.tb.std table{height:100%}
.tb.matrix td,.tb.matrix th{height:52px}
.tb.split2{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-content:center;align-items:start}
.tb.split2 > div{display:flex;flex-direction:column;min-height:0}
.tb.split2 table{font-size:15px}
.tb.split2 td,.tb.split2 th{height:56px}
.tb.split2 th,.tb.split2 td{padding:12px 8px}
.tb .rng{font-family:var(--f-title);font-size:15px;font-weight:600;margin:0 0 14px;color:var(--ink)}
.tb.turn td,.tb.turn th{padding:13px 4px;text-align:center;white-space:nowrap}
.tb.turn td:first-child{background:var(--soft)}
.tb.turn table{font-size:14.5px;height:100%}
.tb.focus{display:grid;grid-template-columns:3fr 1fr;gap:22px;align-content:stretch;align-items:start}
.tb.focus table{font-size:15px}
.tb.focus th,.tb.focus td{padding:10px 10px}
.tb.focus table{height:100%}
.tb.focus tbody tr.hot td{background:color-mix(in srgb, var(--accent) 16%, var(--paper));color:var(--body)}
.tb.focus tbody tr.hot td:first-child{color:var(--accent)}
.tb .aside{background:var(--soft);border-top:3px solid var(--accent);padding:22px;align-self:stretch}
.tb .aside .ix{font-family:var(--f-title);font-size:12.5px;color:var(--accent);letter-spacing:1px;margin-bottom:10px}
.tb .aside h3{font-family:var(--f-title);font-size:16px;font-weight:600;margin:0 0 12px;color:var(--ink)}
.tb .aside p{font-size:15px;line-height:1.9;color:var(--body);margin:0}
.tb .aside .en{font-size:12.5px;color:var(--muted);margin-top:10px;line-height:1.7}

/* 表格族扩展：分组、评分、热力、象限、角色 */
.tb .cue{color:var(--muted);font-size:12.5px;margin:0 0 12px;font-family:var(--f-title)}
.tb .groupband{background:color-mix(in srgb, var(--ink) 7%, var(--paper));font-family:var(--f-title);font-weight:600;color:var(--ink)}
.tb .twins{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:stretch}
.tb.rank .twins{align-items:start}
.tb.rank,.tb.quad,.tb.quad-plot{justify-content:center}
.tb.groupband table,.tb.rating table,.tb.raci table{height:100%}
.tb .twins article{display:flex;flex-direction:column}
.tb .twins article table{flex:1}
.tb .twins article{min-width:0}
.tb .twins h2{font-family:var(--f-title);font-size:16px;font-weight:600;margin:0 0 12px;color:var(--ink)}
.tb .stack{display:grid;gap:8px;align-content:center}
.tb .barrow{display:grid;grid-template-columns:96px 1fr 64px;align-items:center;gap:14px;font-size:13.5px}
.tb .track{background:color-mix(in srgb, var(--ink) 6%, var(--paper));height:10px}
.tb .track i{display:block;height:100%;background:var(--accent)}
.tb table.heat{flex:1}
.tb .heat td,.tb .heat th{text-align:center}
.tb .heat th:first-child{text-align:left}
.tb .h1c{background:color-mix(in srgb, var(--accent) 13%, var(--paper))}
.tb .h2c{background:color-mix(in srgb, var(--accent) 32%, var(--paper))}
.tb .h3c{background:color-mix(in srgb, var(--accent) 56%, var(--paper))}
.tb .h4c{background:color-mix(in srgb, var(--accent) 80%, var(--ink));color:#fff}
.tb .quad{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3px;background:#fff;height:300px}
.tb .cell{background:#F3EFEA;padding:20px;position:relative}
.tb .cell:first-child{background:color-mix(in srgb, var(--accent) 18%, var(--paper))}
.tb .cell h2{font-family:var(--f-title);font-size:16px;font-weight:600;margin:0 0 8px;color:var(--ink)}
.tb .cell p{font-size:14px;line-height:1.8;color:var(--body);margin:0}
.tb .point{position:absolute;color:var(--accent);font-size:15px;transform:translate(-50%,50%);white-space:nowrap}
.tb .ax{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);margin-top:6px}
.tb .axisnote{font-size:12.5px;color:var(--muted);margin-bottom:8px}
.tb .plotbox{display:grid;grid-template-columns:2fr 1fr;gap:28px;align-items:start}
.tb .plotbox aside table{font-size:14px}

/* 图表族 */
.kc{position:static;flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding:12px 0 4px}
.kc .cap{font-family:var(--f-title);font-size:12.5px;color:var(--muted);margin:0}
.kc .chartbody{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:10px}
.kc svg{max-height:100%}
.kc .metric{font-family:var(--f-title);font-size:56px;line-height:1.1;color:var(--accent);font-variant-numeric:tabular-nums}
.kc .k{border-left:2px solid var(--accent);padding:12px 20px}
.kc .k h2{font-family:var(--f-title);font-size:13px;font-weight:600;margin:0 0 8px;color:var(--muted);letter-spacing:.5px}
.kc .k p{font-size:13px;color:var(--muted);margin:8px 0 0}
.kc .ks{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.kc .rows{display:grid;gap:6px}
.kc .r{display:grid;grid-template-columns:180px 1fr 200px;align-items:center;gap:16px;border-bottom:1px solid var(--line);padding:12px 0}
.kc .r h2{font-family:var(--f-title);font-size:15px;font-weight:600;margin:0}
.kc .bar{display:block;background:color-mix(in srgb, var(--ink) 6%, var(--paper));height:10px}
.kc .bar i{display:block;height:100%;background:var(--accent2)}
.kc .r p{margin:0;font-size:13px;color:var(--muted);text-align:right}
.kc .reading{background:var(--soft);border-left:2px solid var(--accent);padding:10px 18px;min-height:64px;
  display:grid;grid-template-columns:100px 1fr;gap:1px 12px;align-content:center;align-items:center}
.kc .reading h2{grid-row:span 2;font-family:var(--f-title);font-size:13px;font-weight:600;margin:0;color:var(--ink)}
.kc .reading p{margin:0;font-size:13.5px;color:var(--body)}
.kc .reading small{font-size:12px;color:var(--muted)}
.kc .source-line{flex:none;margin-top:4px}
.kc .duo-chart{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center}
.kc .solo{flex:1;display:flex;align-items:center;justify-content:center}
.kc .solo .k{border-left:3px solid var(--accent);padding:6px 0 6px 36px}
.kc .solo .metric{font-size:132px;line-height:1}
.kc .solo .k h2{font-size:15px;margin-bottom:14px}
.kc .solo .k p{font-size:15px;margin-top:16px}

.kc .panels{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;align-items:end}
.kc .panels svg{width:100%;height:auto}
.kc .ptitle{text-align:center;font-family:var(--f-title);font-size:12.5px;color:var(--muted);margin:8px 0 0}

.kc.flow svg{max-height:100%}
.kc table.jc{width:100%;border-collapse:collapse;font-size:14px}
.kc table.jc th{background:var(--soft);font-family:var(--f-title);font-weight:600;text-align:left;padding:10px 14px;border-bottom:1px solid var(--ink)}
.kc table.jc td{padding:10px 14px;border-bottom:1px solid var(--line);color:var(--body)}

.cv{position:absolute;inset:0;padding:72px 80px 44px;display:flex;flex-direction:column;background:var(--paper)}
.cv-tint{background:var(--soft)}
.cv-dark{background:var(--accent2)}
.cv-body{flex:1;display:flex;flex-direction:column;justify-content:center}
.cv-left{align-items:flex-start;text-align:left}
.cv-center{align-items:center;text-align:center}
.cv-top-left{justify-content:flex-start;padding-top:40px}
.cv-bottom-left{justify-content:flex-end;padding-bottom:24px}
.cv-title{font-family:var(--f-title);font-size:62px;line-height:1.16;font-weight:400;letter-spacing:-1px;margin:0;color:var(--ink)}
.cv-center .cv-title{max-width:900px}
.cv-sub{font-size:18px;color:var(--body);margin:18px 0 0;line-height:1.7}
.cv-en{font-family:var(--f-title);font-size:12.5px;color:var(--muted);margin:8px 0 0;letter-spacing:.3px}
.cv-eyebrow{font-family:var(--f-title);font-size:12px;color:var(--muted);letter-spacing:1.5px;margin:0 0 16px}
.cv-note{font-size:15px;color:var(--muted);margin:18px 0 0;max-width:760px;line-height:1.8}
.cv-top{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);letter-spacing:1px}
.cv-foot{display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:10px;font-size:11px;color:var(--muted)}
.cv-meta-block{position:absolute;right:80px;bottom:110px;text-align:right}
.cv-meta{font-family:var(--f-title);font-size:12.5px;color:var(--muted);margin:5px 0}
.cv-meta span{display:inline-block;min-width:52px}
.cv-split{flex:1;display:grid;grid-template-columns:1.25fr 1fr;align-items:center;gap:56px}
.cv-split-r{border-left:1px solid var(--line);padding-left:40px}
.cv-rule{height:1px;background:var(--ink);margin-top:22px}
.cv-rows{flex:1;display:flex;flex-direction:column;justify-content:center}
.cv-row{display:grid;grid-template-columns:76px 1fr;gap:20px;border-top:1px solid var(--line);padding:16px 0}
.cv-no{font-family:var(--f-title);font-size:12.5px;color:var(--accent);letter-spacing:1px}
.cv-row-t{font-size:17px;margin:0;color:var(--ink)}
.cv-row-n{font-size:13px;color:var(--muted);margin:6px 0 0}
.cv-cols{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:40px;align-content:center}
.cv-col{border-top:1px solid var(--line);padding-top:18px}
.cv-slots{display:flex;margin-top:32px}
.cv-slot{padding:22px 26px;min-height:118px}
.cv-slot.tone-a{background:color-mix(in srgb,var(--accent2) 14%,var(--paper))}
.cv-slot.tone-b{background:color-mix(in srgb,var(--accent) 16%,var(--paper))}
.cv-slot.tone-c{background:var(--soft)}
.cv-slot-t{font-size:15px;margin:0;color:var(--ink)}
.cv-slot-n{font-size:12.5px;color:var(--muted);margin:6px 0 0}
.cv-dark .cv-title,.cv-dark .cv-eyebrow{color:#fff}
.cv-dark .cv-eyebrow{color:rgba(255,255,255,.72)}
.cv-trans-no{font-family:var(--f-title);font-size:34px;color:var(--accent);margin:0 0 16px}
.cv-trans-sep{opacity:.45;margin:0 10px}
.cv-trans-all{opacity:.45}
.cv-foot-cols{justify-content:flex-start;gap:32px}
.cv-guide{flex:1;display:grid;grid-template-columns:1.1fr 1fr;gap:48px;align-content:center}
.cv-guide-r{border-left:1px solid var(--line);padding-left:32px}
.cv-q{font-family:var(--f-title);font-size:30px;line-height:1.42;margin:0;color:var(--ink)}
.cv-pt{margin-bottom:16px}
.cv-pt-t{font-size:14px;margin:0;color:var(--ink);font-weight:600}
.cv-pt-n{font-size:13px;color:var(--muted);margin:5px 0 0}
.cv-thanks{font-family:Georgia,var(--f-title);font-size:64px;color:var(--ink);margin:0}
.cv-contact{flex:1;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:40px}
.cv-contact .cv-q{font-size:26px}

/* 调试：标出溢出 */
body.debug .card p.card-body,body.debug .title,body.debug .src,body.debug .reading{outline:1px dashed rgba(255,0,0,.45)}
body.debug .over{outline:2px solid red !important}


.fnode{position:absolute;border:1px solid var(--line);background:var(--paper);padding:14px 16px;overflow:hidden;box-sizing:border-box}
.fnode .ft{font-size:15px;font-weight:600;color:var(--ink);line-height:1.35;margin-bottom:6px}
.fnode .fb{font-size:12.5px;line-height:1.5;color:var(--body)}
.fnode.start{border-left:3px solid var(--accent)}
.fnode.decision{border-color:var(--accent);background:var(--soft)}
.fnode.exit{background:var(--soft)}
.fnode.pass{border-color:var(--ink);border-width:1px}
.flabel{position:absolute;font-size:11px;color:var(--muted);background:var(--paper);padding:0 5px;z-index:2}

@media print{
  @page{size:1280px 720px;margin:0}
  body{background:#fff;display:block}
  #wrap{width:1280px;height:auto}
  #stage{transform:none}
  .slide{display:block!important;position:relative;page-break-after:always;break-after:page}
  .pageno{display:none}
}
`
}

export function page(theme, slides, meta) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${meta.title || 'Deck'}</title>
<style>${css(theme)}</style>
</head>
<body>
<div id="wrap"><div id="stage">
${slides}
</div></div>
<div id="pageno" style="position:fixed;right:16px;bottom:12px;font:12px/1 sans-serif;color:#999;display:none"></div>
<script>${NAV}</script>
</body>
</html>`
}
