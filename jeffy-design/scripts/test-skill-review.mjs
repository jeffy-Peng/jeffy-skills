import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseFrontMatter } from './front-matter.mjs';
import { loadChromium, findChrome } from '../lib/browser.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  work = join(root, 'build/skill-review');
mkdirSync(work, { recursive: true });
const results = [];
const test = (name, fn) => {
  fn();
  results.push({ name, pass: true });
};
const original = readFileSync(join(root, 'assets/materials/BAR-001.md'), 'utf8');
test('windows-front-matter', () =>
  assert.deepEqual(
    parseFrontMatter('\uFEFF' + original.replace(/\r?\n/g, '\r\n')).data,
    parseFrontMatter(original).data,
  ));
const component = {
  id: 'chart',
  material: 'BAR-007',
  purpose: '比较实际与目标，坐标范围必须包含目标值',
  data: { metric: '指标', unit: '单位', series: ['实际', '目标'], data: [{ label: 'A', values: [10, 1000] }] },
  options: { direction: 'horizontal' },
  box: { x: 64, y: 170, width: 1152, height: 430 },
};
const page = {
  id: 'content',
  title: '实际与目标',
  question: '实际值距目标多远？',
  claim: '实际值为 10，目标为 1000。',
  readingOrder: ['chart'],
  speakerNotes: '实际与目标在同一坐标尺度上比较。',
  source: '来源：示意数据。',
  components: [component],
};
const deck = {
  theme: 'simple-line',
  palette: 'mono',
  pages: [
    { id: 'cover', type: 'cover', title: '数值比较' },
    { id: 'toc', type: 'toc', title: '目录' },
    { id: 'section', type: 'section', title: '广告：价值交换' },
    page,
  ],
};
deck.pages.push({
  ...structuredClone(page),
  id: 'timeline',
  title: '事件先后',
  readingOrder: ['events'],
  components: [
    {
      id: 'events',
      material: 'TIME-001',
      purpose: '核对声明默认值生效及末节点说明不越界',
      data: {
        events: [
          { id: 'A', date: '2026-01-01', title: 'A', body: '说明 A' },
          { id: 'B', date: '2026-02-01', title: 'B', body: '说明 B' },
          { id: 'C', date: '2026-03-01', title: 'C', body: '说明 C' },
        ],
      },
      box: { x: 64, y: 170, width: 1152, height: 430 },
    },
  ],
});
const file = join(work, 'deck.json');
writeFileSync(file, JSON.stringify(deck));
const run = (script, ...args) =>
  spawnSync(process.execPath, [join(root, 'scripts', script), ...args], { encoding: 'utf8' });
test('outline-purpose-and-structural-pages', () => {
  const out = run('validate-outline.mjs', file);
  assert.equal(out.status, 0, out.stderr);
});
const bad = structuredClone(deck);
bad.pages.at(-1).readingOrder = ['missing'];
writeFileSync(join(work, 'bad.json'), JSON.stringify(bad));
test('outline-reading-order-invalid', () =>
  assert.notEqual(run('validate-outline.mjs', join(work, 'bad.json')).status, 0));
const legacy = structuredClone(deck);
legacy.pages.find((p) => p.id === 'content').components[0].reason = legacy.pages.find(
  (p) => p.id === 'content',
).components[0].purpose;
delete legacy.pages.find((p) => p.id === 'content').components[0].purpose;
writeFileSync(join(work, 'legacy.json'), JSON.stringify(legacy));
test('legacy-reason-builds', () =>
  assert.equal(run('build-composition.mjs', join(work, 'legacy.json'), join(work, 'legacy.html')).status, 0));
const html = join(work, 'deck.html');
test('build-review-pages', () => {
  const out = run('build-composition.mjs', file, html);
  assert.equal(out.status, 0, out.stderr);
});
const browser = await loadChromium().launch({ executablePath: findChrome() });
try {
  const p = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await p.goto(pathToFileURL(html).href + '?static=1');
  await p.waitForFunction(() => window.renderComplete);
  const actual = await p.evaluate(() => {
    const theme = compositionInput.theme;
    const draw = (id, data, options = {}) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      document.body.append(svg);
      try {
        return { svg, result: ThemeRenderers.render(svg, data, options, theme, { width: 1000, height: 500 }, id) };
      } catch (e) {
        svg.remove();
        return { error: e.code };
      }
    };
    const basic = { series: ['数值'], data: [{ label: 'A', values: [10] }] };
    const cases = {
      badDirection: draw('BAR-001', basic, { direction: 'diagonal' }).error,
      badSort: draw('BAR-001', basic, { sort: 'random' }).error,
      badWidth: draw('BAR-001', basic, { widthRatio: 9 }).error,
      badPercent: draw('BAR-001', basic, { mode: 'percent' }).error,
      badLineMode: draw('LINE-001', {}, { mode: 'step' }).error,
      ignoredBoxDirection: draw('BOX-001', {}, { direction: 'horizontal' }).error,
      badBox: draw('BOX-001', { groups: [{ label: 'A', min: 1, q1: 6, median: 2, q3: 4, max: 9 }] }).error,
      badOutlier: draw('BOX-001', {
        groups: [{ label: 'A', min: 1, q1: 2, median: 3, q3: 4, max: 9, outliers: [null] }],
      }).error,
    };
    const target = draw(
      'BAR-007',
      { series: ['实际', '目标'], data: [{ label: 'A', values: [10, 1000] }] },
      { direction: 'horizontal' },
    );
    const range = target.result.max;
    target.svg.remove();
    const labels = draw(
      'LINE-001',
      { labels: ['A', 'B'], series: [{ name: 'I', values: [10, 20] }] },
      { labels: true },
    );
    const linked = labels.svg.querySelectorAll('[data-label-for^="pt"]').length;
    labels.svg.remove();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(svg);
    const d = ThemeDrawing.create(svg, theme);
    let longLegend;
    try {
      d.legend([{ name: 'A'.repeat(1000), type: 'bar', paint: 'accent' }], 200, 100);
    } catch (e) {
      longLegend = e.code;
    }
    svg.remove();
    const graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(graph);
    const g = ThemeDrawing.create(graph, theme);
    g.legend(
      [
        { name: 'A', type: 'bar', paint: 'accent' },
        { name: 'B', type: 'line', paint: 'ink' },
      ],
      400,
      80,
    );
    const legend = graph.querySelector('[data-unified-legend]');
    const rr = legend.querySelector('rect'),
      tt = legend.querySelector('text');
    const centerAligned =
      Math.abs(+rr.getAttribute('y') + +rr.getAttribute('height') / 2 - +tt.getAttribute('y')) < 1e-8;
    graph.remove();
    const plan = KitLayout.distribute(theme, {
      id: 'auto',
      claim: '自动分区',
      components: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 2 },
      ],
    });
    const autoLayout =
      plan.issues.length === 0 &&
      plan.boxes.every((b) => Object.values(b.box).every(Number.isFinite) && b.box.height > 0);
    return {
      cases,
      timelineBodies: document.querySelectorAll('[data-page="timeline"] text[data-theme-role="body"][data-label-for]')
        .length,
      timelineDefault: compositionInput.adapters['TIME-001'].defaultOptions.direction,
      autoLayout,
      range,
      linked,
      longLegend,
      centerAligned,
      toc: document.querySelector('[data-block="toc"]').textContent,
      errors: validationReport.flatMap((r) => r.issues),
    };
  });
  for (const [name, code] of Object.entries(actual.cases))
    test(name, () => assert.equal(code, ['badWidth', 'badBox', 'badOutlier'].includes(name) ? 'DATA' : 'UNSUPPORTED'));
  test('auto-layout-finite-regions', () => assert.ok(actual.autoLayout));
  test('declared-defaults-applied', () => assert.equal(actual.timelineDefault, 'vertical'));
  test('timeline-descriptions-linked', () => assert.equal(actual.timelineBodies, 3));
  test('target-axis-includes-target', () => assert.ok(actual.range >= 1000));
  test('line-labels-follow-points', () => assert.equal(actual.linked, 2));
  test('single-long-legend-reports-capacity', () => assert.equal(actual.longLegend, 'CAPACITY'));
  test('legend-mark-label-center', () => assert.ok(actual.centerAligned));
  test('toc-preserves-complete-title', () => assert.ok(actual.toc.includes('广告：价值交换')));
  test('review-pages-runtime-clean', () => assert.deepEqual(actual.errors, []));
  await p.locator('.sheet[data-page="content"]').screenshot({ path: join(work, 'target-axis.png') });
  await p.locator('.sheet[data-page="toc"]').screenshot({ path: join(work, 'toc.png') });
} finally {
  await browser.close();
}
writeFileSync(join(work, 'validation.json'), JSON.stringify(results, null, 2));
console.log(results.length + ' skill review regressions passed');
