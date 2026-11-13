// 页面布局：骨架只给固定部分，内容区由减法得出，结论行与组件按权重分配。
window.KitLayout = {
  // theme.page 提供画布、页边距、标题区、分隔线、页脚；没有 formats 时沿用旧区域。
  snap(value, theme) {
    const base = theme.grid?.baseline || 8;
    return Math.round(value / base) * base;
  },

  // 组件高度向下取整到基线，保证总和不超过可用高度。
  snapDown(value, theme) {
    const base = theme.grid?.baseline || 8;
    return Math.floor(value / base) * base;
  },

  // 高度只能向上取整到基线，向下取整会把文字挤出框。
  snapUp(value, theme) {
    const base = theme.grid?.baseline || 8;
    return Math.ceil(value / base) * base;
  },

  regions(theme) {
    const page = theme.page;
    const gap = theme.materials?.gap ?? 16;
    const footerTop = page.source.y - gap;
    const contentTop = page.title.y + page.title.height + gap * 2;
    return {
      canvas: page.canvas,
      title: page.title,
      rule: page.headerRule,
      source: page.source,
      pageNo: page.pageNo,
      content: (() => {
        // 内容区必须同时受页脚和主题 content 底边约束，否则组件会压到页脚上。
        const top = Math.max(page.content.y, contentTop);
        const bottom = Math.min(page.content.y + page.content.height, footerTop);
        return { x: page.content.x, y: top, width: page.content.width, height: Math.max(0, bottom - top) };
      })(),
      gap,
    };
  },

  // 用 canvas 实测文字宽度，比按字数估算稳。
  measure(text, role, theme) {
    const family = `"${theme.fonts.latin}","${theme.fonts.ea}",serif`;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${role.weight} ${role.size}px ${family}`;
    return ctx.measureText(text).width;
  },

  // 结论行按实测行数占位，从内容区顶部扣掉；剩下按权重纵向分给组件。
  distribute(theme, page, regionsOverride) {
    const issues = [];
    const r = regionsOverride ? { ...this.regions(theme), ...regionsOverride } : this.regions(theme);
    const claimRole =
      (theme.scale || []).find((x) => x.role === 'claim') || (theme.scale || []).find((x) => x.role === 'body');
    const gap = theme.grid?.gutter || r.gap;
    const tier = theme.density?.[page.density || 'normal'] || { maxComponents: 3, minHeight: 120, fill: 0.9 };
    // 密度只约束由布局分配的组件；页面自己给了坐标的按原样走。
    const laidOut = (page.components || []).filter((c) => !c.box);
    if (laidOut.length > tier.maxComponents)
      issues.push({ code: 'CAPACITY', page: page.id, message: `当前密度最多 ${tier.maxComponents} 个组件` });
    let top = this.snap(r.content.y, theme);
    let claim = null;
    const text = typeof page.claim === 'string' ? page.claim.trim() : '';
    if (text) {
      const width = this.measure(text, claimRole, theme);
      const lines = Math.max(1, Math.ceil(width / r.content.width));
      const height = this.snapUp(lines * claimRole.size * claimRole.lineHeight + 8, theme);
      claim = { x: r.content.x, y: top, width: r.content.width, height };
      top += height + gap;
    }
    const items = (page.components || []).filter((c) => !c.box);
    const fixed = (page.components || []).filter((c) => c.box);
    const available = Math.max(0, r.content.y + r.content.height - top);
    const totalWeight = items.reduce((sum, c) => sum + (Number(c.weight) || 1), 0) || 1;
    // 留白交给模型：密度只限制组件数量，可用高度不按比例砍。
    const usable = available - gap * Math.max(0, items.length - 1);
    const minHeight = 96;
    let cursor = top;
    const boxes = items.map((c) => {
      const weight = Number(c.weight) || 1;
      const height = Math.max(minHeight, this.snapDown((usable * weight) / totalWeight, theme));
      const box = { x: r.content.x, y: cursor, width: r.content.width, height };
      cursor += height + gap;
      if (cursor - gap > r.content.y + r.content.height)
        issues.push({ code: 'CAPACITY', page: page.id, message: '组件总和超出内容区，降一档密度或减组件' });
      return { id: c.id, box };
    });
    return { regions: r, claim, boxes, fixed, issues, tier: page.density || 'normal' };
  },
};
