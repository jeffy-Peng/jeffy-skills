// 从 contract.json 生成规则清单，写进 docs/素材规则.md 的「规则清单」段。
// 用法 node scripts/gen-rules.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadContract, PROJECT_ROOT } from '../lib/constants.mjs';

const checkOnly = process.argv.includes('--check');
const contract = loadContract();
const docPath = resolve(PROJECT_ROOT, 'docs/素材规则.md');
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

if (checkOnly) {
  if (next !== doc) {
    console.error('docs/素材规则.md 与 lib/composition/contract.json 不一致，运行 npm run gen:rules 重新生成。');
    process.exitCode = 1;
  } else {
    console.log(`规则清单一致：${contract.rules.length} 条，其中 ${checked} 条有自动检查`);
  }
} else {
  writeFileSync(docPath, next);
  console.log(`规则清单已写入：${contract.rules.length} 条，其中 ${checked} 条有自动检查`);
}
