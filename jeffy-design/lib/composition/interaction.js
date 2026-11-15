// 全局交互：悬停聚焦。规则见 docs/交互规则.md。
// 约定：图形带 data-focus-key；它的标签带 data-label-for 或 data-node-title。
// 连线与流带带 data-link-from / data-link-to 指向两端节点的键。
// 不出提示框：信息由图上标签承担，悬停只负责「谁被突出、谁退后」。
(() => {
  window.interactionReady = false;
  if (new URLSearchParams(location.search).get('static') === '1') return; // 导出与基线比较跳过交互
  const theme = (window.compositionInput && window.compositionInput.theme) || {};
  const t = theme.materials || {};
  const shapeDim = Number.isFinite(t.shapeDimOpacity) ? t.shapeDimOpacity : 0.45;
  const labelDim = Number.isFinite(t.labelDimOpacity) ? t.labelDimOpacity : 0.35;
  const ease = (Number.isFinite(t.interactMs) ? t.interactMs : 160) + 'ms';

  // 文字与图例不接收指针事件，否则会挡住图形，命中不到下面的形状。
  const style = document.createElement('style');
  style.textContent =
    '.jd-component text,.jd-component .jd-legend{pointer-events:none}' +
    `.jd-component [data-focus-key]{cursor:pointer;transition:opacity ${ease} ease}` +
    `.jd-component text{transition:opacity ${ease} ease}` +
    '@media(prefers-reduced-motion:reduce){.jd-component [data-focus-key],.jd-component text{transition:none!important}}' +
    '@media print{.jd-component [data-focus-key],.jd-component [data-label-for],.jd-component [data-node-title]{opacity:1!important}}';
  document.head.appendChild(style);

  let active = null,
    pinned = null;
  const keyed = (host) =>
    [...host.querySelectorAll('[data-focus-key]')].map((n) => ({ node: n, key: n.getAttribute('data-focus-key') }));
  const labelsOf = (host) =>
    [...host.querySelectorAll('[data-label-for],[data-node-title]')].map((n) => ({
      node: n,
      key: n.dataset.labelFor || (n.dataset.nodeTitle ? 'node' + n.dataset.nodeTitle : null),
    }));

  // 相关：自身、连线的两端、节点与它相连的线。
  const endsOf = (node) => [node.getAttribute('data-link-from'), node.getAttribute('data-link-to')].filter(Boolean);
  const related = (a, b) => {
    if (!a || !b) return false;
    if (a.key && b.key && a.key === b.key) return true;
    const ae = endsOf(a.node),
      be = endsOf(b.node);
    return ae.includes(b.key) || be.includes(a.key);
  };

  function paint(host, focus) {
    const shapes = keyed(host),
      labels = labelsOf(host),
      on = focus ? shapes.find((s) => s.key === focus) : null;
    for (const s of shapes) s.node.style.opacity = !focus || related(s, on) ? 1 : shapeDim;
    const byKey = new Map(shapes.map((s) => [s.key, s]));
    for (const l of labels) l.node.style.opacity = !focus || related(byKey.get(l.key), on) ? 1 : labelDim;
  }

  function activate(host, key) {
    if (active && active.host !== host) paint(active.host, null);
    active = { host, key };
    paint(host, key);
  }
  function reset() {
    if (active) paint(active.host, null);
    active = pinned = null;
    document.querySelectorAll('.jd-component [aria-pressed]').forEach((n) => n.setAttribute('aria-pressed', 'false'));
  }
  function toggle(host, key) {
    if (pinned?.host === host && pinned.key === key) return reset();
    reset();
    pinned = { host, key };
    activate(host, key);
    host
      .querySelectorAll('[data-focus-key]')
      .forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.focusKey === key)));
  }
  function bind(host) {
    for (const { node: n, key } of keyed(host)) {
      n.setAttribute('tabindex', '0');
      n.setAttribute('aria-label', n.dataset.focusLabel || key);
      n.setAttribute('aria-pressed', 'false');
      n.addEventListener('mouseenter', () => {
        if (!pinned) activate(host, key);
      });
      n.addEventListener('mouseleave', () => {
        if (!pinned && document.activeElement !== n) reset();
      });
      n.addEventListener('focus', () => {
        if (pinned && (pinned.host !== host || pinned.key !== key)) reset();
        activate(host, key);
      });
      n.addEventListener('blur', () => {
        if (!pinned) reset();
      });
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle(host, key);
      });
      n.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle(host, key);
        }
      });
    }
  }
  document.addEventListener('click', reset);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') reset();
  });

  const start = () => {
    document.querySelectorAll('.jd-component').forEach((h) => keyed(h).length && bind(h));
    window.interactionReady = true;
  };
  if (window.renderComplete) start();
  else {
    const timer = setInterval(() => {
      if (window.renderComplete) {
        clearInterval(timer);
        start();
      }
    }, 80);
  }
})();
