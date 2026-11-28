// 生成素材示意图：只用素材本身，不带页面骨架。占位数据用 A、B、C、D。
// 用法 node scripts/build-specimen.mjs [素材ID...]
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getDefaultThemeName, loadThemeConfig, PROJECT_ROOT, readJson } from '../lib/constants.mjs';
import { withBrowser, openDeckPage } from '../lib/browser.mjs';
import { buildComposition, ensureSynced } from '../lib/composition/build.mjs';
import { verifyDeckInPage } from '../lib/checks/verify.mjs';

const root = PROJECT_ROOT;
const capability = readJson('assets/capability.json');
const themeName = process.env.SPECIMEN_THEME || getDefaultThemeName();
const themeConfig = loadThemeConfig(themeName);
const outDir = resolve(root, process.env.SPECIMEN_DIR || 'assets/materials/specimens');
const workDir = resolve(root, 'build/specimens');
mkdirSync(outDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const wanted = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(capability).filter((id) => capability[id].capability === 'assemble');

function sample(material, archetype) {
  const letters = ['A', 'B', 'C', 'D'];
  const values = [12, 9, 6, 15];
  if (material === 'TIME-002')
    return {
      title: '',
      unit: '天',
      rows: [
        { label: '调研', start: 0, end: 6 },
        { label: '设计', start: 5, end: 12 },
        { label: '开发', start: 10, end: 24 },
        { label: '测试', start: 22, end: 28 },
        { label: '上线', start: 28, end: 30 },
      ],
    };
  if (material === 'BOX-001')
    return {
      title: '',
      groups: [
        { label: 'A', min: 8, q1: 16, median: 24, q3: 33, max: 46, outliers: [58] },
        { label: 'B', min: 12, q1: 22, median: 31, q3: 40, max: 52 },
        { label: 'C', min: 4, q1: 11, median: 18, q3: 26, max: 38 },
        { label: 'D', min: 18, q1: 27, median: 36, q3: 45, max: 60 },
      ],
    };
  if (material === 'SANKEY-001')
    return {
      title: '',
      left: [
        { name: '甲', value: 40 },
        { name: '乙', value: 35 },
        { name: '丙', value: 25 },
      ],
      right: [
        { name: 'x', value: 50 },
        { name: 'y', value: 30 },
        { name: 'z', value: 20 },
      ],
      links: [
        { from: '甲', to: 'x', value: 25 },
        { from: '甲', to: 'y', value: 10 },
        { from: '甲', to: 'z', value: 5 },
        { from: '乙', to: 'x', value: 15 },
        { from: '乙', to: 'y', value: 15 },
        { from: '乙', to: 'z', value: 5 },
        { from: '丙', to: 'x', value: 10 },
        { from: '丙', to: 'y', value: 5 },
        { from: '丙', to: 'z', value: 10 },
      ],
    };
  if (material === 'FUNNEL-001')
    return {
      title: '',
      stages: [
        { label: '进店', value: 100 },
        { label: '注册', value: 62 },
        { label: '激活', value: 41 },
        { label: '付费', value: 23 },
      ],
    };
  if (material === 'HEAT-001')
    return {
      title: '',
      rows: ['A', 'B', 'C', 'D'],
      cols: ['一季度', '二季度', '三季度', '四季度'],
      values: [
        [34, 51, 43, 29],
        [57, 48, 60, 52],
        [21, 18, null, 25],
        [46, 55, 39, 58],
      ],
      min: 0,
      max: 60,
    };
  if (material === 'SCATTER-001')
    return {
      title: '',
      xLabel: '价格 · 元',
      yLabel: '销量 · 件',
      points: [
        { label: 'A', x: 12, y: 68 },
        { label: 'B', x: 24, y: 52 },
        { label: 'C', x: 31, y: 61 },
        { label: 'D', x: 45, y: 38 },
        { label: 'E', x: 52, y: 44 },
        { label: 'F', x: 63, y: 25 },
      ],
    };
  if (material === 'RADAR-001')
    return {
      title: '',
      max: 100,
      axes: [
        { name: '速度', value: 82 },
        { name: '成本', value: 46 },
        { name: '稳定', value: 74 },
        { name: '易用', value: 58 },
        { name: '扩展', value: 65 },
      ],
    };
  if (material === 'REL-003')
    return {
      title: '',
      name: '平台',
      items: [{ title: '账户' }, { title: '订单' }, { title: '结算' }, { title: '报表' }],
    };
  if (archetype === 'share') {
    if (material === 'PIE-002')
      return {
        title: '',
        centerLabel: '合计',
        data: [
          { label: 'A', value: 32, intensity: 42 },
          { label: 'B', value: 27, intensity: 90 },
          { label: 'C', value: 18, intensity: 25 },
          { label: 'D', value: 23, intensity: 64 },
        ],
      };
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
  if (material === 'MATRIX-001')
    return {
      title: '',
      xLabel: '增速 · %',
      yLabel: '规模 · 件',
      boundary: { x: 50, y: 50 },
      points: [
        { label: 'A', x: 78, y: 72 },
        { label: 'B', x: 32, y: 68 },
        { label: 'C', x: 61, y: 28 },
        { label: 'D', x: 22, y: 24 },
      ],
    };
  if (material === 'REL-004')
    return {
      title: '',
      layers: [
        { name: '接入', items: [{ title: '网页' }, { title: 'App' }, { title: '开放接口' }] },
        { name: '服务', items: [{ title: '账户' }, { title: '订单' }, { title: '结算' }] },
        { name: '数据', items: [{ title: '主库' }, { title: '分析库' }] },
      ],
    };
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
    if (material === 'BAR-007')
      return {
        title: '',
        metric: '数值',
        unit: '件',
        series: ['实际', '目标'],
        data: letters.slice(0, 4).map((label, i) => ({
          label,
          values: [
            [42, 50],
            [61, 55],
            [38, 45],
            [70, 65],
          ][i],
        })),
      };
    if (material === 'DIST-001')
      return {
        title: '',
        metric: '频数',
        unit: '个',
        series: ['频数'],
        data: ['0–10', '10–20', '20–30', '30–40'].map((label, i) => ({ label, values: [[8, 19, 12, 5][i]] })),
      };
    if (material === 'BAR-005')
      return {
        title: '',
        metric: '变化量',
        unit: '件',
        series: ['变化量'],
        data: letters.map((label, i) => ({ label, values: [[12, -9, 6, -15][i]] })),
      };
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

ensureSynced();
const results = [];
await withBrowser(async (browser) => {
  for (const id of wanted) {
    const entry = capability[id];
    const data = sample(id, entry.archetype);
    if (!data) {
      results.push({ id, ok: false, note: '这个原型还没有示意图数据' });
      continue;
    }
    const deck = {
      theme: themeName,
      palette: process.env.SPECIMEN_PALETTE || 'mono',
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
    try {
      buildComposition(deck, htmlPath, { baseDir: workDir, skipSyncCheck: true });
    } catch {
      results.push({ id, ok: false, note: '构建失败' });
      continue;
    }
    const { page, errors: pageErrors } = await openDeckPage(browser, htmlPath, {
      viewport: { width: 1340, height: 800 },
      deviceScaleFactor: 2,
      staticMode: true,
    });
    const verified = await verifyDeckInPage(page, themeConfig, pageErrors);
    writeFileSync(
      reportPath,
      JSON.stringify({ errors: verified.errors, pages: verified.pages, audit: verified.audit }, null, 2),
    );
    await page.waitForTimeout(100);
    await page
      .locator('.sheet')
      .first()
      .screenshot({ path: join(outDir, id + '.png') });
    await page.close();
    results.push({ id, ok: verified.ok });
    console.log(id, results.at(-1).ok ? 'PASS' : 'FAIL', '→ assets/materials/specimens/' + id + '.png');
  }
});
writeFileSync(join(workDir, 'index.json'), JSON.stringify({ theme: themeName, results }, null, 2));
console.log(results.filter((r) => r.ok).length + '/' + results.length + ' 张示意图已生成');

if (results.some((r) => !r.ok) || !results.length) process.exitCode = 1;
