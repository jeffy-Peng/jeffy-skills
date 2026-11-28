// All typography and paint is resolved here. Renderers supply semantics and geometry.
window.ThemeDrawing = {
  async fonts(doc, theme) {
    await window.ThemeFontCheck.fonts(doc, theme);
  },
  create(svg, theme) {
    const doc = svg.ownerDocument,
      ns = 'http://www.w3.org/2000/svg',
      roles = Object.fromEntries(theme.scale.map((x) => [x.role, x])),
      tokens = theme.materials,
      ctx = doc.createElement('canvas').getContext('2d');
    const color = (role) => '#' + theme.colors[role];
    const family = (r) =>
      r.font === 'latin' ? `"${theme.fonts.latin}"` : `"${theme.fonts.latin}","${theme.fonts.ea}"`;
    function add(tag, a, value) {
      let n = doc.createElementNS(ns, tag);
      for (let [k, v] of Object.entries(a)) n.setAttribute(k, v);
      if (value !== undefined) n.textContent = value;
      svg.append(n);
      return n;
    }
    function text(x, y, value, role = 'pill', anchor = 'middle', extra = {}) {
      let r = roles[role];
      if (!r) throw Error('THEME: unknown role ' + role);
      return add(
        'text',
        {
          x,
          y,
          'data-theme-role': role,
          'text-anchor': anchor,
          'dominant-baseline': 'central',
          'font-family': family(r),
          'font-size': r.size,
          'font-weight': r.weight,
          'letter-spacing': r.tracking,
          fill: color(r.color),
          ...extra,
        },
        value,
      );
    }
    function measure(value, role = 'pill') {
      let r = roles[role];
      ctx.font = `${r.weight} ${r.size}px ${family(r)}`;
      let tracking = parseFloat(r.tracking) || 0;
      return ctx.measureText(String(value)).width + Math.max(0, String(value).length - 1) * tracking;
    }
    function wrap(value, width, role = 'pill') {
      if (width <= 0) throw Object.assign(Error('文字区域不足'), { code: 'CAPACITY' });
      let out = [],
        line = '';
      for (let c of String(value ?? '')) {
        if (measure(line + c, role) > width && line) {
          out.push(line);
          line = c;
        } else line += c;
      }
      if (line) out.push(line);
      return out;
    }
    function block(x, y, value, width, role = 'pill', anchor = 'start', extra = {}) {
      let ls = wrap(value, width, role),
        step = roles[role].size * roles[role].lineHeight;
      ls.forEach((line, i) => text(x, y + i * step, line, role, anchor, extra));
      return ls.length * step;
    }
    function line(id, d, role = 'line', extra = {}) {
      return add('path', {
        'data-shape-role': role,
        'data-key': id,
        d,
        fill: 'none',
        stroke: color(role),
        'stroke-width': theme.rules.dividerWidthPx,
        ...extra,
      });
    }
    function box(id, x, y, width, height, role = tokens.nodeFill, extra = {}) {
      return add('rect', {
        'data-shape-role': role,
        'data-key': id,
        x,
        y,
        width,
        height,
        rx: tokens.radius,
        fill: color(role),
        stroke: color('muted'),
        'stroke-width': theme.rules.dividerWidthPx,
        ...extra,
      });
    }
    function contrast(role) {
      return window.ThemeColor.preferDarkText(theme.colors[role], theme.colors.ink, theme.colors.paper)
        ? 'ink'
        : 'paper';
    }
    function series(i) {
      return ['accent', 'accent2', 'body', 'muted'][i % 4];
    }
    function legend(items, W, y) {
      const fail = (code, message) => {
        throw Object.assign(Error(message), { code });
      };
      return window.KitLegend.draw({ add, text, measure, box, line, tokens, color }, items, {
        left: tokens.padding,
        right: W - tokens.padding,
        y,
        lineHeight: roles.pill.size * 1.6,
        gap: tokens.gap * 2,
        role: 'pill',
        fail,
      });
    }

    return { svg, add, text, measure, wrap, block, line, box, color, contrast, series, legend, tokens, roles, theme };
  },
};
