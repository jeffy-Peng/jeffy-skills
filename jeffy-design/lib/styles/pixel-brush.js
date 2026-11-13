// 像素笔触：只管怎么落笔，不管排在哪儿。
// 横向、竖向、堆叠、百分比这些几何由绘制层决定，这里只把坐标吸附到格子、边缘变硬、加硬阴影。
window.PixelBrush = {
  create(svg, theme, params = {}) {
    const base = ThemeDrawing.create(svg, theme);
    const P = params.gridPx || theme.materials?.gridPx || 3;
    const useShadow = params.shadow !== false;
    const snap = (v) => Math.round(Number(v) / P) * P;
    const hard = { 'shape-rendering': 'crispEdges' };
    return {
      ...base,
      gridPx: P,
      // 文字位置向下取整：四舍五入会把贴着边界的标签推出区域。
      text: (x, y, value, role = 'pill', anchor = 'middle', extra = {}) =>
        base.text(Math.floor(Number(x) / P) * P, Math.floor(Number(y) / P) * P, value, role, anchor, {
          ...hard,
          ...extra,
        }),
      line: (id, d, role = 'line', extra = {}) => base.line(id, d, role, { ...hard, ...extra }),
      box: (id, x, y, width, height, role, extra = {}) => {
        const node = base.box(id, snap(x), snap(y), snap(width), snap(height), role, { ...hard, ...extra });
        // 够宽的色块补一个右下硬阴影，像素风的常见手法
        if (useShadow && snap(width) >= P * 4 && snap(height) >= P * 2) {
          base.add('rect', {
            x: snap(x) + snap(width),
            y: snap(y) + snap(height) - P,
            width: P,
            height: P,
            fill: base.color('line'),
            ...hard,
          });
        }
        return node;
      },
      add: (tag, attrs, value) => base.add(tag, { ...hard, ...attrs }, value),
    };
  },
};
