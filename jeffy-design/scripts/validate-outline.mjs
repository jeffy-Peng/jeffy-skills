// 提纲前置校验：每页必须有可回答的问题与结论，素材必须能自动组装。
// 用法 node scripts/validate-outline.mjs outline.json [capability.json]
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [input, capPath] = process.argv.slice(2);
if (!input) throw Error('用法 node scripts/validate-outline.mjs outline.json [capability.json]');

const deck = JSON.parse(readFileSync(input, 'utf8'));
const capability = JSON.parse(readFileSync(capPath || resolve(root, 'assets/capability.json'), 'utf8'));
const generated = JSON.parse(readFileSync(resolve(root, 'build/generated/materials.json'), 'utf8'));
for (const m of generated)
  if (capability[m.id]) {
    capability[m.id].shape = m.shape;
    capability[m.id].tier = m.tier;
  }
const problems = [];
const required = ['id', 'title', 'question', 'claim', 'readingOrder', 'speakerNotes', 'source'];
const DELIVERABLES = ['chart', 'deck', 'report'];
const deliverable = deck.deliverable || 'chart';
if (!DELIVERABLES.includes(deliverable))
  problems.push({ code: 'CONTENT', message: '交付形式只能是 ' + DELIVERABLES.join(' / ') });

if (!Array.isArray(deck.pages) || !deck.pages.length) problems.push({ code: 'CONTENT', message: '没有页面' });
for (const [index, page] of (deck.pages || []).entries()) {
  const label = page.id || `第${index + 1}页`;
  for (const key of required) {
    const value = page[key];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && !value.length);
    if (empty)
      problems.push({
        code: key === 'question' || key === 'claim' ? 'CONTENT' : 'CONTRACT',
        page: label,
        message: `缺少 ${key}`,
      });
  }
  for (const component of page.components || []) {
    const entry = capability[component.material];
    if (!entry)
      problems.push({ code: 'UNSUPPORTED', page: label, material: component.material, message: '素材未登记' });
    else if (entry.capability !== 'assemble')
      problems.push({
        code: 'UNSUPPORTED',
        page: label,
        material: component.material,
        message: '仅规范，无自动适配器，需要按规范手绘或换素材',
      });
    // 选型理由必填；用后备时还要说明主力为何不适配。
    const reason = String(component.reason || '').trim();
    if (!reason)
      problems.push({ code: 'CONTENT', page: label, material: component.material, message: '缺少选型理由（reason）' });
    else if (entry && entry.tier && entry.tier !== 'primary' && reason.length < 12)
      problems.push({
        code: 'CONTENT',
        page: label,
        material: component.material,
        message: '后备素材要写清主力为何不适配',
      });
    // 页面声明了数据形状时，素材形状必须对得上。
    if (page.shape && entry && entry.shape && entry.shape !== page.shape)
      problems.push({
        code: 'CONTENT',
        page: label,
        material: component.material,
        message: `数据形状不符：页面 ${page.shape}，素材 ${entry.shape}`,
      });
  }
}
const assemble = Object.values(capability).filter((x) => x.capability === 'assemble').length;
if (problems.length) {
  console.error(JSON.stringify({ ok: false, problems }, null, 2));
  console.error(`可自动组装的素材 ${assemble} 项，共登记 ${Object.keys(capability).length} 项。`);
  process.exitCode = 1;
} else {
  console.log(`提纲通过：${deck.pages.length} 页，全部素材可自动组装（共 ${assemble} 项可用）。`);
}
