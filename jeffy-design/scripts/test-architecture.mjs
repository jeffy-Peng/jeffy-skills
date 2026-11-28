// 架构防回归守卫：验证单一真相源、模块边界、无循环依赖、无死载荷与工具链可移植性。
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ARCHETYPES,
  getDefaultThemeName,
  listThemeNames,
  PROJECT_ROOT,
  projectPath,
  readJson,
} from '../lib/constants.mjs';
import {
  buildDeckHtml,
  DECK_RUNTIME_SCRIPT_FILES,
  readConcatenatedScripts,
  RENDERER_SCRIPT_FILES,
  visualBaselineSourceFiles,
} from '../lib/composition/bundle.mjs';
import { loadResolvedTheme } from '../lib/theming/resolve.mjs';
import { parseFrontMatter } from './front-matter.mjs';

const results = [];
function check(name, fn) {
  fn();
  results.push({ name, ok: true });
}

function walkFiles(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full, predicate));
    else if (!predicate || predicate(full)) out.push(full);
  }
  return out;
}

const sorted = (arr) => [...arr].sort();

check('sync-check-clean', () => {
  const res = spawnSync(process.execPath, [projectPath('scripts/sync.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

check('rules-table-in-sync', () => {
  const res = spawnSync(process.execPath, [projectPath('scripts/gen-rules.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

check('catalog-in-sync', () => {
  const res = spawnSync(process.execPath, [projectPath('scripts/build-catalog.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

check('runtime-bundle-files-exist', () => {
  const themeName = getDefaultThemeName();
  for (const file of new Set([...DECK_RUNTIME_SCRIPT_FILES, ...visualBaselineSourceFiles(themeName)])) {
    assert.ok(existsSync(projectPath(file)), `缺失运行时/基线清单文件: ${file}`);
  }
});

check('style-registry-paths-normalized', () => {
  const registry = readJson('lib/styles/registry.json');
  for (const [name, entry] of Object.entries(registry)) {
    if (name === 'note') continue;
    assert.ok(!entry.file.includes('..'), `笔触 ${name} 路径含相对回退: ${entry.file}`);
    assert.ok(existsSync(projectPath(entry.file)), `笔触 ${name} 指向不存在的文件: ${entry.file}`);
  }
});

// 在隔离 VM 中加载浏览器渲染层，验证声明源、adapters.json 与 ThemeRenderers 1:1 对齐。
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(readConcatenatedScripts(RENDERER_SCRIPT_FILES), sandbox);
const { ThemeRenderers, ThemeColor } = sandbox.window;

check('material-ssot-adapters-renderers-aligned', () => {
  const adapters = readJson('lib/composition/adapters.json');
  const defaultTheme = getDefaultThemeName();
  const fixtureIds = new Set(
    ['tests/composition/pressure.json', 'tests/composition/extended.json'].flatMap((file) =>
      readJson(file).pages.flatMap((p) => (p.components || []).map((c) => c.material)),
    ),
  );
  const mdFiles = readdirSync(projectPath('assets/materials'))
    .filter((f) => f.endsWith('.md'))
    .sort();
  const declared = new Map();
  for (const file of mdFiles) {
    const { data } = parseFrontMatter(readFileSync(projectPath('assets/materials', file), 'utf8'));
    assert.ok(data.id, `${file} 缺少 id`);
    assert.ok(!declared.has(data.id), `重复素材 ID: ${data.id}`);
    assert.ok(ARCHETYPES.includes(data.archetype), `${data.id} 非法 archetype: ${data.archetype}`);
    assert.ok(['engine', 'model'].includes(data.implementation), `${data.id} 非法 implementation`);
    const opts = Array.isArray(data.options) ? data.options : [];
    for (const defKey of Object.keys(data.defaults || {})) {
      assert.ok(opts.includes(defKey), `${data.id} 的 defaults.${defKey} 未在 options 声明`);
    }
    for (const src of data.sources || []) {
      assert.ok(existsSync(projectPath('assets', src)), `${data.id} 引用了不存在的 source: ${src}`);
    }
    declared.set(data.id, data);
  }
  for (const [id, data] of declared) {
    for (const alt of data.alternates || []) assert.ok(declared.has(alt), `${id} 引用未知替代素材: ${alt}`);
  }

  const adapterIds = sorted(Object.keys(adapters));
  const rendererIds = sorted(ThemeRenderers.listIds());
  assert.deepEqual(rendererIds, adapterIds, 'ThemeRenderers 与 adapters.json 的引擎素材集合不一致');

  for (const id of adapterIds) {
    const mdOptions = sorted(declared.get(id).options || []);
    const adapterOptions = sorted(adapters[id].allowedOptions || []);
    const rendererOptions = sorted(ThemeRenderers.getSpec(id).allowedOptions || []);
    assert.deepEqual(adapterOptions, mdOptions, `${id}: adapters.json.allowedOptions 与 MD 声明不一致`);
    assert.deepEqual(rendererOptions, mdOptions, `${id}: ThemeRenderers.allowedOptions 与 MD 声明不一致`);
    assert.ok(fixtureIds.has(id), `${id}: 缺少 tests/composition/ 回归样本`);
    assert.ok(existsSync(projectPath('assets/materials/specimens', `${id}.png`)), `${id}: 缺少示意图 PNG`);
    assert.ok(
      existsSync(projectPath('assets/materials/baselines', defaultTheme, `${id}.png`)),
      `${id}: 缺少 ${defaultTheme} 视觉基线`,
    );
  }
});

check('built-html-no-duplicate-payload-or-iframe', () => {
  const theme = loadResolvedTheme(getDefaultThemeName());
  const deck = readJson('tests/composition/pressure.json');
  const html = buildDeckHtml({ deck, theme, adapters: {}, fontMetrics: {} });
  const match = html.match(/window\.compositionInput=(.*?);<\/script>/s);
  assert.ok(match, 'HTML 缺少 window.compositionInput');
  const payload = JSON.parse(match[1]);
  assert.deepEqual(sorted(Object.keys(payload)), ['adapters', 'deck', 'fontMetrics', 'theme']);
  assert.ok(!/<iframe/i.test(html), '构建产物不应残留 iframe');
});

check('no-circular-dependencies-in-lib', () => {
  const files = walkFiles(projectPath('lib'), (f) => f.endsWith('.mjs'));
  const graph = new Map();
  const importRe = /(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
  for (const file of files) {
    const key = relative(PROJECT_ROOT, file).replaceAll('\\', '/');
    const deps = [...readFileSync(file, 'utf8').matchAll(importRe)].map((m) =>
      relative(PROJECT_ROOT, resolve(dirname(file), m[1])).replaceAll('\\', '/'),
    );
    graph.set(key, deps);
  }
  const state = new Map();
  function dfs(node, stack) {
    state.set(node, 1);
    for (const next of graph.get(node) || []) {
      if (state.get(next) === 1) {
        const cycle = [...stack.slice(stack.indexOf(next)), next].join(' -> ');
        assert.fail(`lib/ 存在循环依赖: ${cycle}`);
      }
      if (!state.has(next)) dfs(next, [...stack, next]);
    }
    state.set(node, 2);
  }
  for (const node of graph.keys()) if (!state.has(node)) dfs(node, [node]);
});

check('module-boundaries-and-no-legacy-globals', () => {
  const scriptFiles = walkFiles(projectPath('scripts'), (f) => f.endsWith('.mjs'));
  for (const file of scriptFiles) {
    const rel = relative(PROJECT_ROOT, file).replaceAll('\\', '/');
    const src = readFileSync(file, 'utf8');
    assert.ok(!/from\s+['"]playwright['"]|require\(['"]playwright['"]\)/.test(src), `${rel} 绕过 lib/browser.mjs`);
    if (rel !== 'scripts/test-architecture.mjs') {
      assert.ok(!src.includes('/opt/data/'), `${rel} 包含硬编码宿主机路径 /opt/data/`);
    }
  }
  const pkg = readFileSync(projectPath('package.json'), 'utf8');
  assert.ok(!pkg.includes('/opt/data/'), 'package.json 不得硬编码 /opt/data/ 路径');

  const libJsFiles = walkFiles(projectPath('lib'), (f) => f.endsWith('.js'));
  for (const file of libJsFiles) {
    const rel = relative(PROJECT_ROOT, file).replaceAll('\\', '/');
    const src = readFileSync(file, 'utf8');
    for (const dead of ['__archetype', '__fontMetrics', 'slicePaint', 'sliceHighlight']) {
      assert.ok(!src.includes(dead), `${rel} 残留废弃全局/钩子: ${dead}`);
    }
    if (rel !== 'lib/theming/color.js') {
      assert.ok(!/\bfunction\s+luminance\b/.test(src), `${rel} 重复实现 luminance，请复用 ThemeColor`);
    }
  }
});

check('theme-color-canonical-contract', () => {
  assert.deepEqual([...ThemeColor.parseHex('#002FA7')], [0, 47, 167]);
  assert.equal(ThemeColor.parseHex('invalid'), null);
  assert.equal(ThemeColor.preferDarkText('FFFFFF', '1A1A1A', 'FFFFFF'), true);
  assert.equal(ThemeColor.preferDarkText('002FA7', '1A1A1A', 'FFFFFF'), false);
  const theme = loadResolvedTheme(listThemeNames()[0]);
  const mid = ThemeColor.rampColor(theme, 0.5);
  assert.equal(ThemeColor.isOnShadeRamp(mid, theme), true);
  assert.equal(ThemeColor.isOnShadeRamp('#FF0000', theme), false);
});

console.log(`${results.length}/${results.length} 项架构守卫检查通过`);
