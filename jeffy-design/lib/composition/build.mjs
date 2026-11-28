// 可编程的页面组装引擎：校验输入契约、加载主题与外部 artifact，生成独立 HTML 与逐页讲稿。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { getDefaultThemeName, PROJECT_ROOT, readJson, STRUCTURAL_BUILD_TYPES } from '../constants.mjs';
import { loadResolvedTheme } from '../theming/resolve.mjs';
import { buildDeckHtml } from './bundle.mjs';

export function ensureSynced() {
  const sync = spawnSync(process.execPath, [resolve(PROJECT_ROOT, 'scripts/sync.mjs'), '--check'], {
    encoding: 'utf8',
  });
  if (sync.status !== 0) {
    throw Error('生成物过期，先运行 node scripts/sync.mjs\n' + (sync.stderr || '').trim());
  }
}

export function buildComposition(inputOrDeck, outputPath, options = {}) {
  const { skipSyncCheck = false } = options;
  if (!skipSyncCheck) ensureSynced();

  const isPath = typeof inputOrDeck === 'string';
  const baseDir = options.baseDir || (isPath ? dirname(resolve(inputOrDeck)) : process.cwd());
  const deck = isPath ? JSON.parse(readFileSync(inputOrDeck, 'utf8')) : structuredClone(inputOrDeck);

  deck.theme ||= getDefaultThemeName();
  if (!/^[a-z0-9-]+$/.test(deck.theme)) throw Error('主题标识无效');

  if (!Array.isArray(deck.pages) || !deck.pages.length) throw Error('CONTRACT: 需要 pages');
  for (const p of deck.pages) {
    for (const component of p.components || [])
      if (!component.purpose && component.reason) component.purpose = component.reason;
    // 骨架页、封面、转折页、附录允许没有组件，它们只画固定部分。
    const structural = p.skeleton === true || STRUCTURAL_BUILD_TYPES.includes(p.type);
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

  const theme = loadResolvedTheme(deck.theme, deck.palette);
  const registry = readJson('lib/composition/adapters.json');
  const fontLock = readJson('scripts/fonts.lock.json');
  const fontMetrics = Object.fromEntries(fontLock.fonts.filter((f) => f.metrics).map((f) => [f.family, f.metrics]));

  // 外部图像作为证据，模型绘制作为可检验的矢量；两者不伪装成引擎能力。
  const adapters = {};
  for (const c of deck.pages.flatMap((p) => p.components || [])) {
    if (c.artifact) {
      const { type, path, source } = c.artifact;
      if (!['svg', 'image'].includes(type) || !path || !source)
        throw Error('CONTRACT: artifact 需 type(svg/image)、path、source');
      const file = resolve(baseDir, path);
      if (type === 'svg') {
        const svg = readFileSync(file, 'utf8');
        if (
          !/<svg[\s>]/i.test(svg) ||
          /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#|data:)/i.test(svg)
        )
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
    adapters[c.material] = { ...a };
  }

  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, buildDeckHtml({ deck, theme, adapters, fontMetrics }));
  if (deck.deliverable !== 'chart')
    writeFileSync(
      resolvedOutput.replace(/\.html?$/i, '') + '.notes.md',
      deck.pages.map((p) => `## ${p.title}\n\n${p.speakerNotes || ''}`).join('\n\n'),
    );
  return { output: outputPath, theme, pages: deck.pages.length };
}
