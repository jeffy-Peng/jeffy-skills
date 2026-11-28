// 极坐标与放射图表家族：饼/环图、双编码饼、雷达图。
window.ThemeRendererFamilies.polar = (() => {
  const { fail, num, setup, rampColor } = window.ThemeRendererShared;

  function pie(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    if (!input.data?.length || input.data.some((d) => !d.label || !Number.isFinite(d.value) || d.value < 0))
      fail('DATA', '占比图需要非负分项');
    const total = input.data.reduce((a, b) => a + b.value, 0);
    if (!total) {
      p.text(box.width / 2, box.height / 2, '无占比');
      return { total };
    }
    const rows =
      opt.sort && opt.sort !== 'given'
        ? [...input.data].sort((a, b) => (opt.sort === 'desc' ? b.value - a.value : a.value - b.value))
        : input.data;
    const cx = box.width / 2,
      cy = box.height / 2 - 20,
      R = Math.min(box.height * p.tokens.pieRadiusH, box.width * p.tokens.pieRadiusW),
      inner = opt.donut ? R * 0.6 : 0,
      legend = rows.map((d, i) => ({ name: `${d.label} ${num(d.value)}`, type: 'bar', paint: p.series(i) }));
    let angle = -Math.PI / 2;
    rows.forEach((d, i) => {
      if (!d.value) return;
      let end = angle + (d.value / total) * 2 * Math.PI;
      const pt = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
        a = pt(angle, R),
        c = pt(end, inner),
        z = pt(angle, inner);
      if (d.value === total) end -= 0.000001;
      const path =
        `M${a}A${R} ${R} 0 ${end - angle > Math.PI ? 1 : 0} 1 ${pt(end, R)}L${c}` +
        (inner ? `A${inner} ${inner} 0 ${end - angle > Math.PI ? 1 : 0} 0 ${z}` : `L${cx} ${cy}`) +
        'Z';
      p.add('path', {
        'data-shape-role': p.series(i),
        'data-focus-key': 'slice' + i,
        'data-focus-label':
          d.label + ' ' + (opt.percent === false ? num(d.value) : num(+((d.value / total) * 100).toFixed(1)) + '%'),
        d: path,
        fill: p.color(p.series(i)),
        stroke: p.color('paper'),
        'stroke-width': theme.rules.dividerWidthPx,
      });
      const mid = (angle + end) / 2,
        x = cx + Math.cos(mid) * (R + p.tokens.labelOffsetPx),
        y = cy + Math.sin(mid) * (R + p.tokens.labelOffsetPx);
      const labelNode = p.text(
        x,
        y,
        d.label + ' ' + (opt.percent === false ? num(d.value) : num(+((d.value / total) * 100).toFixed(1)) + '%'),
        'pill',
        Math.cos(mid) > 0 ? 'start' : 'end',
      );
      labelNode.setAttribute('data-label-for', 'slice' + i);
      angle = end;
    });
    if (inner) {
      p.text(cx, cy - p.tokens.centerGapPx, input.centerLabel || '合计');
      p.text(cx, cy + 15, num(total), 'cardTitle');
    }
    p.legend(legend, box.width, box.height - p.roles.pill.size);
    return { total };
  }

  // 双编码饼：角度读占比，半径读强度。扇瓣留缝做圆角，外圈内圈各一条虚线参考圈。
  function pieBigSlice(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const raw = input.data || [];
    if (
      !raw.length ||
      raw.some(
        (d) =>
          !d.label || !Number.isFinite(d.value) || d.value < 0 || !Number.isFinite(d.intensity) || d.intensity <= 0,
      )
    )
      fail('DATA', '双编码饼需要非负数值与正的强度');
    const total = raw.reduce((a, b) => a + b.value, 0);
    if (!total) {
      p.text(box.width / 2, box.height / 2, '无占比');
      return { total };
    }
    const data =
      opt.sort && opt.sort !== 'given'
        ? [...raw].sort((a, b) => (opt.sort === 'desc' ? b.value - a.value : a.value - b.value))
        : raw;
    const t = p.tokens,
      cx = box.width / 2,
      cy = box.height / 2 - 14,
      // 半径要给外侧标签留位置，否则标签顶出组件区域。
      R = Math.min(box.height * t.petalRadiusH, box.width * t.petalRadiusW, cy - (t.labelOffsetPx * 1.7 + 20)),
      rMin = R * t.petalMinRatio,
      rIn = Math.min(t.petalHolePx, rMin * 0.8),
      maxI = Math.max(...data.map((d) => d.intensity)),
      gap = (t.petalGapDeg * Math.PI) / 180,
      pt = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    // 明度跟占比走：最大的一块最深，按排序在主题明度阶梯两端之间线性插值。
    const order = data.map((d, i) => ({ i, v: d.value })).sort((a, b) => b.v - a.v),
      shade = {};
    order.forEach((r, k) => {
      const f = order.length > 1 ? k / (order.length - 1) : 0;
      shade[r.i] = rampColor(theme, f);
    });
    // 参考圈：外圈是半径标尺的上限，内圈给出最小半径的位置。
    for (const r of [R, R * t.petalRingRatio])
      p.add('circle', {
        cx,
        cy,
        r,
        fill: 'none',
        stroke: p.color('muted'),
        'stroke-width': t.petalRingWidthPx,
        'stroke-dasharray': t.petalRingDash,
      });
    let angle = -Math.PI / 2;
    data.forEach((d, i) => {
      const span = (d.value / total) * 2 * Math.PI,
        a0 = angle + gap / 2,
        a1 = angle + span - gap / 2,
        rOut = rMin + (R - rMin) * (d.intensity / maxI),
        [x0i, y0i] = pt(a0, rIn),
        [x1i, y1i] = pt(a1, rIn),
        [x1o, y1o] = pt(a1, rOut),
        [x0o, y0o] = pt(a0, rOut),
        large = span > Math.PI ? 1 : 0,
        path =
          `M${x0i} ${y0i}A${rIn} ${rIn} 0 ${large} 1 ${x1i} ${y1i}L${x1o} ${y1o}` +
          `A${rOut} ${rOut} 0 ${large} 0 ${x0o} ${y0o}Z`;
      p.add('path', {
        'data-shape-role': 'petal' + i,
        'data-focus-key': 'petal' + i,
        'data-focus-label':
          d.label +
          ' ' +
          num(+((d.value / total) * 100).toFixed(1)) +
          '%' +
          (opt.intensity === false ? '' : ' · ' + num(d.intensity)),
        d: path,
        fill: shade[i],
        stroke: shade[i],
        'stroke-width': t.petalCornerPx,
        'stroke-linejoin': 'round',
        'data-corner-role': 'petalCorner',
      });
      const mid = angle + span / 2,
        [lx, ly] = pt(mid, rOut + t.labelOffsetPx * 1.7),
        cos = Math.cos(mid),
        pct = num(+((d.value / total) * 100).toFixed(1));
      const labelNode = p.text(
        lx,
        ly,
        d.label + ' ' + pct + '%' + (opt.intensity === false ? '' : ' · ' + num(d.intensity)),
        'pill',
        cos > 0.12 ? 'start' : cos < -0.12 ? 'end' : 'middle',
      );
      labelNode.setAttribute('data-label-for', 'petal' + i);
      angle += span;
    });
    if (opt.center) p.text(cx, cy, input.centerLabel || '合计', 'pill');
    return { total };
  }

  // 雷达：轴数有上限，网格同心，值连成多边形。
  function radar(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const axes = input.axes || [];
    if (axes.length < 3 || axes.length > 8) fail('CAPACITY', '雷达轴数需在三到八之间');
    if (axes.some((a) => !a.name || !Number.isFinite(a.value))) fail('DATA', '雷达需要轴名与数值');
    const cx = box.width / 2,
      cy = box.height / 2,
      R = Math.min(box.height, box.width) * 0.34,
      max = Number.isFinite(input.max) ? input.max : Math.max(...axes.map((a) => a.value), 1),
      pt = (i, r) => {
        const a = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      };
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const d =
        axes
          .map((_, i) => pt(i, R * f))
          .map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`)
          .join('') + 'Z';
      p.add('path', { d, fill: 'none', stroke: p.color('line'), 'stroke-width': theme.rules.dividerWidthPx });
    }
    axes.forEach((a, i) => {
      const [x, y] = pt(i, R);
      p.add('path', {
        d: `M${cx} ${cy}L${x} ${y}`,
        fill: 'none',
        stroke: p.color('line'),
        'stroke-width': theme.rules.dividerWidthPx,
      });
      const [lx, ly] = pt(i, R + 22);
      const cos = Math.cos(-Math.PI / 2 + (i / axes.length) * Math.PI * 2);
      p.text(lx, ly, a.name, 'category', cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle');
    });
    const d =
      axes
        .map((a, i) => pt(i, (a.value / max) * R))
        .map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`)
        .join('') + 'Z';
    p.add('path', {
      d,
      fill: p.color('accent'),
      'fill-opacity': 0.16,
      stroke: p.color('accent'),
      'stroke-width': theme.rules.dividerWidthPx,
      'data-shape-role': 'radar',
    });
    axes.forEach((a, i) => {
      const [x, y] = pt(i, (a.value / max) * R);
      p.add('circle', {
        cx: x,
        cy: y,
        r: 3.5,
        fill: p.color('accent'),
        'data-shape-role': 'rp' + i,
        'data-focus-key': 'rp' + i,
        'data-focus-label': a.name + ' ' + num(a.value),
      });
    });
    return { axes: axes.length };
  }

  return { pie, pieBigSlice, radar };
})();
