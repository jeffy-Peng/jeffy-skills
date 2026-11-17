import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { loadChromium, findChrome } from '../lib/browser.mjs';
import { resolveTheme } from '../lib/theming/resolve.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build/rhythm');
mkdirSync(out, { recursive: true });
const theme = resolveTheme(
  JSON.parse(readFileSync(join(root, 'themes/simple-line.json'))),
  JSON.parse(readFileSync(join(root, 'lib/theming/defaults.json'))),
  'mono',
);
const paths = [
  'lib/theming/drawing-fonts.js',
  'lib/kit/legend.js',
  'lib/kit/unit.js',
  'lib/kit/axis.js',
  'lib/theming/drawing.js',
  'lib/theming/renderers.js',
];
const source = paths.map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
const sample = join(root, 'assets/materials/specimens/BAR-001-rhythm.html');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>随机分节 · BAR-001</title><style>body{margin:24px;background:#eee}main{width:960px;background:#${theme.colors.paper};margin:auto}svg{display:block}</style><main class="jd-component"><svg id="chart"></svg></main><script>window.compositionInput=${JSON.stringify({ theme })};</script><script>${source}</script><script>window.sampleData={metric:'指标',unit:'单位',data:[86,74,60,48].map((v,i)=>({label:'ABCD'[i],values:[v]}))};ThemeDrawing.fonts(document,compositionInput.theme).then(()=>{ThemeRenderers.render(document.querySelector('svg'),sampleData,{kind:'rhythm',direction:'horizontal',widthRatio:.68},compositionInput.theme,{width:960,height:540},'BAR-001');window.renderComplete=true})</script><script>${readFileSync(join(root, 'lib/composition/interaction.js'), 'utf8')}</script></html>`;
const raw = join(out, 'reference.raw.html');
writeFileSync(raw, html);
const embedded = spawnSync(process.execPath, [join(root, 'scripts/embed-fonts.mjs'), raw, sample], {
  encoding: 'utf8',
});
if (embedded.status) throw Error(embedded.stderr);
const browser = await loadChromium().launch({ executablePath: findChrome() });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 700 } });
  await page.goto(pathToFileURL(sample).href + '?static=1');
  await page.waitForFunction(() => window.renderComplete);
  for (const direction of ['horizontal', 'vertical'])
    for (const values of [
      [86, 74, 60, 48],
      [0, 0],
      [0.001, 0.375, 12.7, 200],
      [1, 2, 3, 4, 5, 6],
    ]) {
      const report = await page.evaluate(
        ({ direction, values }) => {
          const theme = compositionInput.theme,
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          document.body.append(svg);
          const data = {
            metric: '指标',
            unit: '单位',
            data: values.map((v, i) => ({ label: String.fromCharCode(65 + i), values: [v] })),
          };
          function render() {
            ThemeRenderers.render(
              svg,
              data,
              { kind: 'rhythm', direction },
              theme,
              { width: 960, height: 540 },
              'BAR-001',
            );
          }
          render();
          const snapshot = svg.innerHTML;
          const groups = [...svg.querySelectorAll('[data-segment-step]')];
          const records = groups.map((g, i) => {
            const marks = [...g.querySelectorAll('[data-rhythm-segment]')],
              hit = g.querySelector('rect');
            const horiz = direction === 'horizontal';
            const min = +hit.getAttribute(horiz ? 'x' : 'y'),
              length = +g.dataset.encodedLength;
            const bounds = marks.map((m) => [
              +m.getAttribute(horiz ? 'x' : 'y'),
              +m.getAttribute(horiz ? 'width' : 'height'),
            ]);
            return {
              value: +g.dataset.value,
              count: marks.length,
              zero: values[i] !== 0 || marks.length === 0,
              exact:
                !marks.length ||
                (Math.abs(Math.min(...bounds.map((b) => b[0])) - min) < 1e-6 &&
                  Math.abs(Math.max(...bounds.map((b) => b[0] + b[1])) - min - length) < 1e-6),
              contained: marks.every((m) =>
                ['x', 'y'].every((axis) => {
                  const size = axis === 'x' ? 'width' : 'height';
                  return (
                    +m.getAttribute(axis) >= +hit.getAttribute(axis) - 1e-6 &&
                    +m.getAttribute(axis) + +m.getAttribute(size) <=
                      +hit.getAttribute(axis) + +hit.getAttribute(size) + 1e-6
                  );
                }),
              ),
              labels: !!svg.querySelector('[data-label-for="' + g.dataset.focusKey + '"]'),
            };
          });
          render();
          const stable = snapshot === svg.innerHTML;
          const ruler = !!svg.querySelector('[data-axis-style="ruler"]');
          svg.remove();
          return { records, stable, ruler };
        },
        { direction, values },
      );
      assert.equal(report.records.length, values.length);
      assert.ok(report.stable && report.ruler);
      assert.ok(report.records.every((r) => r.exact && r.contained && r.zero && r.labels && r.count < 100));
      results.push({ direction, values, ...report });
    }
  const alternate = await page.evaluate(() => {
    const theme = structuredClone(compositionInput.theme);
    theme.fonts = { latin: 'Arial', ea: 'Noto Sans SC' };
    theme.colors.accent = '62354E';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(svg);
    ThemeRenderers.render(
      svg,
      sampleData,
      { kind: 'rhythm', direction: 'horizontal' },
      theme,
      { width: 1100, height: 600 },
      'BAR-001',
    );
    const ok =
      [...svg.querySelectorAll('[data-rhythm-segment]')].every((n) => n.getAttribute('fill') === '#62354E') &&
      [...svg.querySelectorAll('text')].every((n) => n.getAttribute('font-family').includes('Arial'));
    svg.remove();
    return ok;
  });
  assert.ok(alternate);
  results.push({ alternateTheme: true });
  const errors = await page.evaluate(() => {
    const run = (values, box = { width: 960, height: 540 }, id = 'BAR-001') => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      try {
        ThemeRenderers.render(
          svg,
          { series: ['I', 'II'], data: values.map((v, i) => ({ label: 'A' + i, values: [v] })) },
          { kind: 'rhythm' },
          compositionInput.theme,
          box,
          id,
        );
        return null;
      } catch (e) {
        return e.code;
      }
    };
    return {
      invalid: run([NaN]),
      negative: run([-1]),
      capacity: run(
        Array.from({ length: 100 }, () => 1),
        { width: 200, height: 100 },
      ),
      grouped: run([1], undefined, 'BAR-002'),
    };
  });
  assert.deepEqual(errors, { invalid: 'DATA', negative: 'DATA', capacity: 'CAPACITY', grouped: 'UNSUPPORTED' });
  results.push({ errors });
  await page.locator('main').screenshot({ path: join(root, 'assets/materials/specimens/BAR-001-rhythm.png') });
  writeFileSync(
    join(root, 'assets/materials/specimens/BAR-001-rhythm.validation.json'),
    JSON.stringify({ scope: '单系列随机分节；横纵、零值、小数、六类、主题及数据/容量反例', results }, null, 2),
  );
  console.log(`${results.length} rhythm scenarios passed`);
} finally {
  await browser.close();
}
