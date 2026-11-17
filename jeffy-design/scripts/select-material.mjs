// 素材选型：按数据形状与意图给出候选，并说明为什么排除别的。
// 用法 node scripts/select-material.mjs <数据.json> [--intent 比较|构成|趋势|时间|关系|流程|表格]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(resolve(root, 'assets/catalog.json'), 'utf8')).entries;
const cap = JSON.parse(readFileSync(resolve(root, 'assets/capability.json'), 'utf8'));
const byId = Object.fromEntries(catalog.map((e) => [e.id, e]));

const file = process.argv[2];
if (!file) {
  console.error('用法：node scripts/select-material.mjs <数据.json> [--intent 比较|构成|趋势|时间|关系|流程|表格]');
  process.exit(2);
}
const intentArg = process.argv.find((a) => a.startsWith('--intent'));
const intent = intentArg ? intentArg.split('=')[1] || process.argv[process.argv.indexOf(intentArg) + 1] : null;
const input = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
const d = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : input;

const has = (...keys) => keys.every((k) => k in d);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const values = (() => {
  if (Array.isArray(d.data) && d.data.every((r) => 'value' in r)) return d.data.map((r) => r.value);
  if (Array.isArray(d.data) && d.data.every((r) => Array.isArray(r.values))) return d.data.flatMap((r) => r.values);
  if (Array.isArray(d.points) && d.points.every((p) => isNum(p.y))) return d.points.map((p) => p.y);
  return [];
})();

const candidates = [];
const add = (id, score, why) => {
  if (!byId[id]) return;
  candidates.push({ id, score, why, meta: byId[id], cap: cap[id]?.capability });
};

// 数据形状优先，命中即高分
if (has('stages')) add('FUNNEL-001', 100, '有阶段数据；需核对是否同口径连续转化');
if (has('left', 'right', 'links')) add('SANKEY-001', 100, '有左右节点与连线，是流向数据');
if (has('rows', 'cols', 'values')) add('HEAT-001', 100, '有行列表头与数值矩阵');
if (has('layers')) add('REL-004', 100, '有 layers，是分层结构');
if (Array.isArray(d.groups) && d.groups.every((g) => 'q1' in g && 'median' in g))
  add('BOX-001', 100, 'groups 带四分位与中位，是五数概括');
if (Array.isArray(d.axes)) add('RADAR-001', 100, '有 axes，是多维评分');
if (has('name', 'items') && Array.isArray(d.items)) add('REL-003', 100, '有范围名与内部模块，是包含关系');
if (Array.isArray(d.nodes) && Array.isArray(d.edges)) {
  const flowish = intent === '流程' || d.nodes.some((e) => ['start', 'decision', 'end'].includes(e.type));
  add(flowish ? 'FLOW-001' : 'REL-006', 95, flowish ? '节点带起止与判断，是流程' : '节点与连线，是关系网络');
}
if (Array.isArray(d.points) && d.points.every((p) => isNum(p.x) && isNum(p.y)))
  add(
    has('boundary') ? 'MATRIX-001' : 'SCATTER-001',
    95,
    has('boundary') ? '有点坐标与分界值，是四象限' : '有点坐标，是二维分布',
  );
if (Array.isArray(d.data) && d.data.every((r) => r.start !== undefined && r.end !== undefined))
  add('TIME-002', 95, '每行有起止，是时间跨度');

// 柱族细分
if (values.length) {
  const neg = values.some((v) => v < 0);
  const twoSeriesWithTarget = Array.isArray(d.series) && d.series.length === 2 && /目标/.test(d.series.join(''));
  if (neg) add('BAR-005', 90, '数据含负值，零基线必须画出来');
  else if (twoSeriesWithTarget) add('BAR-007', 90, '两个系列里第二个是目标值');
  else if (Array.isArray(d.data) && d.data.every((r) => Array.isArray(r.values) && r.values.length > 1))
    add('BAR-002', 80, '同一类别多组数值，适合并排');
  else add('BAR-001', 70, '一组类别一组数值');
}

// 构成
if (Array.isArray(d.data) && d.data.every((r) => 'value' in r)) {
  if (d.data.some((r) => 'intensity' in r)) add('PIE-002', 90, '每项还带强度，是双编码');
  else if (intent === '构成' || d.partOfWhole === true)
    add('PIE-001', 75, '构成候选；须确认类别互斥、可相加且整体完整');
}

// 序列与表格
if (Array.isArray(d.series) && Array.isArray(d.labels)) add('LINE-001', 85, '有连续标签与系列，是趋势');
if (Array.isArray(d.rows) && !('cols' in d)) add('TABLE-001', 60, '行记录，适合明细表');

// 意图加权
const INTENT = {
  比较: ['BAR-001', 'BAR-002', 'BAR-003', 'BAR-005', 'BAR-007'],
  构成: ['PIE-001', 'PIE-002'],
  趋势: ['LINE-001'],
  时间: ['TIME-001', 'TIME-002'],
  关系: ['REL-001', 'REL-003', 'REL-004', 'REL-006', 'MATRIX-001', 'SCATTER-001'],
  流程: ['FLOW-001', 'FUNNEL-001', 'SANKEY-001'],
  表格: ['TABLE-001', 'TABLE-002', 'HEAT-001'],
};
if (intent && INTENT[intent]) for (const c of candidates) if (INTENT[intent].includes(c.id)) c.score += 10;

candidates.sort((a, b) => b.score - a.score);
const top = candidates[0];
// Context comes from page planning, not inferred from palette names or row counts.
const selection = input.selection || {};
for (const [key, allowed] of Object.entries({
  presentation: ['research', 'creative'],
  space: ['compact', 'ample'],
  priority: ['precision', 'visual', 'balanced'],
}))
  if (selection[key] !== undefined && !allowed.includes(selection[key])) throw Error('SELECTION: invalid ' + key);
function chooseForm(candidate) {
  if (!candidate) return null;
  const forms = candidate.meta.variants || [];
  if (!forms.length)
    return selection.form
      ? {
          status: 'review',
          selected: null,
          options: null,
          why: '该素材未登记指定形态，读取规范判断，不静默套用。',
          candidates: [],
        }
      : {
          status: 'standard',
          selected: null,
          options: {},
          why: '该素材没有独立形态列表，沿用表达规范。',
          candidates: [],
        };
  const candidates = forms.map((f) => ({
    key: f.key,
    name: f.name,
    useWhen: f.useWhen,
    avoidWhen: f.avoidWhen,
    sample: f.sample,
  }));
  const review = (why) => ({ status: 'review', selected: null, options: null, why, candidates });
  if (
    candidate.id === 'BAR-001' &&
    (!Array.isArray(d.data) ||
      !d.data.length ||
      !d.data.every((row) => {
        const vals = Array.isArray(row.values) ? row.values : [row.value];
        return vals.length === 1 && vals.every((v) => isNum(v) && v >= 0);
      }))
  )
    return review('数据不满足单系列非负有限数值要求，先修正数据或更换素材。');
  const fallback = forms.find((f) => f.default);
  let form;
  let why;
  if (selection.form) {
    form = forms.find((f) => f.key === selection.form);
    if (!form) return review('指定形态未登记在当前素材中，不能静默替换。');
    why = '用户明确指定，优先于用途的软性偏好。';
  } else {
    form =
      selection.priority !== 'precision' && selection.presentation
        ? forms.find(
            (f) =>
              f.presentations.includes(selection.presentation) && (f.space === 'any' || selection.space === f.space),
          )
        : null;
    form ||= fallback;
    why =
      form === fallback
        ? '未满足其他形态的适用条件，采用默认形态保证读数。'
        : '用途与可用空间匹配该形态，且未要求精确读数优先。';
  }
  if (form.space !== 'any' && selection.space !== form.space)
    return review('该形态需要充裕空间；请先判断或调整本页区域，再作选择。');
  if (!form.default && selection.priority === 'precision')
    return review('指定形态与精确读数优先存在冲突，需结合实际画面判断或调整表达。');
  return {
    status: 'selected',
    selected: form.key,
    name: form.name,
    options: { kind: form.optionKind },
    why,
    candidates,
  };
}
const formChoice = chooseForm(top);
const out = {
  intent: intent || '(未指定)',
  boundary: '字段只用于召回候选，不证明互斥、连续、因果或可加性；最终依据内容与口径判断。',
  dataShape: has('stages')
    ? 'funnel'
    : has('layers')
      ? 'layers'
      : has('left', 'links')
        ? 'sankey'
        : has('rows', 'cols')
          ? 'heatmap'
          : Array.isArray(d.points)
            ? has('boundary')
              ? 'quadrant'
              : 'scatter'
            : Array.isArray(d.data)
              ? 'records'
              : 'unknown',
  推荐: top
    ? {
        id: top.id,
        name: top.meta?.purpose || '',
        why: top.why,
        encoding: top.meta?.encoding,
        readingTime: top.meta?.readingTime,
        capability: top.cap,
      }
    : null,
  其余候选: candidates.slice(1, 4).map((c) => ({ id: c.id, why: c.why })),
  形态选择: formChoice,
  替代: top ? top.meta?.alternates || [] : [],
};
console.log(JSON.stringify(out, null, 2));
