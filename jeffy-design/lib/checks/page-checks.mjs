// 整页检查：不依赖组件适配器，手画的页也按同一套规矩过一遍。
// 检查项：字号是否落在主题阶梯、字体是否命中主题族名、文字是否越界、跨页同角色是否一致、同页线宽是否统一。
export async function auditDeck(page, theme) {
  const scale = theme.scale.map((x) => x.size);
  const families = Object.values(theme.fonts);
  const raw = await page.evaluate(
    ({ scale, families }) => {
      const near = (a, b) => Math.abs(a - b) <= 0.35;
      const inScale = (size) => scale.some((s) => near(s, size));
      const sheets = [...document.querySelectorAll('.sheet')];
      return sheets.map((sheet, index) => {
        const box = sheet.getBoundingClientRect();
        const nodes = [];
        for (const el of sheet.querySelectorAll('.block, [data-theme-role]')) {
          const text = (el.textContent || '').trim();
          if (!text) continue;
          const css = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const size = parseFloat(css.fontSize);
          nodes.push({
            text: text.slice(0, 40),
            role: el.dataset.themeRole || null,
            size,
            family: css.fontFamily,
            inScale: inScale(size),
            x: rect.x - box.x,
            y: rect.y - box.y,
            width: rect.width,
            height: rect.height,
          });
        }
        const strokes = [];
        for (const frame of sheet.querySelectorAll('iframe')) {
          try {
            const doc = frame.contentDocument;
            for (const node of doc.querySelectorAll('[stroke-width]')) {
              // 没有描边的节点（stroke:none）不算线宽，否则实心色块会被误判成 1px 线。
              const stroke = (node.getAttribute('stroke') || '').toLowerCase();
              if (!stroke || stroke === 'none' || stroke === 'transparent') continue;
              const w = parseFloat(node.getAttribute('stroke-width'));
              // 按角色分组：网格线和轴线本来就不是一个粗细，不能互相比较。
              if (Number.isFinite(w))
                strokes.push({ role: node.getAttribute('data-shape-role') || 'none', w: +w.toFixed(3) });
            }
          } catch {}
        }
        return { index, id: sheet.dataset.page || String(index + 1), nodes, strokes };
      });
    },
    { scale, families },
  );

  const issues = [];
  const roleSizes = new Map();
  for (const sheet of raw) {
    for (const node of sheet.nodes) {
      if (Number.isFinite(node.size) && !node.inScale) {
        issues.push({
          code: 'THEME',
          page: sheet.id,
          message: `字号 ${node.size}px 不在主题阶梯 ${scale.join('/')}`,
          text: node.text,
        });
      }
      const declared = (node.family || '').split(',')[0].replace(/["']/g, '').trim();
      if (declared && !families.includes(declared) && !['serif', 'sans-serif', 'system-ui'].includes(declared)) {
        issues.push({ code: 'FONT', page: sheet.id, message: `字体 ${declared} 不是主题声明的族名`, text: node.text });
      }
      if (
        node.x < 0 ||
        node.y < 0 ||
        node.x + node.width > theme.page.canvas.width + 1 ||
        node.y + node.height > theme.page.canvas.height + 1
      ) {
        issues.push({ code: 'CAPACITY', page: sheet.id, message: '文字超出画布', text: node.text });
      }
      if (node.role) {
        if (!roleSizes.has(node.role)) roleSizes.set(node.role, new Map());
        const seen = roleSizes.get(node.role);
        if (!seen.has(node.size)) seen.set(node.size, []);
        seen.get(node.size).push(sheet.id);
      }
    }
    const byRole = new Map();
    for (const stroke of sheet.strokes) {
      if (!byRole.has(stroke.role)) byRole.set(stroke.role, new Set());
      byRole.get(stroke.role).add(stroke.w);
    }
    for (const [role, widths] of byRole) {
      if (widths.size > 1)
        issues.push({
          code: 'THEME',
          page: sheet.id,
          message: `同角色（${role}）线宽不一致：${[...widths].join(' / ')}`,
        });
    }
  }
  for (const [role, sizes] of roleSizes) {
    if (sizes.size > 1) {
      issues.push({
        code: 'THEME',
        message: `角色 ${role} 在不同页用了 ${[...sizes.keys()].join(' / ')} px`,
        pages: [...sizes.entries()].map(([size, ids]) => ({ size, pages: [...new Set(ids)] })),
      });
    }
  }
  return { pages: raw.length, nodes: raw.reduce((n, s) => n + s.nodes.length, 0), issues };
}
