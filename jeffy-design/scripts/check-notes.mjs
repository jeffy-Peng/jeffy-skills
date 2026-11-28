// 讲稿与画面数字比对。用真实渲染出来的文字，不用输入数据，避免坐标和原始数组干扰。
// 用法 node scripts/check-notes.mjs deck.json out.html [notes.md]
import { readFileSync } from 'node:fs';
import { withBrowser, openDeckPage } from '../lib/browser.mjs';

const [deckPath, htmlArg, notesArg] = process.argv.slice(2);
if (!deckPath || !htmlArg) throw Error('用法 node scripts/check-notes.mjs deck.json out.html [notes.md]');
const deck = JSON.parse(readFileSync(deckPath, 'utf8'));
const notesPath = notesArg || htmlArg.replace(/\.html?$/i, '.notes.md');
const notes = readFileSync(notesPath, 'utf8');

// 讲稿常把数字写成汉字（一百五十、百分之二十四、五成），先折算成阿拉伯数字再比。
const DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNITS = { 十: 10, 百: 100, 千: 1000 };
function cnNumber(text) {
  let total = 0,
    section = 0,
    number = 0;
  for (const ch of text) {
    if (ch in DIGITS) number = DIGITS[ch];
    else if (ch in UNITS) {
      section += (number || 1) * UNITS[ch];
      number = 0;
    } else if (ch === '万') {
      total += (section + number) * 10000;
      section = 0;
      number = 0;
    } else if (ch === '亿') {
      total = (total + section + number) * 1e8;
      section = 0;
      number = 0;
    }
  }
  return total + section + number;
}
function normalizeChineseNumbers(text) {
  return String(text)
    .replace(/百分之([零〇一二两三四五六七八九十百千万点]+)/g, (_, n) => {
      const parts = n.split('点');
      const value =
        cnNumber(parts[0]) + (parts[1] ? Number('0.' + [...parts[1]].map((c) => DIGITS[c] ?? 0).join('')) : 0);
      return value + '%';
    })
    .replace(/([零〇一二两三四五六七八九十百千万点]+)成/g, (_, n) => cnNumber(n.split('点')[0]) * 10 + '%')
    .replace(/[零〇一二两三四五六七八九十百千万]+点[零〇一二三四五六七八九]+/g, (m) => {
      const [int, frac] = m.split('点');
      return cnNumber(int) + '.' + [...frac].map((c) => DIGITS[c] ?? 0).join('');
    })
    .replace(/[零〇一二两三四五六七八九十百千万]{2,}/g, (m) => String(cnNumber(m)));
}

const pageTexts = await withBrowser(async (browser) => {
  const { page } = await openDeckPage(browser, htmlArg);
  return page.evaluate(() =>
    [...document.querySelectorAll('.sheet')].map((sheet) => {
      const own = sheet.innerText || '';
      // SVG 里的 <text> 不进 innerText，必须单独取，否则图表上的数字全部漏掉。
      return own + '\n' + [...sheet.querySelectorAll('svg text')].map((t) => t.textContent).join(' ');
    }),
  );
});
if (!pageTexts.length) throw Error('页面里没有 .sheet，先确认渲染是否失败');

// 自动检查只声称数量/单位一致，不推定对象、分母和因果正确。
// facts 可显式绑定 metric/value/unit/time/denominator 与 screen/notes 中的原文。
const sections = notes.split(/\n(?=##\s)/).map((chunk) => chunk.replace(/^##[^\n]*\n?/, ''));
const quantities = (text) =>
  [
    ...normalizeChineseNumbers(text).matchAll(/(-?\d[\d,]*(?:\.\d+)?)\s*(亿|万|千)?\s*(元|人|单|次|家|个|天|年|%|％)/g),
  ].map((m) => ({
    label: normalizeChineseNumbers(text)
      .slice(Math.max(0, m.index - 16), m.index)
      .split(/[，。；\n：:]/)
      .at(-1)
      .replace(/[是为约达共计\s]/g, ''),
    raw: m[0],
    value: Number(m[1].replaceAll(',', '')) * ({ 亿: 1e8, 万: 1e4, 千: 1e3 }[m[2]] || 1),
    unit: m[3].replace('％', '%'),
  }));
const problems = [],
  warnings = [];
if (pageTexts.length !== deck.pages.length || sections.length !== deck.pages.length)
  problems.push({ code: 'COVERAGE', message: '页面、讲稿和输入数量不符' });
for (const [index, screen] of pageTexts.entries()) {
  const id = deck.pages[index]?.id || String(index + 1),
    note = sections[index] || '';
  const sq = quantities(screen),
    nq = quantities(note);
  for (const q of nq) {
    if (!sq.some((p) => p.unit === q.unit && Math.abs(p.value - q.value) < 1e-8))
      warnings.push({ page: id, quantity: q.raw, message: '画面未出现此数量，检查是否为有来源的补充背景' });
    // 同名指标按真实单位换算比较；不同对象/时点需用 facts 明确绑定，不用倍率猜测放行。
    const sameMetric = sq.filter((p) => p.label.length > 1 && p.label === q.label && p.unit === q.unit);
    if (sameMetric.length && !sameMetric.some((p) => Math.abs(p.value - q.value) < 1e-8))
      problems.push({ page: id, code: 'UNIT', message: '画面与讲稿数量级冲突', quantity: q.raw });
  }
  for (const f of deck.pages[index]?.facts || []) {
    if (!f.metric || !Number.isFinite(f.value) || !f.unit || !f.screen || !f.notes) {
      problems.push({ page: id, code: 'FACT', message: 'facts 需 metric/value/unit/screen/notes' });
      continue;
    }
    const expected = quantities(String(f.value) + f.unit)[0];
    const matches = (text) =>
      expected && quantities(text).some((q) => q.unit === expected.unit && Math.abs(q.value - expected.value) < 1e-8);
    if (!screen.includes(f.screen) || !note.includes(f.notes) || !matches(f.screen) || !matches(f.notes))
      problems.push({ page: id, code: 'FACT', metric: f.metric, message: '事实绑定原文缺失或数量单位不符' });
  }
}
console.log(
  JSON.stringify(
    {
      ok: !problems.length,
      pages: pageTexts.length,
      problems,
      warnings,
      boundary: '自动核对数量与显式绑定；对象、时点、分母和背景来源仍须内容审查',
    },
    null,
    2,
  ),
);
if (problems.length) process.exitCode = 1;
