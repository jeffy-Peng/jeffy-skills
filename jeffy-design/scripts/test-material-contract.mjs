// 素材契约测试：所有可组装素材跑同一批用例，不各写各的。
// 用例从已有样本派生：基础、单条、十二条、超长标签。期望是「通过或明确报容量」，不允许崩溃或静默。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || 'build/reports/material-contract.json');
mkdirSync(dirname(out), { recursive: true });

const fixtures = ['tests/composition/pressure.json', 'tests/composition/extended.json'].flatMap((f) =>
  JSON.parse(readFileSync(resolve(root, f), 'utf8')).pages.flatMap((p) =>
    p.components.map((c) => ({ page: p, component: c })),
  ),
);
const capability = JSON.parse(readFileSync(resolve(root, 'assets/capability.json'), 'utf8'));
// 关系与流程类素材的样本由节点和连线组成，机械复制会造出非法结构，这几类只跑基础用例。
const MUTABLE = new Set(['compare', 'trend', 'share', 'table', 'timeline']);
const samples = new Map();
for (const item of fixtures) samples.set(item.component.material, item);

function findRows(node, path = '') {
  if (Array.isArray(node)) {
    if (node.length >= 2 && node.every((x) => x && typeof x === 'object' && ('label' in x || 'title' in x)))
      return { array: node, path };
    for (let i = 0; i < node.length; i++) {
      const hit = findRows(node[i], path + '[' + i + ']');
      if (hit) return hit;
    }
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const hit = findRows(v, path + '.' + k);
      if (hit) return hit;
    }
  }
  return null;
}

function mutate(data, mode) {
  const clone = structuredClone(data);
  const rows = findRows(clone);
  if (!rows) return clone;
  const { array } = rows;
  if (mode === 'single') return (array.splice(1), clone);
  if (mode === 'many') {
    const seed = array[0];
    while (array.length < 12) {
      const i = array.length;
      const item = structuredClone(seed);
      // 已知字段都要给出唯一值，否则日期类素材会因为重复被判数据非法。
      if ('label' in item) item.label = '新增' + i;
      if ('title' in item) item.title = '新增' + i;
      if ('id' in item) item.id = String(seed.id ?? 'item') + '-' + i;
      if ('date' in item && seed.date) {
        const d = new Date(seed.date);
        d.setDate(d.getDate() + i);
        item.date = d.toISOString().slice(0, 10);
      }
      array.push(item);
    }
    return clone;
  }
  if (mode === 'long-label') {
    array[0].label = '这是一个特别长的类别名称用来试探边界';
    if ('title' in array[0]) array[0].title = '这是一个特别长的名称用来试探边界';
    return clone;
  }
  return clone;
}

const modes = ['base', 'single', 'many', 'long-label'];
const pages = [];
for (const [material, sample] of samples) {
  const archetype = capability[material]?.archetype || 'compare';
  const usable = MUTABLE.has(archetype) ? modes : ['base'];
  for (const mode of usable) {
    pages.push({
      id: `${material}-${mode}`,
      title: `${material} ${mode}`,
      question: '契约用例',
      claim: '契约用例',
      readingOrder: ['c'],
      source: '契约测试',
      speakerNotes: '契约测试。',
      components: [
        {
          ...structuredClone(sample.component),
          id: 'c',
          material,
          data: mode === 'base' ? structuredClone(sample.component.data) : mutate(sample.component.data, mode),
          box: { x: 64, y: 150, width: 1152, height: 470 },
        },
      ],
    });
  }
}

const deckPath = join(root, 'build/reports/material-contract.deck.json');
const htmlPath = join(root, 'build/reports/material-contract.html');
const reportPath = join(root, 'build/reports/material-contract.pages.json');
const THEME = JSON.parse(readFileSync(resolve(root, 'build/generated/themes.json'), 'utf8'))[0].name;
writeFileSync(deckPath, JSON.stringify({ theme: THEME, pages }, null, 2));
const built = spawnSync(process.execPath, [resolve(root, 'scripts/build-composition.mjs'), deckPath, htmlPath], {
  encoding: 'utf8',
});
if (built.status !== 0) {
  console.error('构建失败：' + (built.stderr || '').trim().split('\n')[0]);
  process.exit(1);
}
spawnSync(process.execPath, [resolve(root, 'scripts/verify-page.mjs'), htmlPath, reportPath, THEME], {
  encoding: 'utf8',
});
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const byPage = new Map(report.pages.map((p) => [p.id, p]));

const allowed = new Set(['CAPACITY', 'LAYOUT']);
const results = [];
const problems = [];
for (const page of pages) {
  const got = byPage.get(page.id);
  const codes = [...new Set((got?.issues || []).map((i) => i.code))];
  const bad = codes.filter((c) => !allowed.has(c));
  const baseShouldPass = page.id.endsWith('-base');
  const pass = Boolean(got?.ok) || (!baseShouldPass && codes.every((c) => allowed.has(c)));
  results.push({
    page: page.id,
    material: page.components[0].material,
    mode: page.id.split('-').at(-1),
    ok: Boolean(got?.ok),
    codes,
    pass,
  });
  if (!pass || bad.length) problems.push({ page: page.id, codes, bad });
}
writeFileSync(out, JSON.stringify({ contract: 'lib/composition/contract.json', results, problems }, null, 2));
console.log(`${results.filter((r) => r.pass).length}/${results.length} 个契约用例通过，${out}`);
for (const p of problems.slice(0, 8)) console.error('  ' + p.page + ' → ' + p.codes.join('/'));
if (problems.length) process.exitCode = 1;
