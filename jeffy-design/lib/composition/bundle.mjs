// 浏览器运行时脚本清单与自包含 HTML 组装的单一真相源。
import { readFileSync } from 'node:fs';
import { projectPath } from '../constants.mjs';

export const RENDERER_SCRIPT_FILES = Object.freeze([
  'lib/theming/color.js',
  'lib/theming/drawing-fonts.js',
  'lib/kit/legend.js',
  'lib/kit/unit.js',
  'lib/kit/axis.js',
  'lib/kit/layout.js',
  'lib/kit/line-labels.js',
  'lib/theming/drawing.js',
  'lib/theming/renderers/shared.js',
  'lib/theming/renderers/cartesian.js',
  'lib/theming/renderers/polar.js',
  'lib/theming/renderers/tabular.js',
  'lib/theming/renderers/relational.js',
  'lib/theming/renderers.js',
]);

export const DECK_RUNTIME_SCRIPT_FILES = Object.freeze([
  'lib/composition/fatal.js',
  ...RENDERER_SCRIPT_FILES,
  'lib/composition/runtime.js',
  'lib/composition/interaction.js',
]);

export function visualBaselineSourceFiles(themeName) {
  return [
    ...RENDERER_SCRIPT_FILES,
    'lib/composition/runtime.js',
    'scripts/build-specimen.mjs',
    'scripts/fonts.lock.json',
    `themes/${themeName}.json`,
  ];
}

export function readScriptBundle(files = DECK_RUNTIME_SCRIPT_FILES) {
  return files.map((file) => ({
    file,
    code: readFileSync(projectPath(file), 'utf8'),
  }));
}

export function readConcatenatedScripts(files = RENDERER_SCRIPT_FILES) {
  return readScriptBundle(files)
    .map((entry) => entry.code)
    .join('\n');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

export function buildDeckHtml({ deck, theme, adapters, fontMetrics }) {
  const payload = JSON.stringify({ deck, theme, adapters, fontMetrics }).replace(/</g, '\\u003c');
  const documentTitle = escapeHtml(deck.title || deck.pages[0].title || '演示材料');
  const scripts = readScriptBundle(DECK_RUNTIME_SCRIPT_FILES)
    .map((entry) => `<script>${entry.code}</script>`)
    .join('');
  return (
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
    `<title>${documentTitle}</title>` +
    `<style>body{margin:24px;background:#eee;color:#222}main{width:${theme.page.canvas.width}px;margin:auto}` +
    `.sheet{background:white;position:relative;width:${theme.page.canvas.width}px;height:${theme.page.canvas.height}px;margin:28px 0;overflow:hidden}` +
    `.block{position:absolute;box-sizing:border-box}.component{overflow:hidden}` +
    `table{border-collapse:collapse;width:100%;table-layout:fixed}caption{text-align:left;font-weight:600;padding-bottom:8px}` +
    `th,td{font-weight:400;text-align:center;vertical-align:middle;padding:9px 10px;border-bottom:1px solid #ddd}` +
    `thead{background:#EEF2FB}.panel-title{margin:0}.failure{background:#eee;padding:12px;overflow:auto;font:14px Georgia,serif}` +
    `details{padding:16px;background:white;margin:12px 0}.report{font:14px Georgia,serif;white-space:pre-wrap}` +
    `@media print{body{margin:0}details,.report{display:none}.sheet{margin:0;break-after:page}}</style>` +
    `<main></main><script>window.compositionInput=${payload};</script>${scripts}</html>`
  );
}
