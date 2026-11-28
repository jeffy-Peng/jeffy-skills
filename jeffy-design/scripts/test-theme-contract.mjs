import assert from 'node:assert/strict';
import { listThemeNames, loadThemeConfig, loadThemeDefaults } from '../lib/constants.mjs';
import { resolveTheme } from '../lib/theming/resolve.mjs';
const defaults = loadThemeDefaults();
const themes = listThemeNames().map((name) => loadThemeConfig(name));
assert.ok(themes.length > 0, 'theme 目录下至少要有一个主题');
assert.equal(new Set(themes.map((t) => t.name)).size, themes.length, '主题 name 不能重复');
for (const t of themes) assert.ok(resolveTheme(t, defaults).page.content.width > 0);
const base = themes[0];
for (const mutate of [
  (t) => delete t.page.canvas,
  (t) => delete t.usage.scenarios,
  (t) => (t.page.content.y = 30),
  (t) => (t.page.source.width = 5000),
]) {
  const t = structuredClone(base);
  mutate(t);
  assert.throws(() => resolveTheme(t, defaults), /THEME/);
}
const custom = structuredClone(base);
custom.page.content.x = 80;
custom.page.content.width = 1100;
assert.equal(resolveTheme(custom, defaults).page.content.x, 80);
console.log(themes.length + ' theme configurations + 5 contract cases passed');
