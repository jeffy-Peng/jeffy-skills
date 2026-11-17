import { resolveTheme } from '../lib/theming/resolve.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('用法 node scripts/build-composition.mjs input.json output.html');
// 登记表是生成物。声明改过但没同步时立刻停下，别拿旧登记去装配。
const sync = spawnSync(process.execPath, [resolve(root, 'scripts/sync.mjs'), '--check'], { encoding: 'utf8' });
if (sync.status !== 0) {
  throw Error('生成物过期，先运行 node scripts/sync.mjs\n' + (sync.stderr || '').trim());
}
const deck = JSON.parse(readFileSync(input, 'utf8'));
deck.theme ||= 'simple-line';
if (!/^[a-z0-9-]+$/.test(deck.theme)) throw Error('主题标识无效');

if (!Array.isArray(deck.pages) || !deck.pages.length) throw Error('CONTRACT: 需要 pages');
for (const p of deck.pages) {
  for (const component of p.components || [])
    if (!component.purpose && component.reason) component.purpose = component.reason;
  // 骨架页、封面、转折页、附录允许没有组件，它们只画固定部分。
  const structural = p.skeleton === true || ['cover', 'section', 'appendix', 'toc', 'closing'].includes(p.type);
  if (!structural && !(p.components || []).length && !(p.text || []).length)
    throw Error('CONTRACT: 页面需要 components 或 text');
  const ids = [...(p.components || []), ...(p.text || [])].map((x) => x.id);
  if (new Set(ids).size !== ids.length) throw Error('CONTRACT: 页面内 ID 重复');
  for (const x of [...(p.components || []), ...(p.text || [])]) {
    // 新写法不写坐标：页面有结论句时，组件区域由布局器分配。
    if ((p.components || []).includes(x) && typeof p.claim === 'string' && p.claim.trim() && !x.box) continue;
    const b = x.box;
    if (!b || !['x', 'y', 'width', 'height'].every((k) => Number.isFinite(b[k])) || b.width <= 0 || b.height <= 0)
      throw Error('CONTRACT: 需要有限且为正的目标尺寸');
  }
}
const theme = resolveTheme(
  JSON.parse(readFileSync(resolve(root, 'themes', deck.theme + '.json'), 'utf8')),
  JSON.parse(readFileSync(resolve(root, 'lib/theming/defaults.json'), 'utf8')),
  deck.palette,
);
const registry = JSON.parse(readFileSync(resolve(root, 'lib/composition/adapters.json'), 'utf8'));
const fontLock = JSON.parse(readFileSync(resolve(root, 'scripts/fonts.lock.json'), 'utf8'));
const fontMetrics = Object.fromEntries(fontLock.fonts.filter((f) => f.metrics).map((f) => [f.family, f.metrics]));
// 外部图像作为证据，模型绘制作为可检验的矢量；两者不伪装成引擎能力。
const adapters = {};
for (const c of deck.pages.flatMap((p) => p.components || [])) {
  if (c.artifact) {
    const { type, path, source } = c.artifact;
    if (!['svg', 'image'].includes(type) || !path || !source)
      throw Error('CONTRACT: artifact 需 type(svg/image)、path、source');
    const file = resolve(dirname(resolve(input)), path);
    if (type === 'svg') {
      const svg = readFileSync(file, 'utf8');
      if (!/<svg[\s>]/i.test(svg) || /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#|data:)/i.test(svg))
        throw Error('CONTRACT: SVG 仅允许自包含静态矢量');
      c.artifact.content = svg;
    } else {
      const ext = file.split('.').at(-1).toLowerCase();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext];
      if (!mime) throw Error('CONTRACT: image 只接受 png/jpg/webp；矢量用 svg 类型');
      c.artifact.content = 'data:' + mime + ';base64,' + readFileSync(file).toString('base64');
    }
    continue;
  }
  const a = registry[c.material];
  if (!a || a.renderer !== 'theme-v1')
    throw Error('UNSUPPORTED: ' + c.material + '，按规范绘制 SVG 并提供 artifact，或使用引擎实现');
  adapters[c.material] = { ...a, code: '' };
}
const lineLabels = readFileSync(resolve(root, 'lib/kit/line-labels.js'), 'utf8');
const interaction = readFileSync(resolve(root, 'lib/composition/interaction.js'), 'utf8');
const themeDrawing = readFileSync(resolve(root, 'lib/theming/drawing.js'), 'utf8');
const fontCheck = readFileSync(resolve(root, 'lib/theming/drawing-fonts.js'), 'utf8');
const fatal = readFileSync(resolve(root, 'lib/composition/fatal.js'), 'utf8');
const kit = ['legend', 'unit', 'axis', 'layout']
  .map((name) => readFileSync(resolve(root, 'lib/kit', name + '.js'), 'utf8'))
  .join('\n');
const themeRenderers = readFileSync(resolve(root, 'lib/theming/renderers.js'), 'utf8');
const runtime = readFileSync(resolve(root, 'lib/composition/runtime.js'), 'utf8');
const payload = JSON.stringify({
  deck,
  theme,
  adapters,
  lineLabels,
  interaction,
  themeDrawing,
  themeRenderers,
  fontCheck,
  kit,
  fontMetrics,
}).replace(/</g, '\\u003c');
const documentTitle = String(deck.title || deck.pages[0].title || '演示材料').replace(
  /[&<>"]/g,
  (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
);
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(
  output,
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${documentTitle}</title><style>body{margin:24px;background:#eee;color:#222}main{width:${theme.page.canvas.width}px;margin:auto}.sheet{background:white;position:relative;width:${theme.page.canvas.width}px;height:${theme.page.canvas.height}px;margin:28px 0;overflow:hidden}.block{position:absolute;box-sizing:border-box}.component{overflow:hidden}.component iframe{border:0;width:100%;height:100%;display:block}table{border-collapse:collapse;width:100%;table-layout:fixed}caption{text-align:left;font-weight:600;padding-bottom:8px}th,td{font-weight:400;text-align:center;vertical-align:middle;padding:9px 10px;border-bottom:1px solid #ddd}thead{background:#EEF2FB}.panel-title{margin:0}.failure{background:#eee;padding:12px;overflow:auto;font:14px Georgia,serif}details{padding:16px;background:white;margin:12px 0}.report{font:14px Georgia,serif;white-space:pre-wrap}@media print{body{margin:0}details,.report{display:none}.sheet{margin:0;break-after:page}}</style><main></main><script>window.compositionInput=${payload};</script><script>${fatal}</script><script>${fontCheck}</script><script>${kit}</script><script>${lineLabels}</script><script>${themeDrawing}</script><script>${themeRenderers}</script><script>${runtime}</script><script>${interaction}</script></html>`,
);
if (deck.deliverable !== 'chart')
  writeFileSync(
    output.replace(/\.html?$/i, '') + '.notes.md',
    deck.pages.map((p) => `## ${p.title}\n\n${p.speakerNotes || ''}`).join('\n\n'),
  );
console.log(output);
