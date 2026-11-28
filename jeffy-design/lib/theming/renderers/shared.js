// 主题渲染器共享内核：错误抛出、数值格式化、画布初始化、自动刻度域与坐标框架。
window.ThemeRendererShared = (() => {
  const fail = (code, message) => {
    throw Object.assign(Error(message), { code });
  };
  const num = (v) => Number(Number(v).toPrecision(6)).toString();

  function setup(svg, theme, box) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.style.cssText = `width:${box.width}px;height:${box.height}px`;
    return window.ThemeDrawing.create(svg, theme);
  }

  function domain(vals, zero = true) {
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (zero) {
      lo = Math.min(0, lo);
      hi = Math.max(0, hi);
    }
    if (lo === hi) {
      const d = Math.abs(lo) * 0.1 || 1;
      lo -= zero && lo === 0 ? 0 : d;
      hi += d;
    }
    const raw = (hi - lo) / 4;
    const p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].find((v) => v * p >= raw) * p;
    return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
  }

  function frame(p, W, H, labels, range, metric, unit, horizontal = false, legend = [], axisStyle) {
    // 轴、单位、图例统一由 lib/kit 负责，几何只拿回可用区域与坐标换算。
    return window.KitAxis.frame(p, {
      width: W,
      height: H,
      labels,
      range,
      metric,
      unit,
      horizontal,
      legend,
      fail,
      num,
      axisStyle,
    });
  }

  const rampColor = (theme, f) => window.ThemeColor.rampColor(theme, f);

  return { fail, num, setup, domain, frame, rampColor };
})();

window.ThemeRendererFamilies = window.ThemeRendererFamilies || {};
