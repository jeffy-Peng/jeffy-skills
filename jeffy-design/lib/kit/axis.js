// 轴与绘图区：一处算位置、画网格、刻度、轴线与单位。几何只拿回 left/right/top/bottom/coord。
window.KitAxis = {
  // 二维轴：四象限、散点这类两维图共用。刻度、轴名、单位与一维版同一套规则。
  frame2d(p, opts) {
    const { width: W, height: H, xRange, yRange, xLabel, yLabel, unit, num } = opts;
    const bare = (p.tokens.axisMode || 'auto') === 'none';
    const pad = p.tokens.padding,
      gap = p.tokens.gap,
      tickSize = p.roles.axis.size,
      steps = (r) => {
        const out = [];
        for (let v = r.min; v <= r.max + r.step * 0.01; v += r.step) out.push(v);
        return out;
      },
      xt = steps(xRange),
      yt = steps(yRange),
      yw = Math.max(...yt.map((v) => p.measure(num(v)))),
      left = pad + (bare ? 0 : yw + gap * 1.4),
      right = W - pad,
      top = pad + (yLabel ? tickSize * 1.6 : 0),
      bottom = H - pad - tickSize * 1.8 - (xLabel ? tickSize * 1.7 : 0),
      X = (v) => left + ((v - xRange.min) / (xRange.max - xRange.min)) * (right - left),
      Y = (v) => bottom - ((v - yRange.min) / (yRange.max - yRange.min)) * (bottom - top);
    if (!bare) {
      xt.forEach((v) => p.text(X(v), bottom + tickSize * 1.2, num(v), 'axis', 'middle'));
      yt.forEach((v) => p.text(left - gap * 0.7, Y(v), num(v), 'axis', 'end'));
      p.add('path', {
        d: `M${left} ${top}V${bottom}H${right}`,
        fill: 'none',
        stroke: p.color('ink'),
        'stroke-width': p.theme?.rules?.axisWidthPx || p.theme?.rules?.dividerWidthPx || 1,
      });
    }
    if (xLabel) p.text(right, bottom + tickSize * 2.6, xLabel, 'unit', 'end');
    if (yLabel) p.text(left, top - tickSize * 0.9, yLabel, 'unit', 'start');
    if (unit) p.text(right, top - tickSize * 0.9, unit, 'unit', 'end');
    return { left, right, top, bottom, X, Y };
  },
  frame(p, opts) {
    const { width: W, height: H, labels, range, metric, unit, horizontal = false, legend = [], fail, num } = opts;
    // axisMode: none 表示不出轴线、刻度与刻度值，只留类别标签与角落里的单位。
    const bare = (p.tokens.axisMode || 'auto') === 'none';
    const pad = p.tokens.padding,
      gap = p.tokens.gap,
      labelSize = p.roles.pill.size,
      legendH = legend.length ? labelSize * 2 + gap : 0,
      axisH = labelSize * 3 + gap;
    let left =
        pad +
        Math.max(
          ...Array.from({ length: Math.round((range.max - range.min) / range.step) + 1 }, (_, i) =>
            p.measure(num(range.min + i * range.step)),
          ),
        ) +
        labelSize * 2 +
        pad,
      right = W - pad - (p.tokens.axisPadPx || 35),
      top = pad + labelSize,
      bottom = H - axisH - legendH;
    if (bare && !horizontal) left = pad * 2;
    if (horizontal) left = Math.max(left, Math.max(...labels.map((x) => p.measure(x))) + pad * 2);
    if (right - left < 100 || bottom - top < 70) fail('CAPACITY', '数轴与标签所需空间超过目标区域');
    const coord = (v) =>
      horizontal
        ? left + ((v - range.min) / (range.max - range.min)) * (right - left)
        : bottom - ((v - range.min) / (range.max - range.min)) * (bottom - top);
    const ruler = opts.axisStyle === 'ruler';
    const showGrid = !bare && !ruler && p.tokens.grid !== false;
    for (let v = range.min, i = 0; v <= range.max + range.step * 0.01; v += range.step, i++) {
      const a = coord(v);
      // 网格可整体关闭；竖向柱只画横线，横向柱只画竖线，另一条由轴线承担。
      if (showGrid) p.line('grid' + i, horizontal ? `M${a} ${top}V${bottom}` : `M${left} ${a}H${right}`, 'line');
      if (!bare)
        p.text(
          horizontal ? a : left - gap,
          horizontal ? bottom + labelSize : a,
          num(v),
          'axis',
          horizontal ? 'middle' : 'end',
        );
    }
    // 轴线与单位延后到内容之后画，避免被柱子压住。
    const finish = () => {
      if (bare) {
        // 无轴：单位挪到右下角，不画轴线与刻度。
        window.KitUnit.label(p, { metric, unit, horizontal, right, bottom, top, pad, labelSize, bare: true });
        return;
      }
      if (ruler) {
        const span = range.max - range.min;
        const axisLength = horizontal ? right - left : bottom - top;
        const subdivisions = Math.max(1, Math.min(5, Math.floor((axisLength * range.step) / span / 7)));
        let d = horizontal ? `M${left} ${bottom}H${right}` : `M${left} ${top}V${bottom}`;
        const count = Math.round((span / range.step) * subdivisions);
        for (let i = 0; i <= count; i++) {
          const a = coord(range.min + (i * range.step) / subdivisions);
          const size = i % subdivisions === 0 ? 9 : 4;
          d += horizontal ? `M${a} ${bottom}v${size}` : `M${left} ${a}h-${size}`;
        }
        p.add('path', {
          d,
          fill: 'none',
          stroke: p.color('ink'),
          'stroke-width': p.theme?.rules?.axisWidthPx || 1.3,
          'data-axis-style': 'ruler',
        });
        window.KitUnit.label(p, { metric, unit, horizontal, right, bottom, top, pad, labelSize });
        return;
      }
      // 标准轴线形态：横轴右端外侧半箭头，纵轴顶端外侧半箭头。
      p.add('path', {
        d: `M${left} ${top}V${bottom}H${right}h8l-4 3 M${left} ${top}v-8l-3 4`,
        fill: 'none',
        stroke: p.color('ink'),
        'stroke-width': p.theme?.rules?.axisWidthPx || 1.3,
      });
      // 刻度短线一律朝内：数值轴画在轴内侧 4 像素，类别轴也各给一小段。
      let ticks = '';
      for (let v = range.min; v <= range.max + range.step * 0.01; v += range.step) {
        const a = coord(v);
        ticks += horizontal ? `M${a} ${bottom}V${bottom - 4}` : `M${left} ${a}H${left + 4}`;
      }
      const slot = (right - left) / labels.length;
      labels.forEach((_, i) => {
        const c = left + (i + 0.5) * slot;
        ticks += horizontal ? `M${left} ${c}H${left + 4}` : `M${c} ${bottom}V${bottom - 4}`;
      });
      p.add('path', {
        d: ticks,
        fill: 'none',
        stroke: p.color('ink'),
        'stroke-width': p.theme?.rules?.axisWidthPx || 1.3,
      });
      window.KitUnit.label(p, { metric, unit, horizontal, right, bottom, top, pad, labelSize });
    };
    if (legend.length) {
      window.KitLegend.draw(p, legend, {
        left,
        right,
        y: H - labelSize,
        lineHeight: labelSize * 1.6,
        gap: gap * 2,
        fail,
      });
    }
    return { left, right, top, bottom, coord, finish };
  },
};
