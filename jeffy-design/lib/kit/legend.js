// 图例：全库唯一实现。规则见 docs/素材规则.md 的 R26 到 R30。
// 位置底部居中，符号与图形一致，项数等于系列数，不截断，超两行报容量。
window.KitLegend = {
  draw(p, items, opts) {
    const { left, right, y, lineHeight, gap, fail } = opts;
    const maxWidth = right - left;
    const symbolW = 20;
    const itemWidth = (item) => symbolW + 6 + p.measure(item.name, 'legend');
    const rows = [[]];
    let cursor = 0;
    let rowWidth = 0;
    for (const item of items) {
      const w = itemWidth(item);
      const space = rows.length > 1 ? gap : gap * 1.5;
      if (cursor > 0 && rowWidth + space + w > maxWidth) {
        rows.push([]);
        cursor = 0;
        rowWidth = 0;
        if (rows.length > 2) fail('CAPACITY', '图例超过两行，需减少系列或分页');
      }
      rows.at(-1).push({ item, width: w });
      rowWidth += (cursor > 0 ? space : 0) + w;
      cursor += 1;
    }
    const g = p.add('g', { 'data-unified-legend': 'true' });
    rows.forEach((row, rowIndex) => {
      const total = row.reduce((sum, cell, i) => sum + cell.width + (i ? gap : 0), 0);
      let x = left + Math.max(0, (maxWidth - total) / 2);
      const rowY = y + rowIndex * lineHeight;
      for (const cell of row) {
        const { item } = cell;
        if (item.type === 'bar') {
          p.box('legend' + item.name, x, rowY - lineHeight * 0.32, 16, 12, item.paint, { stroke: 'none' });
        } else {
          p.line('legend' + item.name, `M${x} ${rowY}h${symbolW}`, item.paint, { 'stroke-dasharray': item.dash || '' });
        }
        p.text(x + symbolW + 6, rowY, item.name, 'legend', 'start');
        x += cell.width + gap;
      }
    });
    return g;
  },
};
