// 扫描主题与素材声明，生成登记表、能力表、主题清单。人只改数据，这里是唯一的生成入口。
// 用法 node scripts/sync.mjs [--check]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter } from './front-matter.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const outDir = join(root, 'build', 'generated');
const ARCHETYPES = ['compare', 'trend', 'share', 'table', 'timeline', 'relation', 'flow'];

function readThemes() {
  const dir = join(root, 'themes');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => (a === 'simple-line.json' ? -1 : b === 'simple-line.json' ? 1 : a.localeCompare(b)))
    .map((name) => {
      const theme = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (!theme.name) throw Error(`${name} 缺少 name`);
      if (!theme.fonts?.ea || !theme.fonts?.latin) throw Error(`${name} 缺少字体声明`);
      if (!Array.isArray(theme.scale) || !theme.scale.length) throw Error(`${name} 缺少字号阶梯`);
      return { file: name, name: theme.name, label: theme.label || theme.name };
    });
}

function readMaterialFiles() {
  const dir = join(root, 'assets', 'materials');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const text = readFileSync(join(dir, name), 'utf8');
      const { data } = parseFrontMatter(text);
      if (!data.id) throw Error(name + ' 缺少 id');
      return { file: 'materials/' + name, data };
    });
}

function mergeMaterials(catalog, files) {
  const ids = files.map((f) => f.data.id);
  if (new Set(ids).size !== ids.length) throw Error('素材 ID 重复');
  const old = new Map(catalog.entries.map((e) => [e.id, e]));
  // md 是登记来源；catalog 仅保留审批、证据和展示补充字段。
  catalog.entries = files
    .sort((a, b) => a.data.id.localeCompare(b.data.id))
    .map((file) => {
      const d = file.data;
      if (!ARCHETYPES.includes(d.archetype) || !['engine', 'model'].includes(d.implementation))
        throw Error(d.id + ' 缺少有效 archetype/implementation');
      const entry = {
        aliases: [],
        purpose: d.name || d.form,
        parameters: '按规范调整',
        limits: '以素材规范与实际验收为准',
        standardCoverage: '规范声明；未推定行为覆盖',
        sources: [],
        sheets: [],
        ...(old.get(d.id) || {}),
        ...d,
        materialFile: file.file,
      };
      entry.standard = d.standard || file.file;
      entry.implementationRole = d.implementation || 'engine';
      entry.evidence = old.get(d.id)?.evidence || [];
      delete entry.statusLegacy;
      return entry;
    });
  const merged = files.length;
  return merged;
}

function build() {
  const themes = readThemes();
  const files = readMaterialFiles();
  const catalogPath = join(root, 'assets', 'catalog.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const merged = mergeMaterials(catalog, files);

  const materials = catalog.entries.map((entry) => ({
    id: entry.id,
    standard: entry.standard,
    status: entry.status,
    archetype: entry.archetype || null,
    sources: entry.sources || [],
    materialFile: entry.materialFile || null,
    shape: entry.shape || null,
    tier: entry.tier || 'backup',
    implementation: entry.implementation || 'engine',
    defaults: entry.defaults || {},
    encoding: entry.encoding || null,
    readingTime: entry.readingTime || null,
    cost: entry.cost || null,
    alternates: entry.alternates || [],
  }));
  if (merged) console.log(`素材文件 ${files.length} 个，已合并 ${merged} 条到 catalog.json`);
  // 只有引擎实现的素材才算可组装；模型绘制的只进规范，不进适配器。
  const isEngine = (m) => m.archetype && (m.implementation || 'engine') !== 'model';
  const assembled = materials.filter(isEngine);
  const adapters = Object.fromEntries(
    assembled.map((material) => [
      material.id,
      {
        archetype: material.archetype,
        renderer: 'theme-v1',
        implementedIn: 'lib/theming/renderers.js',
        defaultOptions: material.defaults,
        sampleSource: material.sources[0] || null,
      },
    ]),
  );
  const capability = Object.fromEntries(
    materials.map((material) => [
      material.id,
      {
        capability: !material.archetype
          ? 'spec-only'
          : (material.implementation || 'engine') === 'model'
            ? 'model-drawn'
            : 'assemble',
        archetype: material.archetype,
        status: material.status,
        standard: material.standard,
      },
    ]),
  );
  const chart = [
    '# 选图表',
    '',
    '按「数据形状 → 素材 → 编码 → 阅读时间」排。选型先认数据形状，再看场合与阅读时间，最后看替代关系。',
    '',
    '先按内容关系选素材 ID，再读取 Catalog 中该 ID 的 variants，结合用户指定、主题用途、空间与读数要求选形态。执行上下文、参数和冲突处理见[两步选材与调用](../references/素材使用与维护.md#两步选材与调用)。',
    '',
    '| 数据形状 | 素材 | 编码 | 阅读 | 替代 |',
    '| --- | --- | --- | --- | --- |',
    ...materials
      .filter((m) => m.archetype)
      .sort((a, b) => (a.shape || '').localeCompare(b.shape || ''))
      .map(
        (m) =>
          `| ${m.shape || ''} | ${m.id} | ${m.encoding || ''} | ${m.readingTime || ''} | ${(m.alternates || []).join('、')} |`,
      ),
    '',
  ].join('\n');
  return {
    'catalog.json': catalog,
    'themes.json': themes,
    '选图表.md': chart,
    'adapters.json': adapters,
    'capability.json': capability,
    'materials.json': materials.map(
      ({ id, archetype, implementation, standard, shape, tier, status, encoding, readingTime, cost, alternates }) => ({
        implementation,
        id,
        archetype,
        standard,
        shape,
        tier,
        status,
        encoding,
        readingTime,
        cost,
        alternates,
      }),
    ),
  };
}

const outputs = build();
const targets = [
  [join(root, 'assets', 'catalog.json'), outputs['catalog.json']],
  [join(outDir, 'themes.json'), outputs['themes.json']],
  [join(root, 'lib', 'composition', 'adapters.json'), outputs['adapters.json']],
  [join(root, 'assets', 'capability.json'), outputs['capability.json']],
  [join(outDir, 'materials.json'), outputs['materials.json']],
];

let stale = 0;
for (const [path, value] of targets) {
  const text = JSON.stringify(value, null, 2) + '\n';
  const exists = existsSync(path);
  const current = exists ? readFileSync(path, 'utf8') : '';
  if (current === text) continue;
  stale += 1;
  if (!checkOnly) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
}

// 文本产物（选图表）单独写，不走 JSON 序列化。
for (const [path, text] of [[join(root, 'docs', '选图表.md'), outputs['选图表.md']]]) {
  const exists = existsSync(path);
  const current = exists ? readFileSync(path, 'utf8') : '';
  if (current === text) continue;
  stale += 1;
  if (!checkOnly) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
}

const themes = outputs['themes.json'];
const materials = outputs['materials.json'];
// 计数以能力表为准：materials.json 不带实现方式字段。
const caps = outputs['capability.json'] || {};
const assembled = Object.values(caps).filter((v) => v.capability === 'assemble');
const modelDrawn = Object.values(caps).filter((v) => v.capability === 'model-drawn');
const byArchetype = ARCHETYPES.map((name) => `${name} ${materials.filter((m) => m.archetype === name).length}`);
console.log(
  `${checkOnly ? '检查' : '生成'}完成：主题 ${themes.length} 个（${themes.map((t) => t.name).join('、')}），` +
    `素材 ${materials.length} 条，可组装 ${assembled.length} 条，模型绘制 ${modelDrawn.length} 条，仅规范 ${materials.length - assembled.length - modelDrawn.length} 条`,
);
console.log('按原型分布：' + byArchetype.join('，') + (stale ? `；更新 ${stale} 个文件` : '；无变化'));
if (checkOnly && stale) {
  console.error('生成物与声明不一致，运行 node scripts/sync.mjs 重新生成。');
  process.exitCode = 1;
}
