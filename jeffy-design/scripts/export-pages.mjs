// 把装配好的 HTML 逐页导出 PNG，用于贴进 PPT 或做图片序列。
// 用法 node scripts/export-pages.mjs build/samples.html build/export [--scale 2]
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadChromium, findChrome } from '../lib/browser.mjs';

const [, , input, outDirArg, ...rest] = process.argv;
if (!input) throw Error('用法 node scripts/export-pages.mjs 输入.html 输出目录 [--scale 2]');
const scale = Number((rest.find((x) => x.startsWith('--scale=')) || '').split('=')[1] || 2);
const outDir = resolve(outDirArg || 'build/export');
mkdirSync(outDir, { recursive: true });

const browser = await loadChromium().launch({ executablePath: findChrome() });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: scale });
await page.goto(pathToFileURL(resolve(input)).href);
await page.waitForFunction(() => window.renderComplete === true, null, { timeout: 30000 });
await page.waitForTimeout(200);

const sheets = await page.locator('.sheet').count();
if (!sheets) throw Error('页面里没有 .sheet，先确认 HTML 是装配产物');
const names = [];
for (let i = 0; i < sheets; i++) {
  const name = String(i + 1).padStart(2, '0') + '.png';
  await page
    .locator('.sheet')
    .nth(i)
    .screenshot({ path: resolve(outDir, name) });
  names.push(name);
}
await browser.close();
console.log(`已导出 ${sheets} 页到 ${outDir}（${scale}x）：${names.join(' ')}`);
