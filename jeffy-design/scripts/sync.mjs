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
  const byId = new Map(files.map((f) => [f.data.id, f]));
  let merged = 0;
  for (const entry of catalog.entries) {
    const file = byId.get(entry.id);
    if (!file) continue;
    const d = file.data;
    entry.form = d.form || entry.form;
    entry.question = d.question || entry.question;
    entry.minimumInput = d.minimumInput || entry.minimumInput;
    entry.archetype = d.archetype || entry.archetype;
    entry.status = d.status || entry.status;
    entry.standard = d.standard || file.file;
    if (Array.isArray(d.sources) && d.sources.length) entry.sources = d.sources;
    if (Array.isArray(d.sheets) && d.sheets.length) entry.sheets = d.sheets;
    if (Array.isArray(d.options)) entry.options = d.options;
    if (d.shape) entry.shape = d.shape;
    if (d.tier) entry.tier = d.tier;
    if (d.implementation) entry.implementation = d.implementation;
    entry.materialFile = file.file;
    merged += 1;
  }
  return merged;
}

function readMaterials() {
  const catalog = JSON.parse(readFileSync(join(root, 'assets', 'catalog.json'), 'utf8'));
  return catalog.entries.map((entry) => {
    const archetype = entry.archetype || null;
    if (archetype && !ARCHETYPES.includes(archetype)) {
      throw Error(`${entry.id} 的 archetype「${archetype}」不在 ${ARCHETYPES.join('/')} 里`);
    }
    return {
      id: entry.id,
      standard: entry.standard,
      status: entry.status,
      archetype,
      sources: entry.sources || [],
      implementation: entry.implementation || 'engine',
    };
  });
}

function build() {
  const themes = readThemes();
  const files = readMaterialFiles();
  const catalogPath = join(root, 'assets', 'catalog.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const merged = mergeMaterials(catalog, files);
  if (!checkOnly) writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
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
  return {
    'themes.json': themes,
    'adapters.json': adapters,
    'capability.json': capability,
    'materials.json': materials.map(({ id, archetype, standard, shape, tier, status }) => ({
      id,
      archetype,
      standard,
      shape,
      tier,
      status,
    })),
  };
}

const outputs = build();
const targets = [
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
