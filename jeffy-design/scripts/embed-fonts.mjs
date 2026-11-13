// 把字体子集塞进交付 HTML，让文件在任何机器上都长一样。
// 用法 node scripts/embed-fonts.mjs in.html [out.html] [--budget 3000000]
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[++i];
const positional = args.filter((a) => !a.startsWith('--') && !Object.values(flags).includes(a));
const input = positional[0];
if (!input) throw Error('用法 node scripts/embed-fonts.mjs in.html [out.html] [--budget 3000000]');
const output = positional[1] || input.replace(/\.html?$/i, '.embedded.html');
const budget = Number(flags.budget || 3000000);
const fontsDir =
  flags.fonts || process.env.FONTS_DIR || join(process.env.HOME || '', '.local/share/fonts/jeffy-design');

// 先看脚本目录，再问 fontconfig。装在 /usr/local/share/fonts 也算数。
function resolveFont(family, localName) {
  const local = join(fontsDir, localName);
  if (existsSync(local)) return local;
  try {
    const hit = execFileSync('fc-match', ['-f', '%{file}', family], { encoding: 'utf8' }).trim();
    if (hit && existsSync(hit)) return hit;
  } catch {}
  return local;
}
const FONT_FILES = {
  'Noto Serif SC': resolveFont('Noto Serif SC', 'NotoSerifSC.ttf'),
  'Noto Sans SC': resolveFont('Noto Sans SC', 'NotoSansSC.ttf'),
  Georgia: resolveFont('Georgia', 'Georgia.TTF'),
};
const WEIGHTS = { 'Noto Serif SC': '200 900', 'Noto Sans SC': '100 900', Georgia: '400' };
const python = process.env.FONTTOOLS_PYTHON || '/opt/data/venvs/fonts/bin/python';

const html = readFileSync(resolve(input), 'utf8');
// 抽取字符集时把内联 JSON 一起算进去，页面文字多半在脚本的 payload 里。
const chars = new Set();
for (const ch of html) {
  if (/[\s]/.test(ch)) continue;
  if (ch.charCodeAt(0) > 0x7f || /[0-9A-Za-z%.,:;()\/+\-−—]/.test(ch)) chars.add(ch);
}
const text = [...chars].join('');
const work = mkdtempSync(join(tmpdir(), 'embed-fonts-'));
writeFileSync(join(work, 'chars.txt'), text);

const faces = [];
const report = [];
for (const [family, file] of Object.entries(FONT_FILES)) {
  if (!existsSync(file))
    throw Object.assign(Error(`找不到字体文件 ${file}，先运行 bash scripts/install-fonts.sh`), { code: 'FONT' });
  const out = join(work, family.replace(/\s+/g, '') + '.woff2');
  execFileSync(python, [join(scriptDir, 'subset-font.py'), file, join(work, 'chars.txt'), out], { stdio: 'pipe' });
  const buf = readFileSync(out);
  report.push({ family, bytes: buf.length });
  faces.push(
    `@font-face{font-family:"${family}";font-weight:${WEIGHTS[family]};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${buf.toString('base64')}) format("woff2")}`,
  );
}

const style = `<style data-embedded-fonts>\n${faces.join('\n')}\n</style>`;
let outHtml = html;
if (/<\/head>/i.test(outHtml)) outHtml = outHtml.replace(/<\/head>/i, style + '</head>');
else outHtml = style + outHtml;

writeFileSync(resolve(output), outHtml);
const size = Buffer.byteLength(outHtml);
const summary = { output, bytes: size, budget, chars: chars.size, fonts: report };
console.log(JSON.stringify(summary, null, 2));
if (size > budget) {
  console.error(`超出预算：${size} > ${budget} 字节。减少页面文字或降低嵌入字体数量。`);
  process.exitCode = 1;
}
