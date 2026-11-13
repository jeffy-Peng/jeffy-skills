// 单位与量纲：只在轴端出现一次（R10）。竖向转 90 度放左侧，横向放末刻度下方右对齐。
window.KitUnit = {
  label(p, opts) {
    const { metric, unit, horizontal, right, bottom, top, pad, labelSize } = opts;
    const text = unit ? metric + ' / ' + unit : metric;
    if (horizontal) {
      p.text(right, bottom + labelSize * 2.6, text, 'unit', 'end');
    } else {
      const x = pad + labelSize / 2;
      const y = (top + bottom) / 2;
      p.text(x, y, text, 'unit', 'middle', { transform: `rotate(-90 ${x} ${y})` });
    }
  },
};
