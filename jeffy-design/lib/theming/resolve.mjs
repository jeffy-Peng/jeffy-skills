import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/registry.json'), 'utf8'),
);
const ARCHETYPES = ['compare', 'trend', 'share', 'table', 'timeline', 'relation', 'flow'];

export function resolveTheme(theme, defaults, paletteName) {
  // 色板是外观内的一层：同一套设计语言可以换色板，不改字号与版面。
  if (theme.palettes) {
    const chosen = paletteName || theme.palette || theme.defaultPalette;
    const palette = theme.palettes[chosen];
    if (!palette) throw Error('THEME: 未知色板 ' + chosen);
    theme = { ...theme, colors: palette.colors, palette: chosen };
  }
  const fail = (m) => {
    throw Error('THEME: ' + m);
  };
  for (const key of ['ea', 'latin'])
    if (typeof theme.fonts?.[key] !== 'string' || !theme.fonts[key].trim()) fail('missing font ' + key);
  for (const key of ['ink', 'body', 'muted', 'line', 'soft', 'accent', 'accent2', 'paper'])
    if (!/^[0-9a-f]{6}$/i.test(theme.colors?.[key] || '')) fail('missing/invalid color ' + key);
  const required = ['title', 'cardTitle', 'body', 'pill', 'source', 'pageNo'];
  if (!Array.isArray(theme.scale) || new Set(theme.scale.map((x) => x.role)).size !== theme.scale.length)
    fail('invalid scale');
  for (const key of required) if (!theme.scale.some((x) => x.role === key)) fail('missing role ' + key);
  for (const r of theme.scale)
    if (
      !r.role ||
      !Number.isFinite(r.size) ||
      r.size <= 0 ||
      !Number.isFinite(r.lineHeight) ||
      r.lineHeight <= 0 ||
      !Number.isFinite(r.weight) ||
      !/^[0-9a-f]{6}$/i.test(theme.colors[r.color] || '')
    )
      fail('invalid role ' + r.role);
  if (
    !Number.isFinite(theme.rules?.dividerWidthPx) ||
    theme.rules.dividerWidthPx <= 0 ||
    !Number.isFinite(theme.rules.headerWidthPx) ||
    theme.rules.headerWidthPx <= 0
  )
    fail('invalid strokes');
  const page = theme.page;
  if (
    !page ||
    !Number.isFinite(page.canvas?.width) ||
    !Number.isFinite(page.canvas?.height) ||
    page.canvas.width <= 0 ||
    page.canvas.height <= 0
  )
    fail('invalid canvas');
  for (const key of ['title', 'content', 'source', 'pageNo']) {
    const b = page[key];
    if (
      !b ||
      !['x', 'y', 'width', 'height'].every((k) => Number.isFinite(b[k])) ||
      b.x < 0 ||
      b.y < 0 ||
      b.width <= 0 ||
      b.height <= 0 ||
      b.x + b.width > page.canvas.width ||
      b.y + b.height > page.canvas.height
    )
      fail('invalid page region ' + key);
  }
  const h = page.headerRule;
  if (
    !h ||
    !['x', 'y', 'width'].every((k) => Number.isFinite(h[k])) ||
    h.x < 0 ||
    h.y < 0 ||
    h.width <= 0 ||
    h.x + h.width > page.canvas.width ||
    h.y > page.canvas.height
  )
    fail('invalid header rule');
  const intersects = (a, b) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const key of ['title', 'source', 'pageNo'])
    if (intersects(page.content, page[key])) fail('content overlaps ' + key);
  for (const key of ['scenarios', 'audience']) if (!theme.usage?.[key]?.trim()) fail('missing usage ' + key);
  for (const key of ['prompt', 'title', 'body', 'narration', 'review'])
    if (!theme.writing?.[key]?.trim()) fail('missing writing ' + key);
  const allowed = Object.keys(defaults);
  for (const k of Object.keys(theme.materials || {})) if (!allowed.includes(k)) fail('unknown material token ' + k);
  const materials = { ...defaults, ...theme.materials };
  for (const k of ['gap', 'padding', 'labelGap', 'radius'])
    if (!Number.isFinite(materials[k]) || materials[k] < 0) fail('invalid material token ' + k);
  if (!['solid', 'outline'].includes(materials.barMode) || !theme.colors[materials.nodeFill])
    fail('invalid visual profile');
  // 笔触由主题选择，参数也归主题。校验名是否存在、族是否支持、参数是否登记。
  const brush = theme.brush || { default: 'line', byFamily: {}, params: {} };
  const names = Object.keys(REGISTRY).filter((k) => k !== 'note');
  if (!names.includes(brush.default || 'line')) fail('unknown brush ' + brush.default);
  for (const [family, name] of Object.entries(brush.byFamily || {})) {
    if (!ARCHETYPES.includes(family)) fail('unknown archetype in brush map ' + family);
    if (!names.includes(name)) fail('unknown brush ' + name);
    const supported = REGISTRY[name].families || [];
    if (!supported.includes('*') && !supported.includes(family)) fail('brush ' + name + ' 不支持 ' + family);
  }
  for (const [name, params] of Object.entries(brush.params || {})) {
    if (!names.includes(name)) fail('params for unknown brush ' + name);
    const declared = REGISTRY[name].params || {};
    for (const [key, value] of Object.entries(params)) {
      if (!(key in declared)) fail('brush ' + name + ' 未登记参数 ' + key);
      if (typeof value === 'number' && !Number.isFinite(value)) fail('brush param ' + key + ' 不是有限数字');
      if (typeof value === 'number' && value <= 0 && key !== 'shadow') fail('brush param ' + key + ' 必须为正');
    }
  }
  // 笔触决定字体的尺寸单位（像素字体只能取 12 的倍数），角色字号必须跟着走。
  const brushNames = [brush.default || 'line', ...Object.values(brush.byFamily || {})];
  for (const name of new Set(brushNames)) {
    const unit = REGISTRY[name]?.fontUnit;
    if (!unit || unit <= 1) continue;
    for (const role of theme.scale)
      if (role.size % unit !== 0) fail(`笔触 ${name} 要求字号是 ${unit} 的倍数，角色 ${role.role} 是 ${role.size}`);
  }
  return { ...theme, materials, brush };
}
