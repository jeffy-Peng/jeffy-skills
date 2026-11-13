// 生成素材示意图：只用素材本身，不带页面骨架。占位数据用 A、B、C、D。
// 用法 node scripts/build-specimen.mjs [素材ID...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadChromium, findChrome } from '../lib/browser.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const capability = JSON.parse(readFileSync(resolve(root, 'assets/capability.json'), 'utf8'));
const themes = JSON.parse(readFileSync(resolve(root, 'build/generated/themes.json'), 'utf8'));
const themeName = process.env.SPECIMEN_THEME || themes[0].name;
const outDir = resolve(root, 'assets/materials/specimens');
const workDir = resolve(root, 'build/specimens');
mkdirSync(outDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const wanted = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(capability).filter((id) => capability[id].capability === 'assemble');

function sample(material, archetype) {
  const letters = ['A', 'B', 'C', 'D'];
  const values = [12, 9, 6, 15];
  if (archetype === 'share') {
    return {
      title: '',
      centerLabel: '合计',
      data: [
        { label: 'A', value: 32 },
        { label: 'B', value: 27 },
        { label: 'C', value: 18 },
        { label: 'D', value: 23 },
      ],
    };
  }
  if (archetype === 'table') {
    return {
      title: '',
      columns: ['对象', '数值', '占比'],
      rows: [
        ['A', '12', '32%'],
        ['B', '9', '27%'],
        ['C', '6', '18%'],
        ['D', '15', '23%'],
      ],
    };
  }
  if (archetype === 'timeline') {
    return {
      title: '',
      events: [
        { id: 'e1', date: '2026-01-05', title: '事件一', body: '说明一句' },
        { id: 'e2', date: '2026-04-18', title: '事件二', body: '说明一句' },
        { id: 'e3', date: '2026-09-02', title: '事件三', body: '说明一句' },
      ],
    };
  }
  if (archetype === 'relation') {
    if (material === 'REL-006')
      return {
        title: '',
        nodes: [
          { id: 'a', title: '甲' },
          { id: 'b', title: '乙' },
          { id: 'c', title: '丙' },
          { id: 'd', title: '丁' },
        ],
        edges: [
          { from: 'a', to: 'b', label: '供给' },
          { from: 'b', to: 'c', label: '分配' },
          { from: 'c', to: 'd', label: '结算' },
          { from: 'd', to: 'a', label: '反馈', feedback: true },
        ],
      };
    return {
      title: '',
      root: {
        title: '整体',
        children: [
          { title: '分支一', children: [{ title: '节点 A' }, { title: '节点 B' }] },
          { title: '分支二', children: [{ title: '节点 C' }] },
        ],
      },
    };
  }
  if (archetype === 'flow') {
    return {
      title: '',
      nodes: [
        { id: 's', title: '开始', type: 'start' },
        { id: 'p1', title: '处理一', type: 'process' },
        { id: 'd', title: '判断', type: 'decision' },
        { id: 'p2', title: '处理二', type: 'process' },
        { id: 'e', title: '结束', type: 'end' },
      ],
      edges: [
        { from: 's', to: 'p1' },
        { from: 'p1', to: 'd' },
        { from: 'd', to: 'p2', label: '是' },
        { from: 'd', to: 'e' },
        { from: 'p2', to: 'e' },
      ],
    };
  }
  if (archetype === 'trend') {
    return {
      title: '',
      metric: '数值',
      unit: '单位',
      labels: ['第一期', '第二期', '第三期', '第四期'],
      series: [{ name: '系列一', values }],
    };
  }
  if (archetype === 'compare') {
    if (material === 'BAR-006')
      return {
        title: '',
        metric: '数值',
        unit: '单位',
        data: letters.map((label, i) => ({ label, value: [100, 45, -25, 10][i] })),
      };
    if (material === 'BAR-002' || material === 'BAR-003')
      return {
        title: '',
        metric: '数值',
        unit: '单位',
        series: ['系列一', '系列二'],
        data: letters.map((label, i) => ({ label, values: [values[i], values[(i + 1) % 4]] })),
      };
    return {
      title: '',
      metric: '数值',
      unit: '单位',
      series: ['数值'],
      data: letters.map((label, i) => ({ label, values: [values[i]] })),
    };
  }
  return null;
}

const browser = await loadChromium().launch({ executablePath: findChrome() });
const results = [];
for (const id of wanted) {
  const entry = capability[id];
  const data = sample(id, entry.archetype);
  if (!data) {
    results.push({ id, ok: false, note: '这个原型还没有示意图数据' });
    continue;
  }
  const deck = {
    theme: themeName,
    pages: [
      {
        id: id,
        preview: true,
        title: '',
        question: '',
        claim: '',
        readingOrder: ['c'],
        source: '',
        speakerNotes: '',
        components: [
          { id: 'c', material: id, purpose: entry.archetype, data, box: { x: 64, y: 136, width: 1152, height: 518 } },
        ],
      },
    ],
  };
  const deckPath = join(workDir, id + '.deck.json');
  const htmlPath = join(workDir, id + '.html');
  const reportPath = join(workDir, id + '.report.json');
  writeFileSync(deckPath, JSON.stringify(deck, null, 2));
  const built = spawnSync(process.execPath, [resolve(root, 'scripts/build-composition.mjs'), deckPath, htmlPath], {
    encoding: 'utf8',
  });
  if (built.status !== 0) {
    results.push({ id, ok: false, note: '构建失败' });
    continue;
  }
  spawnSync(process.execPath, [resolve(root, 'scripts/verify-page.mjs'), htmlPath, reportPath, themeName], {
    encoding: 'utf8',
  });
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const page = await browser.newPage({ viewport: { width: 1340, height: 800 }, deviceScaleFactor: 2 });
  await page.goto('file://' + htmlPath);
  await page.waitForFunction(() => window.renderComplete === true, {}, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page
    .locator('.sheet')
    .first()
    .screenshot({ path: join(outDir, id + '.png') });
  await page.close();
  results.push({ id, ok: report.pages?.[0]?.ok ?? false });
  console.log(id, results.at(-1).ok ? 'PASS' : 'FAIL', '→ assets/materials/specimens/' + id + '.png');
}
await browser.close();
writeFileSync(join(workDir, 'index.json'), JSON.stringify({ theme: themeName, results }, null, 2));
console.log(results.filter((r) => r.ok).length + '/' + results.length + ' 张示意图已生成');
