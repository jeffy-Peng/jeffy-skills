// Shared legend layout for axes and free-standing charts.
window.KitLegend = {
  draw(p, items, opts) {
    const { left, right, y, lineHeight, gap, fail } = opts;
    const role = opts.role || 'legend';
    const sw = p.tokens.legendSwatchW,
      sh = p.tokens.legendSwatchH;
    const symbolW = Math.max(20, sw),
      labelGap = 6;
    const rows = [[]];
    let used = 0;
    for (const item of items) {
      const width = symbolW + labelGap + p.measure(item.name, role);
      if (width > right - left) fail('CAPACITY', '单项图例名称超出可用宽度');
      if (rows.at(-1).length && used + gap + width > right - left) {
        rows.push([]);
        used = 0;
      }
      if (rows.length > 2) fail('CAPACITY', '图例超过两行，需调整区域或表达');
      rows.at(-1).push({ item, width });
      used += (used ? gap : 0) + width;
    }
    const group = p.add('g', { 'data-unified-legend': 'true' });
    rows.forEach((row, index) => {
      const width = row.reduce((sum, c) => sum + c.width, 0) + gap * Math.max(0, row.length - 1);
      let x = left + (right - left - width) / 2;
      // Anchor the last row at y, keeping wrapped rows within the reserved bottom area.
      const cy = y - (rows.length - 1 - index) * lineHeight;
      for (const { item, width } of row) {
        const mark =
          item.type === 'bar'
            ? p.box('legend' + item.name, x, cy - sh / 2, sw, sh, item.paint, { stroke: 'none' })
            : p.line('legend' + item.name, `M${x} ${cy}h${symbolW}`, item.paint, {
                'stroke-dasharray': item.dash || '',
              });
        group.append(mark);
        group.append(p.text(x + symbolW + labelGap, cy, item.name, role, 'start'));
        x += width + gap;
      }
    });
    return group;
  },
};
