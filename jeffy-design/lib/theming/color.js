// 统一色彩计算：十六进制解析、WCAG 相对亮度与对比度、主题明度阶梯插值与校验。
window.ThemeColor = (() => {
  function parseHex(hex) {
    const clean = String(hex ?? '')
      .replace(/^#/, '')
      .trim()
      .toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(clean)) return null;
    return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  }

  function luminance(hex) {
    const rgb = parseHex(hex);
    if (!rgb) return 0;
    const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastRatio(hexA, hexB) {
    const a = luminance(hexA);
    const b = luminance(hexB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function preferDarkText(bgHex, inkHex, paperHex) {
    return contrastRatio(bgHex, inkHex) >= contrastRatio(bgHex, paperHex);
  }

  function rampColors(theme) {
    const declared = (theme.materials?.shadeRamp || []).map((role) => theme.colors?.[role]).filter(Boolean);
    if (declared.length) return declared;
    return [theme.colors?.ink, theme.colors?.soft].filter(Boolean);
  }

  function rampColor(theme, factor) {
    const stops = rampColors(theme);
    const a = parseHex(stops[0]);
    const b = parseHex(stops[stops.length - 1]);
    if (!a || !b) return '#' + (theme.colors?.ink || '000000');
    return (
      '#' +
      a
        .map((c, i) =>
          Math.round(c + (b[i] - c) * factor)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }

  function isOnShadeRamp(hex, theme) {
    const target = parseHex(hex);
    if (!target) return false;
    const stops = (theme.materials?.shadeRamp || []).map((role) => theme.colors?.[role]).filter(Boolean);
    const tolerance = theme.materials?.shadeTolerance ?? 2;
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = parseHex(stops[i]);
      const b = parseHex(stops[i + 1]);
      if (!a || !b) continue;
      const d = b.map((x, k) => x - a[k]);
      const len2 = d.reduce((sum, x) => sum + x * x, 0);
      if (!len2) continue;
      const t = target.reduce((sum, x, k) => sum + (x - a[k]) * d[k], 0) / len2;
      if (t < -0.01 || t > 1.01) continue;
      const residual = Math.max(...target.map((x, k) => Math.abs(x - (a[k] + t * d[k]))));
      if (residual <= tolerance) return true;
    }
    return false;
  }

  return { parseHex, luminance, contrastRatio, preferDarkText, rampColor, isOnShadeRamp };
})();
