// 从 contract.json 生成规则清单，写进 docs/素材规则.md 的「规则清单」段。
// 手写正文保留，只有这张表由脚本维护，避免条数和状态漂移。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(resolve(root, 'lib/composition/contract.json'), 'utf8'));
const docPath = resolve(root, 'docs/素材规则.md');
const doc = readFileSync(docPath, 'utf8');

const checked = contract.rules.filter((r) => r.checked).length;
const rows = contract.rules.map((r) => `| ${r.id} | ${r.rule} | ${r.checked ? '有' : '—'} |`).join('\n');

const table = [
  '<!-- gen-rules:start 由 scripts/gen-rules.mjs 生成，不要手改 -->',
  `共 ${contract.rules.length} 条，其中 ${checked} 条有脚本自动检查。没打勾的只有文档约束，验收靠人看。`,
  '',
  '| 编号 | 规则 | 自动检查 |',
  '| --- | --- | --- |',
  rows,
  '<!-- gen-rules:end -->',
].join('\n');

const start = '<!-- gen-rules:start';
const end = '<!-- gen-rules:end -->';
let next;
if (doc.includes(start)) {
  const a = doc.indexOf(start);
  const b = doc.indexOf(end) + end.length;
  next = doc.slice(0, a) + table + doc.slice(b);
} else {
  const anchor = doc.indexOf('\n## ');
  next = anchor === -1 ? doc + '\n\n' + table + '\n' : doc.slice(0, anchor) + '\n\n' + table + '\n' + doc.slice(anchor);
}
writeFileSync(docPath, next);
console.log(`规则清单已写入：${contract.rules.length} 条，其中 ${checked} 条有自动检查`);
