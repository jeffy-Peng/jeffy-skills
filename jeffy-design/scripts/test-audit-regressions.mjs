// 对抗审查反例：正确输入通过，缺覆盖、丢关系、单位误读不能通过。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, cpSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadChromium, findChrome } from '../lib/browser.mjs';
import { auditDeck } from '../lib/checks/page-checks.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  work = join(root, 'build/audit-regressions');
mkdirSync(work, { recursive: true });
const results = [];
const run = (script, ...args) =>
  spawnSync(process.execPath, [join(root, 'scripts', script), ...args], { cwd: root, encoding: 'utf8' });
const test = (name, fn) => {
  fn();
  results.push({ name, ok: true });
};
const page = {
  id: 'p',
  title: '验证页面',
  question: '是否完整？',
  claim: '保留真实数据',
  showClaim: false,
  readingOrder: ['t'],
  source: '合成验证',
  speakerNotes: '收入80元。',
  text: [{ id: 't', text: '收入80元', role: 'body', box: { x: 64, y: 200, width: 500, height: 100 } }],
};
const save = (name, d) => {
  const p = join(work, name);
  writeFileSync(p, JSON.stringify(d));
  return p;
};
const deck = save('mixed.json', { theme: 'simple-line', pages: [page] });
const html = join(work, 'mixed.html');
test('text-only-build', () => assert.equal(run('build-composition.mjs', deck, html).status, 0));
test('text-only-verify', () => assert.equal(run('verify-page.mjs', html, join(work, 'valid.json')).status, 0));
const unchecked = join(work, 'unchecked.html');
writeFileSync(
  unchecked,
  '<section class="sheet"><svg><text x="2000" y="100" font-size="999">越界文字</text></svg></section><script>renderComplete=true;validationReport=[]</script>',
);
test('empty-report-fails', () => {
  assert.notEqual(run('verify-page.mjs', unchecked, join(work, 'bad.json')).status, 0);
  const r = JSON.parse(readFileSync(join(work, 'bad.json')));
  assert.ok(r.audit.issues.some((i) => i.code === 'CAPACITY'));
  assert.ok(r.audit.issues.some((i) => i.code === 'THEME'));
});
const flow = save('flow.json', {
  nodes: [
    { id: 'a', type: 'start' },
    { id: 'b', type: 'end' },
  ],
  edges: [{ from: 'a', to: 'b' }],
});
test('flow-types-on-nodes', () =>
  assert.equal(JSON.parse(run('select-material.mjs', flow, '--intent', '流程').stdout).推荐.id, 'FLOW-001'));
const note = join(work, 'unit.notes.md');
writeFileSync(note, '## 验证页面\n\n收入80万元。');
test('unit-conflict-fails', () => assert.notEqual(run('check-notes.mjs', deck, html, note).status, 0));
writeFileSync(note, '## 验证页面\n\n收入八十万元。');
test('chinese-unit-conflict-fails', () => assert.notEqual(run('check-notes.mjs', deck, html, note).status, 0));
writeFileSync(note, '## 验证页面\n\n收入80元，补充背景有90人。');
test('sourced-background-is-reviewable', () => assert.equal(run('check-notes.mjs', deck, html, note).status, 0));
test('unknown-baseline-fails', () => assert.notEqual(run('visual-baseline.mjs', 'DOES-NOT-EXIST').status, 0));
const isolated = join(work, 'sync-fixture');
for (const path of [
  'scripts/sync.mjs',
  'scripts/front-matter.mjs',
  'themes',
  'assets/catalog.json',
  'assets/materials',
  'lib/composition/adapters.json',
  'assets/capability.json',
  'build/generated',
]) {
  mkdirSync(dirname(join(isolated, path)), { recursive: true });
  cpSync(join(root, path), join(isolated, path), { recursive: true });
}
const md = join(isolated, 'assets/materials/AUDIT-NEW.md');
const isolatedSync = () =>
  spawnSync(process.execPath, [join(isolated, 'scripts/sync.mjs'), '--check'], { encoding: 'utf8' });
try {
  const original = readFileSync(join(root, 'assets/materials/BAR-001.md'), 'utf8');
  // Keep this fixture explicitly empty to exercise stale-reference clearing.
  writeFileSync(join(isolated, 'assets/materials/BAR-001.md'), original.replace(/^sources:.*$/m, 'sources: []'));
  writeFileSync(md, original.replaceAll('BAR-001', 'AUDIT-NEW'));
  test('new-declaration-detected', () => assert.notEqual(isolatedSync().status, 0));
  const isolatedCatalog = join(isolated, 'assets/catalog.json');
  const catalog = JSON.parse(readFileSync(isolatedCatalog));
  catalog.entries.find((e) => e.id === 'BAR-001').sources = ['stale'];
  catalog.entries.find((e) => e.id === 'BAR-001').evidence = ['behavior-proof'];
  writeFileSync(isolatedCatalog, JSON.stringify(catalog));
  test('new-declaration-generated', () => {
    assert.equal(spawnSync(process.execPath, [join(isolated, 'scripts/sync.mjs')], { encoding: 'utf8' }).status, 0);
    const entries = JSON.parse(readFileSync(isolatedCatalog)).entries;
    assert.ok(entries.some((e) => e.id === 'AUDIT-NEW'));
    assert.deepEqual(entries.find((e) => e.id === 'BAR-001').sources, []);
    assert.deepEqual(entries.find((e) => e.id === 'BAR-001').evidence, ['behavior-proof']);
  });
  writeFileSync(md, original);
  test('duplicate-id-fails', () => assert.notEqual(isolatedSync().status, 0));
} finally {
  unlinkSync(md);
}
const svg = join(work, 'custom.svg');
writeFileSync(
  svg,
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 100"><text x="10" y="50" data-theme-role="body" style="font:16px Georgia, &quot;Noto Serif SC&quot;;fill:#222222">模型绘制 A</text></svg>',
);
const custom = structuredClone(page);
custom.readingOrder = ['c'];
custom.text = [];
custom.components = [
  {
    id: 'c',
    material: 'REL-002',
    purpose: '验证模型绘制入口',
    reason: '主体交换关系按规范绘制，不改成单向流程',
    box: { x: 64, y: 200, width: 500, height: 100 },
    artifact: { type: 'svg', path: 'custom.svg', source: '模型绘制；合成数据' },
  },
];
const customDeck = save('custom.json', { theme: 'simple-line', deliverable: 'deck', pages: [custom] });
test('model-outline-allowed', () => assert.equal(run('validate-outline.mjs', customDeck).status, 0));
test('model-build-allowed', () =>
  assert.equal(run('build-composition.mjs', customDeck, join(work, 'custom.html')).status, 0));
test('model-verify-allowed', () =>
  assert.equal(run('verify-page.mjs', join(work, 'custom.html'), join(work, 'custom-report.json')).status, 0));
const imagePage = structuredClone(custom);
imagePage.components[0].artifact = {
  type: 'image',
  path: '../../assets/materials/specimens/BAR-001.png',
  source: '项目已有图表截图，测试图像接入',
};
const imageDeck = save('image.json', { theme: 'simple-line', pages: [imagePage] });
test('image-build-and-verify', () => {
  const out = join(work, 'image.html');
  assert.equal(run('build-composition.mjs', imageDeck, out).status, 0);
  assert.equal(run('verify-page.mjs', out, join(work, 'image-report.json')).status, 0);
});
// 真实浏览器运行引擎，检查非法连线、守恒与两边共享比例。
const browser = await loadChromium().launch({ executablePath: findChrome() });
try {
  const p = await browser.newPage();
  await p.goto(pathToFileURL(html).href);
  await p.waitForFunction(() => window.renderComplete);
  const theme = await p.evaluate(() => window.compositionInput.theme);
  await p.evaluate(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '300');
    svg.setAttribute('height', '120');
    svg.style.cssText = 'position:absolute;left:700px;top:200px';
    document.querySelector('.sheet').append(svg);
    const d = ThemeDrawing.create(svg, window.compositionInput.theme);
    const shape = d.box('center-test', 0, 0, 300, 120, 'soft', {
      'data-focus-key': 'center-test',
      'data-text-center': 'true',
    });
    const text = d.text(150, 60, '居中检查', 'body', 'middle', { 'data-label-for': 'center-test' });
    const b = text.getBBox();
    text.setAttribute('y', 60 + 60 - b.y - b.height / 2);
  });
  const centered = await auditDeck(p, theme);
  test('shape-text-center-pass', () => {
    assert.equal(centered.centeredTextGroups, 1);
    assert.equal(centered.issues.filter((i) => i.message.includes('垂直居中')).length, 0);
  });
  await p.evaluate(() => document.querySelector('[data-label-for="center-test"]').setAttribute('y', '25'));
  const shifted = await auditDeck(p, theme);
  test('shape-text-center-drift-fails', () => assert.ok(shifted.issues.some((i) => i.message.includes('垂直居中'))));
  await p.evaluate(() => document.querySelector('[data-label-for="center-test"]').remove());
  const missing = await auditDeck(p, theme);
  test('shape-text-center-missing-fails', () => assert.ok(missing.issues.some((i) => i.missing)));
  const footer = await p.evaluate(() => {
    const a = document.querySelector('[data-block="header-rule"]'),
      b = document.querySelector('[data-block="footer-rule"]');
    return [a.style.left === b.style.left, a.style.width === b.style.width, a.style.borderTop === b.style.borderTop];
  });
  test('theme-header-footer-rules-match', () => assert.deepEqual(footer, [true, true, true]));
  const checks = await p.evaluate(() => {
    const theme = window.compositionInput.theme;
    const draw = (data) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      document.body.append(svg);
      try {
        return { result: ThemeRenderers.render(svg, data, {}, theme, { width: 1000, height: 470 }, 'SANKEY-001'), svg };
      } catch (e) {
        svg.remove();
        return { error: e.code };
      }
    };
    const bad =
      draw({
        left: [{ name: 'A', value: 100 }],
        right: [{ name: 'B', value: 100 }],
        links: [{ from: 'MISSING', to: 'B', value: 100 }],
      }).error === 'DATA';
    const conservation =
      draw({
        left: [{ name: 'A', value: 100 }],
        right: [{ name: 'B', value: 100 }],
        links: [{ from: 'A', to: 'B', value: 90 }],
      }).error === 'DATA';
    const good = draw({
      left: [{ name: 'A', value: 100 }],
      right: [
        { name: 'B', value: 40 },
        { name: 'C', value: 60 },
      ],
      links: [
        { from: 'A', to: 'B', value: 40 },
        { from: 'A', to: 'C', value: 60 },
      ],
    });
    const rects = [...good.svg.querySelectorAll('rect[data-shape-role]')];
    const heights = rects.map((n) => Number(n.getAttribute('height')));
    const flows = [...good.svg.querySelectorAll('path[data-link-from]')];
    const associated = (svg) =>
      [...svg.querySelectorAll('[data-focus-key]')]
        .filter((n) => n.tagName.toLowerCase() === 'rect')
        .every((n) =>
          [...svg.querySelectorAll('text[data-label-for]')].some((t) => t.dataset.labelFor === n.dataset.focusKey),
        );
    const boxSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(boxSvg);
    ThemeRenderers.render(
      boxSvg,
      {
        groups: [
          { label: 'A', min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [9] },
          { label: 'B', min: 0, q1: 1, median: 2, q3: 3, max: 4 },
        ],
      },
      {},
      theme,
      { width: 800, height: 400 },
      'BOX-001',
    );
    const boxGroups = [...boxSvg.querySelectorAll('g[data-focus-key]')];
    return {
      bad,
      conservation,
      sourceColorConsistent: flows[0].getAttribute('fill') === flows[1].getAttribute('fill'),
      nodeLabelsLinked: associated(good.svg),
      boxPartsGrouped:
        boxGroups.length === 2 && boxGroups[0].children.length === 4 && boxGroups[1].children.length === 3,
      boxLabelsLinked: boxGroups.every((g) =>
        [...boxSvg.querySelectorAll('text[data-label-for]')].some((t) => t.dataset.labelFor === g.dataset.focusKey),
      ),
      flowCount: good.svg.querySelectorAll('path[data-link-from]').length,
      sharedScale: Math.abs(heights[0] - heights[1] - heights[2]) < 1e-7,
    };
  });
  for (const [name, value] of Object.entries(checks))
    test('sankey-' + name, () => assert.equal(value, name === 'flowCount' ? 2 : true));
  await p.goto(pathToFileURL(join(work, 'custom.html')).href);
  await p.waitForFunction(() => window.renderComplete);
  await p.locator('.sheet').screenshot({ path: join(work, 'custom.png') });
} finally {
  await browser.close();
}
writeFileSync(join(work, 'results.json'), JSON.stringify(results, null, 2));
console.log(results.length + ' 项对抗回归通过');
