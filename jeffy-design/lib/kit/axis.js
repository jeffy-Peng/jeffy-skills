// 轴与绘图区：一处算位置、画网格、刻度、轴线与单位。几何只拿回 left/right/top/bottom/coord。
window.KitAxis = {
  frame(p, opts) {
    const { width: W, height: H, labels, range, metric, unit, horizontal = false, legend = [], fail, num } = opts;
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
    if (horizontal) left = Math.max(left, Math.max(...labels.map((x) => p.measure(x))) + pad * 2);
    if (right - left < 100 || bottom - top < 70) fail('CAPACITY', '数轴与标签所需空间超过目标区域');
    const coord = (v) =>
      horizontal
        ? left + ((v - range.min) / (range.max - range.min)) * (right - left)
        : bottom - ((v - range.min) / (range.max - range.min)) * (bottom - top);
    const showGrid = p.tokens.grid !== false;
    for (let v = range.min, i = 0; v <= range.max + range.step * 0.01; v += range.step, i++) {
      const a = coord(v);
      // 网格可整体关闭；竖向柱只画横线，横向柱只画竖线，另一条由轴线承担。
      if (showGrid) p.line('grid' + i, horizontal ? `M${a} ${top}V${bottom}` : `M${left} ${a}H${right}`, 'line');
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
      // 轴线形状取自素材原画法 bar.js：横轴右端小箭头，纵轴顶端小箭头。
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
