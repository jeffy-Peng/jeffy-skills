// 表格、矩阵与时间轴图表家族：表格、热力矩阵、时间线、甘特条。
window.ThemeRendererFamilies.tabular = (() => {
  const { fail, num, setup, rampColor } = window.ThemeRendererShared;

  function table(container, input, opt, theme) {
    if (
      !input.columns?.length ||
      !Array.isArray(input.rows) ||
      input.rows.some((r) => r.length !== input.columns.length)
    )
      fail('DATA', '表格列数不一致');
    const doc = container.ownerDocument,
      svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    doc.body.append(svg);
    const p = window.ThemeDrawing.create(svg, theme);
    const widths = input.columns.map((x, i) =>
        Math.max(
          75,
          Math.min(
            240,
            Math.max(p.measure(x, 'body'), ...input.rows.map((r) => p.measure(r[i] ?? '—', 'body'))) +
              2 * p.tokens.padding,
          ),
        ),
      ),
      minimum = widths.reduce((a, b) => a + b, 0);
    svg.remove();
    container.replaceChildren();
    const t = doc.createElement('table');
    t.dataset.nativeTheme = 'true';
    t.style.cssText = `width:100%;table-layout:fixed;border-collapse:collapse;color:${p.color('body')};font-size:${p.roles.body.size}px;line-height:${p.roles.body.lineHeight}`;
    container.append(t);
    const cg = doc.createElement('colgroup');
    t.append(cg);
    widths.forEach((w) => {
      const c = doc.createElement('col');
      c.style.width = (w / minimum) * 100 + '%';
      cg.append(c);
    });
    for (const [i, row] of [input.columns, ...input.rows].entries()) {
      const tr = doc.createElement('tr');
      t.append(tr);
      row.forEach((v, j) => {
        if (i) {
          tr.dataset.focusKey = 'row' + i;
          tr.dataset.focusLabel = String(row[0]) + ' ' + String(row.slice(1).find((cell) => cell !== null) ?? '');
          tr.style.transition = 'opacity 160ms ease';
        }
        const td = doc.createElement(i ? 'td' : 'th');
        td.style.cssText = `text-align:center;vertical-align:middle;padding:${p.tokens.padding / 2}px ${p.tokens.padding}px;border-bottom:${theme.rules.dividerWidthPx}px solid ${p.color('line')};font-weight:${i ? p.roles.body.weight : p.roles.cardTitle.weight};background:${p.color(!i || opt.focus === j ? 'soft' : 'paper')}`;
        td.textContent = v === null ? '—' : String(v);
        tr.append(td);
      });
    }
    if (input.note) {
      const n = doc.createElement('p');
      n.style.fontSize = p.roles.source.size + 'px';
      n.textContent = input.note;
      container.append(n);
    }
    return { minWidth: minimum, rows: input.rows.length, columns: input.columns.length };
  }

  function timeline(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    if (!input.events?.length) fail('DATA', '需要事件');
    const events = input.events.map((e) => ({ ...e, t: Date.parse(e.date) })).sort((a, b) => a.t - b.t);
    if (
      events.some((e) => !Number.isFinite(e.t) || !e.title) ||
      new Set(events.map((e) => e.id)).size !== events.length
    )
      fail('DATA', '日期、标题和ID需有效');
    const vertical = opt.direction === 'vertical',
      min = events[0].t,
      span = events.at(-1).t - min,
      pad = p.tokens.padding,
      labelW = Math.max(...events.map((e) => p.measure(e.date))),
      start = vertical ? pad + 25 : pad + labelW / 2,
      axis = vertical ? labelW + 2 * pad : box.height * 0.38;
    let end = vertical ? box.height - pad - 25 : box.width - pad - labelW / 2;
    if (vertical && opt.details) {
      const bodyHeight = Math.max(
        0,
        ...events.map((e) =>
          e.body
            ? p.wrap(e.body, box.width - axis - pad * 2, 'body').length * p.roles.body.size * p.roles.body.lineHeight
            : 0,
        ),
      );
      end = Math.min(end, box.height - pad - 30 - bodyHeight);
      if (end < start) fail('CAPACITY', '时间线说明超出可用高度');
    }
    p.line('time', vertical ? `M${axis} ${start}V${end}` : `M${start} ${axis}H${end}`, 'muted');
    events.forEach((e, i) => {
      const t = opt.spacing === 'equal' || span === 0 ? i / Math.max(1, events.length - 1) : (e.t - min) / span,
        v = start + (end - start) * t;
      p.add('circle', {
        'data-shape-role': 'node' + i,
        'data-focus-key': 'node' + i,
        'data-focus-label': e.date + ' ' + (e.title || ''),
        cx: vertical ? axis : v,
        cy: vertical ? v : axis,
        r: opt.focus === e.id ? 5 : 3.5,
        fill: p.color(opt.focus === e.id ? 'accent' : 'paper'),
        stroke: p.color('accent'),
      });
      const dLab = p.text(
        vertical ? axis - pad : v,
        vertical ? v : axis - 25,
        e.date,
        'pill',
        vertical ? 'end' : 'middle',
      );
      dLab.setAttribute('data-label-for', 'node' + i);
      const tLab = p.text(
        vertical ? axis + pad : v,
        vertical ? v : axis + 30,
        e.title,
        'cardTitle',
        vertical ? 'start' : 'middle',
      );
      tLab.setAttribute('data-label-for', 'node' + i);
      if (opt.details && e.body)
        p.block(
          vertical ? axis + pad : v,
          vertical ? v + 30 : axis + 58,
          e.body,
          vertical ? box.width - axis - pad * 2 : (end - start) / events.length - 10,
          'body',
          vertical ? 'start' : 'middle',
          { 'data-label-for': 'node' + i },
        );
    });
    return { events: events.length };
  }

  // 热力矩阵：单元格按值归一填色，缺失格留白（斜纹），行列表头在侧边。
  function heatmap(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const rows = input.rows || [],
      cols = input.cols || [],
      values = input.values || [],
      max = Number.isFinite(input.max) ? input.max : Math.max(...values.flat().filter((v) => Number.isFinite(v)), 1),
      min = Number.isFinite(input.min) ? input.min : 0;
    if (!rows.length || !cols.length || values.length !== rows.length)
      fail('DATA', '热力矩阵需要行列与同维度的数值矩阵');
    const pad = p.tokens.padding,
      nameW = p.tokens.labelGutterPx * 0.8,
      headH = p.roles.category.size * 2,
      left = pad + nameW,
      right = box.width - pad,
      top = pad + headH,
      bottom = box.height - pad,
      cellW = (right - left) / cols.length,
      cellH = (bottom - top) / rows.length,
      gap = Math.min(4, cellW * 0.06);
    cols.forEach((c, j) => p.text(left + (j + 0.5) * cellW, top - headH / 2, c, 'category', 'middle'));
    rows.forEach((r, i) => {
      p.text(left - p.tokens.gap, top + (i + 0.5) * cellH, r, 'category', 'end');
      cols.forEach((_, j) => {
        const v = values[i]?.[j],
          x = left + j * cellW,
          y = top + i * cellH;
        if (!Number.isFinite(v)) {
          // 缺失不是零：用虚线留白，与最浅一档区分。
          p.add('rect', {
            x,
            y,
            width: cellW - gap,
            height: cellH - gap,
            rx: 4,
            fill: p.color('paper'),
            stroke: p.color('line'),
            'stroke-width': theme.rules.dividerWidthPx,
            'stroke-dasharray': '3 4',
          });
          return;
        }
        const f = max > min ? (max - v) / (max - min) : 0,
          fill = rampColor(theme, f),
          light = window.ThemeColor.preferDarkText(fill, theme.colors.ink, theme.colors.paper);
        p.add('rect', {
          x,
          y,
          width: cellW - gap,
          height: cellH - gap,
          rx: 4,
          fill,
          'data-shape-role': 'cell' + i + '-' + j,
          'data-focus-key': 'cell' + i + '-' + j,
          'data-focus-label': r + ' · ' + cols[j] + ' ' + num(v),
        });
        if (opt.labels !== false)
          p.text(x + (cellW - gap) / 2, y + (cellH - gap) / 2, num(v), 'pill', 'middle', {
            fill: light ? p.color('ink') : p.color('paper'),
          }).setAttribute('data-label-for', 'cell' + i + '-' + j);
      });
    });
    return { rows: rows.length, cols: cols.length };
  }

  // 甘特条：每行一条时间跨度，横轴是时间刻度。
  function gantt(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const rows = input.rows || [];
    if (
      !rows.length ||
      rows.some((d) => !d.label || !Number.isFinite(d.start) || !Number.isFinite(d.end) || d.end < d.start)
    )
      fail('DATA', '甘特条需要行名与起止值');
    const pad = p.tokens.padding * 2,
      nameW = p.tokens.labelGutterPx,
      left = pad + nameW,
      right = box.width - pad,
      top = pad,
      bottom = box.height - pad - p.roles.axis.size * 2.6,
      lo = Math.min(...rows.map((d) => d.start)),
      hi = Math.max(...rows.map((d) => d.end)),
      X = (v) => left + ((v - lo) / (hi - lo || 1)) * (right - left),
      rowH = (bottom - top) / rows.length,
      barH = Math.min(rowH * 0.52, 26);
    for (const v of [lo, (lo + hi) / 2, hi])
      p.text(X(v), bottom + p.roles.axis.size * 1.2, num(+v.toFixed(v % 1 ? 1 : 0)), 'axis', 'middle');
    p.add('path', {
      d: `M${left} ${bottom}H${right}`,
      fill: 'none',
      stroke: p.color('ink'),
      'stroke-width': theme.rules.dividerWidthPx,
    });
    rows.forEach((d, i) => {
      const y = top + i * rowH + rowH / 2,
        x = X(d.start),
        w = Math.max(p.tokens.minBarPx, X(d.end) - X(d.start)),
        key = 'task' + i;
      p.text(left - p.tokens.gap, y, d.label, 'category', 'end');
      p.box(key, x, y - barH / 2, w, barH, p.series(0), {
        rx: Math.min(6, barH / 3),
        fill: rampColor(theme, (i / Math.max(rows.length - 1, 1)) * 0.6),
        'data-shape-role': key,
        'data-focus-key': key,
        'data-focus-label': d.label + ' ' + num(d.start) + '–' + num(d.end),
      });
      if (d.note) p.text(x + w + p.tokens.gap, y, d.note, 'unit', 'start');
    });
    if (input.unit) p.text(right, bottom + p.roles.axis.size * 2.6, input.unit, 'unit', 'end');
    return { rows: rows.length };
  }

  return { table, timeline, heatmap, gantt };
})();
