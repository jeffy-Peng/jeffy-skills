// 从 catalog.json 与 adapters.json 生成素材 Catalog HTML、索引与引用核对记录；不改写能力表。
// 用法 node scripts/build-catalog.mjs [--check]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { PROJECT_ROOT, projectPath, readJson } from '../lib/constants.mjs';

const ASSETS = projectPath('assets');
const checkOnly = process.argv.includes('--check');

function escapeHtml(value, quote = false) {
  let out = String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  if (quote) out = out.replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
  return out;
}

function isFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function walkHtml(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkHtml(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out.sort();
}

function validateCatalog(data) {
  const entries = data?.entries;
  if (!Array.isArray(entries) || !entries.length) throw Error('CATALOG: entries must be nonempty');
  const seen = new Set();
  for (const e of entries) {
    const ident = e.id || '';
    if (!ident || seen.has(ident)) throw Error('CATALOG: duplicate or missing ID');
    seen.add(ident);
    for (const field of ['question', 'minimumInput', 'standard', 'status', 'limits', 'standardCoverage']) {
      if (typeof e[field] !== 'string' || !e[field].trim()) throw Error(`${ident}: missing ${field}`);
    }
    const standardFile = join(ASSETS, e.standard);
    const headings = isFile(standardFile)
      ? [
          ...readFileSync(standardFile, 'utf8')
            .replace(/^\uFEFF/, '')
            .matchAll(/^##+\s+(.+)$/gm),
        ].map((m) => m[1])
      : [];
    for (const terms of [['语义'], ['绘制'], ['可调整', '可重新设计'], ['验收']]) {
      if (!headings.some((h) => terms.some((term) => h.includes(term))))
        throw Error(`${ident}: standard missing rule section (${terms.join('/')})`);
    }
    if (!['engine', 'model'].includes(e.implementationRole))
      throw Error(`${ident}: implementationRole must be engine or model`);
    if (!Array.isArray(e.evidence))
      throw Error(`${ident}: evidence scope required; empty allowed for unverified draft`);
    const variants = e.variants || [];
    if (variants.length) {
      if (
        new Set(variants.map((v) => v.key)).size !== variants.length ||
        variants.filter((v) => v.default === true).length !== 1
      )
        throw Error(`${ident}: variants need unique keys and one default`);
      for (const v of variants) {
        if (
          !['key', 'name', 'optionKind', 'useWhen', 'avoidWhen', 'sample'].every(
            (k) => typeof v[k] === 'string' && v[k].trim(),
          )
        )
          throw Error(`${ident}: incomplete variant`);
        if (
          !Array.isArray(v.presentations) ||
          !v.presentations.length ||
          v.presentations.some((x) => !['research', 'creative'].includes(x)) ||
          !['any', 'ample'].includes(v.space)
        )
          throw Error(`${ident}: invalid variant conditions`);
      }
    }
    const paths = [e.standard, ...e.sources, ...e.evidence, ...variants.map((v) => v.sample)];
    for (const sample of e.sheets) {
      if (!sample.name || !sample.path || !(sample.rationale || '').trim())
        throw Error(`${ident}: sample requires name, path and rationale`);
      paths.push(sample.path);
    }
    for (const p of paths) {
      if (!isFile(join(ASSETS, p))) throw Error(`${ident}: missing resource ${p}`);
    }
  }
  return {
    entries: entries.length,
    standards: entries.length,
    sampleRationales: entries.reduce((sum, e) => sum + e.sheets.length, 0),
  };
}

function build() {
  const data = readJson('assets/catalog.json');
  const contract = validateCatalog(data);
  const adapters = readJson('lib/composition/adapters.json');
  const ids = data.entries.map((e) => e.id);
  if (ids.length !== new Set(ids).size) throw Error('重复素材 ID');

  const link = (path, name) => `<a href="${escapeHtml(path, true)}">${escapeHtml(name)}</a>`;
  const rows = [];
  const references = [];
  const missing = [];

  for (const e of data.entries) {
    for (const p of [
      ...e.sheets.map((s) => s.path),
      ...e.sources,
      ...e.evidence,
      ...(e.standard ? [e.standard] : []),
    ]) {
      references.push(p);
      if (!isFile(join(ASSETS, p))) missing.push(p);
    }
    const combo =
      e.id in adapters ? ['区域组装：theme-v1（跨主题、静态）'] : ['模型按规范绘制，通过 SVG artifact 接入统一验收'];
    const preview =
      '<b>' +
      link(e.standard, '先读表达规范') +
      '</b><br>' +
      e.sheets
        .map(
          (x) =>
            link(x.path, x.name) +
            (x.status ? `<small>${escapeHtml(x.status)}</small>` : '') +
            `<details><summary>设计理由</summary>${escapeHtml(x.rationale)}</details>`,
        )
        .join('<br>');
    const variantHtml = (e.variants || [])
      .map(
        (v) =>
          `<div class="variant" data-variant="${escapeHtml(v.key, true)}"><b>${escapeHtml(v.name)}${v.default ? ' · 默认' : ''}</b><br>` +
          `适用：${escapeHtml(v.useWhen)}<br>避免：${escapeHtml(v.avoidWhen)}<br>` +
          `<code>options.kind: ${escapeHtml(v.optionKind)}</code><br>${link(v.sample, '查看样张')}</div>`,
      )
      .join('');
    const source = e.sources.map((x) => link(x, basename(x))).join('<br>') || '无独立源件；读取规范或统一引擎实现';
    const evidence = e.evidence.map((x) => link(x, basename(x))).join('<br>') || '无独立验证记录；由模型按规范绘制';
    const aliases = e.aliases?.length ? '旧编号：' + e.aliases.join(', ') : '';
    const values = [
      `<b>${escapeHtml(e.id)}</b><small>${escapeHtml(aliases)}</small>`,
      escapeHtml(e.purpose),
      escapeHtml(e.form) + variantHtml,
      escapeHtml(e.question),
      escapeHtml(e.minimumInput),
      escapeHtml(e.parameters),
      `${preview}<details><summary>源件</summary>${source}</details>`,
      escapeHtml(e.status) +
        (e.implementationRole === 'engine' ? ' · 引擎实现' : ' · 模型绘制') +
        (e.approval ? `<small>${escapeHtml(e.approval.scope)}</small>` : ''),
      combo.map((x) => escapeHtml(x)).join('<br>'),
      `${evidence}<small>${escapeHtml(e.limits)}</small>`,
    ];
    rows.push(`<tr data-entry="${e.id}">${values.map((v) => `<td>${v}</td>`).join('')}</tr>`);
  }

  const counts = {
    entries: ids.length,
    drafts: data.entries.filter((e) => e.status.startsWith('草稿')).length,
    composition: ids.filter((id) => id in adapters).length,
    draftComposition: 0,
  };

  const css =
    '*{box-sizing:border-box}body{margin:32px;color:#222;background:#fff;font:15px/1.7 Georgia,"Noto Serif SC",serif}' +
    'h1{font-size:30px;font-weight:400;margin-bottom:8px}p{max-width:1150px}' +
    '.summary{display:flex;gap:28px;flex-wrap:wrap;padding:14px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd}' +
    'input{font:inherit;border:1px solid #aaa;padding:10px 14px;width:470px;max-width:100%;margin:20px 0}' +
    '.scroll{overflow:auto;max-height:78vh;border:1px solid #ddd}' +
    'table{border-collapse:separate;border-spacing:0;min-width:2100px;width:100%;table-layout:fixed}' +
    'th,td{text-align:center;vertical-align:middle;padding:13px 10px;border-right:1px solid #eee;border-bottom:1px solid #ddd;overflow-wrap:anywhere}' +
    'th{position:sticky;top:0;background:#f3f3f3;z-index:2;font-weight:600}' +
    'th:first-child,td:first-child{position:sticky;left:0;background:white;z-index:1}th:first-child{z-index:3;background:#f3f3f3}' +
    'small{display:block;color:#666;font-size:12px;margin-top:8px}a{color:#222;text-underline-offset:3px}summary{cursor:pointer}' +
    'details{margin-top:8px}.variant{margin-top:14px;padding-top:12px;border-top:1px solid #ddd;text-align:left;font-size:13px;line-height:1.65}' +
    '.variant code{font-size:12px}tr[hidden]{display:none}.muted{color:#666}' +
    'col:nth-child(1){width:130px}col:nth-child(2){width:110px}col:nth-child(3){width:310px}col:nth-child(4){width:200px}' +
    'col:nth-child(5){width:220px}col:nth-child(6){width:200px}col:nth-child(7){width:190px}col:nth-child(8){width:180px}' +
    'col:nth-child(9){width:240px}col:nth-child(10){width:280px}';

  const headers = [
    '素材 ID',
    '一级用途',
    '表达类型与视觉形态',
    '适合解释什么',
    '最低输入',
    '常见变化（非结构上限）',
    '规范、样张与源件',
    '登记状态',
    '现有生成器能力',
    '验证证据与边界',
  ];
  const html =
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>素材 Catalog</title><style>${css}</style><h1>素材 Catalog · 简洁线条</h1>` +
    `<p>每行一类表达标准，先读规范，再按内容复用、局部修改或重绘。样张和代码均为参考；黑白灰基准，状态与生成器能力分别记录。</p>` +
    `<div class="summary"><span>${counts.entries} 个组件条目</span><span>${counts.drafts} 份未入库草稿</span><span>${counts.composition} 项接入区域组装</span></div>` +
    `<p class="muted">“旧验收待核对”表示原目录状态尚未形成统一结论，不等于新发现故障。历史验证记录不代表最新代码全部重验。所有条目默认展开；表格可横向滚动查看右侧能力与证据。</p>` +
    `<label>查找素材 <input id="search" type="search" placeholder="输入 ID、问题、形态或旧编号" aria-label="查找素材"></label><span id="count"></span>` +
    `<div class="scroll"><table><colgroup>${'<col>'.repeat(10)}</colgroup><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.join('')}</tbody></table></div>` +
    `<p>${link('catalog.json', '机器可读目录')} · ${link('catalog-audit.json', '文件与引用核对记录')} · ${link('../references/页面组装.md', '组装调用与验收规则')}</p>` +
    `<script>const rows=[...document.querySelectorAll("tbody tr")];const input=document.querySelector("#search");function update(){let q=input.value.trim().toLowerCase(),n=0;for(const r of rows){r.hidden=!r.textContent.toLowerCase().includes(q);if(!r.hidden)n++}document.querySelector("#count").textContent=n+" / "+rows.length+" 项"}input.addEventListener("input",update);update()</script></html>`;

  const indexMd = [
    '# Catalog · 素材目录',
    '',
    '[打开统一目录](index.html)。每行一类表达标准，按用途与形态检索。先读规范，再看样张理由及参考代码。生成器能力不约束本次结构；横纵、数量等常见参数不另算素材。',
    '',
    '条目来源为 materials/*.md，经 npm run sync 合并到 catalog.json；审批、行为证据和展示补充字段保留在目录中。HTML 由 npm run catalog（scripts/build-catalog.mjs）生成，不改写能力表。',
    '',
    '- 素材共同规则与新增登记要求见 [素材使用与维护](../references/素材使用与维护.md)。',
    '- 区域组装能力以 lib/composition/adapters.json 和 capability.json 为准；模型素材以 SVG artifact 接入。',
    '- 旧编号保留为别名，历史重定向与草稿文件保留，不重复登记。',
    '- 草稿明确未入库；旧状态不统一者待核对，不自动升级。',
    '- 已存验证记录只代表其覆盖范围；本轮目录整理不等于全库重新验收。',
    '',
    '[文件与引用核对记录](catalog-audit.json)；[页面组装与验收](../references/页面组装.md)。',
    '',
  ].join('\n');

  const registered = new Set(data.entries.flatMap((e) => e.sheets.map((s) => resolve(ASSETS, s.path))));
  const legacy = [];
  for (const file of walkHtml(ASSETS)) {
    if (basename(file) === 'index.html' || registered.has(resolve(file))) continue;
    const content = readFileSync(file, 'utf8');
    const m = /http-equiv="refresh"[^>]*content="[^"]*url=([^";]+)/i.exec(content);
    legacy.push({
      path: relative(ASSETS, file).replaceAll('\\', '/'),
      classification: m ? '历史跳转入口' : '未登记独立预览，需核对',
      target: m ? m[1] : null,
    });
  }

  const dependencies = [];
  for (const file of [...registered].sort()) {
    const content = readFileSync(file, 'utf8');
    for (const m of content.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      const src = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(src)) continue;
      const target = resolve(dirname(file), decodeURIComponent(src));
      const exists = isFile(target);
      dependencies.push({
        preview: relative(PROJECT_ROOT, file).replaceAll('\\', '/'),
        script: src,
        exists,
      });
      if (!exists) missing.push(target);
    }
  }

  const audit = {
    standardContract: contract,
    updated: data.updated,
    counts,
    referencesChecked: references.length,
    missing,
    dependencies,
    legacyPreviews: legacy,
    draftCopies: '同ID的历史草稿不重复登记；BAR-004并入BAR-002；TREE-001为REL-001方案文件。',
    scope: '文件、引用和登记核对；不代表全库数据、动效或语义回归',
  };
  if (missing.length) throw Error('引用缺失：' + JSON.stringify(missing));

  const targets = [
    [join(ASSETS, 'index.html'), html],
    [join(ASSETS, '索引.md'), indexMd],
    [join(ASSETS, 'catalog-audit.json'), JSON.stringify(audit, null, 2) + '\n'],
  ];

  let stale = 0;
  for (const [targetPath, nextText] of targets) {
    const current = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';
    if (current === nextText) continue;
    stale += 1;
    if (!checkOnly) writeFileSync(targetPath, nextText);
  }

  console.log(JSON.stringify(counts));
  console.log('References and preview dependencies valid');
  if (checkOnly && stale) {
    console.error(`目录产物与 catalog.json 不一致（${stale} 个文件），运行 npm run catalog 重新生成。`);
    process.exitCode = 1;
  }
}

build();
