// 液态玻璃笔触：让玻璃面「压」在背景上，靠边缘折射、内侧暗边、镜面高光和柔和投影出体积。
// 只负责落笔；扇区角度和位置仍由 renderers.js 算。
window.GlassBrush = {
  create(svg, theme, params = {}) {
    const p = ThemeDrawing.create(svg, theme);
    const ns = 'http://www.w3.org/2000/svg';
    const g = theme.glass || {};
    const tint = g.tintAlpha ?? 0.32; // 玻璃本体有多透
    const rim = g.rimPx ?? 1.6; // 外圈亮边
    const spec = g.specularAlpha ?? 0.6; // 镜面高光
    const inner = g.innerShadow ?? 0.16; // 内侧暗边，制造厚度
    const shadow = g.shadowBlurPx ?? 26;

    const mk = (tag, attrs) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = `
      <linearGradient id="lgGloss" x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="${spec}"/>
        <stop offset="0.38" stop-color="#FFFFFF" stop-opacity="0.10"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="lgSpec" cx="0.32" cy="0.22" r="0.55">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="${(spec * 0.9).toFixed(2)}"/>
        <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.06"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <filter id="lgShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="${shadow / 2}" flood-color="#0B1B33" flood-opacity="0.20"/>
      </filter>
      <filter id="lgGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.2"/>
      </filter>`;
    svg.append(defs);

    // 玻璃本体：颜色只上很薄一层，真正的体积来自边缘与高光。
    p.slicePaint = (i) => ({
      fill: p.color(p.series(i)),
      'fill-opacity': String(tint),
      stroke: 'none',
      filter: 'url(#lgShadow)',
    });

    // 扇区的三层叠加：外亮边、内侧暗边、镜面高光。
    p.sliceHighlight = (path) => {
      const wrap = p.add('g', {});
      const a = mk('path', { d: path, fill: 'url(#lgSpec)' });
      const b = mk('path', { d: path, fill: 'url(#lgGloss)' });
      const c = mk('path', {
        d: path,
        fill: 'none',
        stroke: p.color('ink'),
        'stroke-opacity': String(inner),
        'stroke-width': '3',
        filter: 'url(#lgGlow)',
      });
      const d = mk('path', {
        d: path,
        fill: 'none',
        stroke: '#FFFFFF',
        'stroke-opacity': '0.9',
        'stroke-width': String(rim),
      });
      wrap.append(a, b, c, d);
    };

    return p;
  },
};
