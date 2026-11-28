// 项目级单一真相源常量与配置加载器。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, '..');

export const ARCHETYPES = Object.freeze(['compare', 'trend', 'share', 'table', 'timeline', 'relation', 'flow']);
export const STRUCTURAL_OUTLINE_TYPES = Object.freeze(['cover', 'section', 'toc', 'closing']);
export const STRUCTURAL_BUILD_TYPES = Object.freeze(['cover', 'section', 'appendix', 'toc', 'closing']);

export function projectPath(...segments) {
  return join(PROJECT_ROOT, ...segments);
}

export function readJson(filePath) {
  const fullPath = isAbsolute(filePath) ? filePath : projectPath(filePath);
  return JSON.parse(readFileSync(fullPath, 'utf8'));
}

export function loadContract() {
  return readJson('lib/composition/contract.json');
}

export function getDeliverables() {
  return Object.freeze([...loadContract().deliverables]);
}

export function listThemeFiles() {
  return readdirSync(projectPath('themes'))
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => (a === 'simple-line.json' ? -1 : b === 'simple-line.json' ? 1 : a.localeCompare(b)));
}

export function listThemeNames() {
  return listThemeFiles().map((name) => name.replace(/\.json$/, ''));
}

export function getDefaultThemeName() {
  const generated = projectPath('build', 'generated', 'themes.json');
  if (existsSync(generated)) {
    const list = readJson(generated);
    if (Array.isArray(list) && list[0]?.name) return list[0].name;
  }
  return listThemeNames()[0] || 'simple-line';
}

export function loadThemeDefaults() {
  return readJson('lib/theming/defaults.json');
}

export function loadThemeConfig(name = getDefaultThemeName()) {
  return readJson(join('themes', `${name}.json`));
}
