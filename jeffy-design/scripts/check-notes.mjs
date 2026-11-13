// 讲稿与画面数字比对。用真实渲染出来的文字，不用输入数据，避免坐标和原始数组干扰。
// 用法 node scripts/check-notes.mjs deck.json out.html [notes.md]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadChromium, findChrome } from '../lib/browser.mjs';

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

function numbersIn(text) {
  text = normalizeChineseNumbers(text);
  return [...String(text).matchAll(/-?\d[\d,]*(?:\.\d+)?/g)]
    .map((m) => m[0].replace(/,/g, ''))
    .filter((v) => v.includes('.') || Math.abs(Number(v)) >= 10)
    .map((v) => Number(v).toFixed(v.includes('.') ? 2 : 0));
}

const browser = await loadChromium().launch({ executablePath: findChrome() });
let pageTexts = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(resolve(htmlArg)).href);
  await page.waitForFunction(() => window.renderComplete === true, {}, { timeout: 20000 });
  pageTexts = await page.evaluate(() =>
    [...document.querySelectorAll('.sheet')].map((sheet) => {
      const own = sheet.innerText || '';
      // SVG 里的 <text> 不进 innerText，必须单独取，否则图表上的数字全部漏掉。
      const inner = [...sheet.querySelectorAll('iframe')]
        .map((frame) => {
          try {
            const doc = frame.contentDocument;
            const svg = [...doc.querySelectorAll('svg text')].map((t) => t.textContent).join(' ');
            return (doc.body.innerText || '') + '\n' + svg;
          } catch {
            return '';
          }
        })
        .join('\n');
      return own + '\n' + inner;
    }),
  );
} finally {
  await browser.close();
}
if (!pageTexts.length) throw Error('页面里没有 .sheet，先确认渲染是否失败');

// 两个方向不对称。讲稿里的数字必须都能在画面上找到，这是硬要求。
// 画面上的数字不需要全被念到，但标题和观点里出现的必须念，其余多是刻度和表格行。
const sections = notes.split(/\n(?=##\s)/).map((chunk) => chunk.replace(/^##[^\n]*\n?/, ''));
const problems = [];
for (const [index, screen] of pageTexts.entries()) {
  const pageSet = new Set(numbersIn(screen));
  const noteSet = new Set(numbersIn(sections[index] || ''));
  const headline = new Set(
    numbersIn(
      `${deck.pages?.[index]?.title || ''} ${deck.pages?.[index]?.claim || ''} ${deck.pages?.[index]?.question || ''}`,
    ),
  );
  // 单位经常只在画面上出现（八十万元对 80），比较时允许万、亿级的换算。
  const same = (a, b) =>
    [1, 1e4, 1e8, 1e-4, 1e-8].some(
      (f) => Math.abs(Number(a) * f - Number(b)) <= Math.max(0.01, Math.abs(Number(b)) * 0.005),
    );
  const onlyNotes = [...noteSet].filter((v) => ![...pageSet].some((p) => same(v, p)));
  const missedHeadline = [...headline].filter((v) => pageSet.has(v) && ![...noteSet].some((n) => same(n, v)));
  const id = deck.pages?.[index]?.id || `第${index + 1}页`;
  if (onlyNotes.length) problems.push({ page: id, direction: '讲稿有、画面上没有', values: onlyNotes });
  if (missedHeadline.length)
    problems.push({ page: id, direction: '标题或观点里的数字讲稿没念', values: missedHeadline });
}
if (problems.length) {
  console.error(JSON.stringify({ ok: false, problems }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`数字一致：${pageTexts.length} 页`);
}
