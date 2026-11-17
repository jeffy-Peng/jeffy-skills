import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadChromium, findChrome } from '../lib/browser.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  out = join(root, 'build/material-selection');
mkdirSync(out, { recursive: true });
const data = {
  metric: '指标',
  unit: '单位',
  data: [86, 74, 60, 48].map((v, i) => ({ label: 'ABCD'[i], values: [v] })),
};
const rows = [
  ['unspecified', {}, 'selected', 'solid'],
  ['research', { presentation: 'research', space: 'ample' }, 'selected', 'solid'],
  ['creative', { presentation: 'creative', space: 'ample', priority: 'visual' }, 'selected', 'rhythm'],
  ['compact', { presentation: 'creative', space: 'compact' }, 'selected', 'solid'],
  ['precision', { presentation: 'creative', space: 'ample', priority: 'precision' }, 'selected', 'solid'],
  ['missing-space', { presentation: 'creative' }, 'selected', 'solid'],
  ['explicit-overrides-style', { presentation: 'research', space: 'ample', form: 'rhythm' }, 'selected', 'rhythm'],
  ['explicit-conflict', { space: 'compact', form: 'rhythm' }, 'review', null],
  ['explicit-missing-space', { form: 'rhythm' }, 'review', null],
  ['explicit-precision', { space: 'ample', form: 'rhythm', priority: 'precision' }, 'review', null],
  ['unknown-form', { form: 'nonexistent' }, 'review', null],
  ['bad-data', { form: 'rhythm', space: 'ample' }, 'review', null, { data: [{ label: 'A', values: [null] }] }],
  ['negative-not-bar001', { form: 'rhythm', space: 'ample' }, 'review', null, { data: [{ label: 'A', values: [-5] }] }],
  [
    'grouped-not-bar001',
    { form: 'rhythm', space: 'ample' },
    'review',
    null,
    { series: ['I', 'II'], data: [{ label: 'A', values: [5, 8] }] },
  ],
];
const results = [];
for (const [name, selection, status, kind, override] of rows) {
  const file = join(out, name + '.json');
  writeFileSync(file, JSON.stringify({ ...(override || data), selection }));
  const run = spawnSync(process.execPath, [join(root, 'scripts/select-material.mjs'), file, '--intent', '比较'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const actual = JSON.parse(run.stdout);
  assert.equal(actual.形态选择.status, status, name);
  assert.equal(actual.形态选择.options?.kind || null, kind, name);
  if (!override) assert.equal(actual.推荐.id, 'BAR-001');
  if (name === 'negative-not-bar001') assert.equal(actual.推荐.id, 'BAR-005');
  if (name === 'grouped-not-bar001') assert.equal(actual.推荐.id, 'BAR-002');
  if (status === 'review') assert.equal(actual.形态选择.options, null);
  results.push({ name, input: selection, material: actual.推荐.id, selection: actual.形态选择 });
}
const invalid = join(out, 'invalid.json');
writeFileSync(invalid, JSON.stringify({ ...data, selection: { space: 'not-a-space' } }));
assert.notEqual(spawnSync(process.execPath, [join(root, 'scripts/select-material.mjs'), invalid]).status, 0);
// Feed the actual selector output to the normal page builder, then inspect painted marks.
for (const kind of ['solid', 'rhythm']) {
  const chosen = results.find((r) => r.selection.options?.kind === kind);
  const input = {
    theme: 'simple-line',
    palette: 'mono',
    pages: [
      {
        id: kind,
        title: '数值比较',
        question: '各对象数量如何？',
        claim: '长度对应数值。',
        readingOrder: ['chart'],
        source: '来源：示意数据。',
        speakerNotes: '对象数量按相同尺度比较。',
        components: [
          {
            id: 'chart',
            material: chosen.material,
            purpose: chosen.selection.why,
            data,
            options: { ...chosen.selection.options, direction: 'horizontal' },
            box: { x: 64, y: 170, width: 1152, height: 430 },
          },
        ],
      },
    ],
  };
  writeFileSync(join(out, kind + '.json'), JSON.stringify(input));
  const built = spawnSync(
    process.execPath,
    [join(root, 'scripts/build-composition.mjs'), join(out, kind + '.json'), join(out, kind + '.html')],
    { encoding: 'utf8' },
  );
  assert.equal(built.status, 0, built.stderr);
}
const browser = await loadChromium().launch({ executablePath: findChrome() });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  for (const kind of ['solid', 'rhythm']) {
    await page.goto(pathToFileURL(join(out, kind + '.html')).href + '?static=1');
    await page.waitForFunction(() => window.renderComplete);
    const actual = await page.evaluate(() => ({
      marks: document.querySelectorAll('[data-rhythm-segment]').length,
      axis: !!document.querySelector('[data-axis-style="ruler"]'),
      errors: window.validationReport?.issues || [],
    }));
    assert.equal(actual.marks > 0, kind === 'rhythm');
    assert.equal(actual.axis, kind === 'rhythm');
    if (kind === 'solid') {
      const forced = await page.evaluate(() => {
        const theme = structuredClone(compositionInput.theme);
        theme.materials.barStyle = 'rhythm';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ThemeRenderers.render(
          svg,
          { data: [{ label: 'A', values: [10] }] },
          { kind: 'solid' },
          theme,
          { width: 800, height: 400 },
          'BAR-001',
        );
        return svg.querySelectorAll('[data-rhythm-segment]').length;
      });
      assert.equal(forced, 0);
    }
  }
  await page.goto(pathToFileURL(join(root, 'assets/index.html')).href);
  const catalog = await page
    .locator('tr[data-entry="BAR-001"] [data-variant]')
    .evaluateAll((ns) =>
      ns.map((n) => ({ key: n.dataset.variant, visible: getComputedStyle(n).display !== 'none', text: n.textContent })),
    );
  assert.equal(catalog.length, 2);
  assert.ok(
    catalog.every(
      (v) => v.visible && v.text.includes('适用') && v.text.includes('避免') && v.text.includes('options.kind'),
    ),
  );
  await page.locator('tr[data-entry="BAR-001"]').screenshot({ path: join(out, 'catalog-forms.png') });
  results.push({
    rendering: 'selector → builder → actual solid/rhythm marks passed',
    catalog: 'both forms expanded',
    explicitSolidOverridesTheme: true,
  });
} finally {
  await browser.close();
}
writeFileSync(join(out, 'validation.json'), JSON.stringify(results, null, 2));
console.log(`${rows.length} selection scenarios + invalid context + rendering/catalog checks passed`);
