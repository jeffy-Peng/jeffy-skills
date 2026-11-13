// 字体核验：只在真的加载成功并且测量宽度不等于回退字体时才算可用。
// 缺字体时抛出带 missing / hint 的 FONT 错误，交给装配层渲染成看得见的报错页。
window.ThemeFontCheck = {
  async fonts(doc, theme) {
    const families = [...new Set(Object.values(theme.fonts))];
    const probe = '中文测试样本 Georgia 0123456789 mmmmWWii 0.2px';
    const canvas = doc.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const widthOf = (css) => {
      ctx.font = '32px ' + css;
      return ctx.measureText(probe).width;
    };
    const missing = [];
    // 内嵌子集是按本页字符裁过的，度量与整字体有微小出入，这一档只做族名检查。
    const embedded = Boolean(doc.querySelector('style[data-embedded-fonts]'));
    let driftedFamily = null;
    for (const family of families) {
      const familyCss = `"${family}"`;
      try {
        await doc.fonts.load(`16px ${familyCss}`);
      } catch {}
      await doc.fonts.ready;
      const loaded = doc.fonts.check(`16px ${familyCss}`);
      // 与两种通用字体比较：宽度都相同说明浏览器回退了，声明的族名没有真正命中。
      const viaFamilyMono = widthOf(`${familyCss},monospace`);
      const viaFamilySerif = widthOf(`${familyCss},serif`);
      const fallback =
        Math.abs(viaFamilyMono - widthOf('monospace')) < 0.01 && Math.abs(viaFamilySerif - widthOf('serif')) < 0.01;
      let drifted = null;
      const reference = ((window.compositionInput && window.compositionInput.fontMetrics) || {})[family];
      if (!embedded && reference && reference.advance) {
        // 同名替代字体（Noto Serif CJK SC 之于 Noto Serif SC）族名检查分辨不出来，比实测度量。
        ctx.font = `100px ${familyCss}`;
        const measured = ctx.measureText(reference.probe).width;
        const tolerance = Math.max(1, reference.advance * 0.015);
        if (Math.abs(measured - reference.advance) > tolerance) {
          drifted = { family, measured: +measured.toFixed(2), expected: reference.advance };
        }
      }
      if (!loaded || fallback || drifted) missing.push(family);
      if (drifted) driftedFamily = drifted;
    }
    if (missing.length) {
      const detail = driftedFamily
        ? `，实测宽度 ${driftedFamily.measured} 与参考 ${driftedFamily.expected} 不符，安装的是同名替代字体`
        : '';
      const error = Object.assign(Error('字体不可用：' + missing.join('、') + detail), { code: 'FONT' });
      error.missing = missing;
      if (driftedFamily) error.drifted = driftedFamily;
      error.hint = 'bash scripts/install-fonts.sh';
      throw error;
    }
    return families;
  },
};
