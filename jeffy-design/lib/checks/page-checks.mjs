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
        for (const el of sheet.querySelectorAll('*')) {
          const text = (el.textContent || '').trim();
          if (!text || ['SCRIPT', 'STYLE'].includes(el.tagName.toUpperCase())) continue;
          // 测量实际承载文字的元素，避免容器重复计数；SVG tspan 由其父 text 测量。
          if (
            el.tagName.toLowerCase() === 'tspan' ||
            (!['text', 'td', 'th'].includes(el.tagName.toLowerCase()) &&
              ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          )
            continue;
          const css = getComputedStyle(el);
          if (css.display === 'none' || css.visibility === 'hidden') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const matrix = typeof el.getScreenCTM === 'function' ? el.getScreenCTM() : null;
          const size = parseFloat(css.fontSize) * (matrix ? Math.hypot(matrix.a, matrix.b) : 1);
          const host = el.closest('.jd-component, .block.component');
          const target = host?.getBoundingClientRect();
          nodes.push({
            text: text.slice(0, 40),
            role: el.closest('[data-theme-role]')?.dataset.themeRole || null,
            size,
            family: css.fontFamily,
            inScale: inScale(size),
            outsideComponent:
              target &&
              (rect.left < target.left - 2 ||
                rect.top < target.top - 2 ||
                rect.right > target.right + 2 ||
                rect.bottom > target.bottom + 2),
            x: rect.x - box.x,
            y: rect.y - box.y,
            width: rect.width,
            height: rect.height,
          });
        }
        const strokes = [];
        for (const node of sheet.querySelectorAll('[stroke-width]')) {
          // 没有描边的节点（stroke:none）不算线宽，否则实心色块会被误判成 1px 线。
          const stroke = (node.getAttribute('stroke') || '').toLowerCase();
          if (!stroke || stroke === 'none' || stroke === 'transparent') continue;
          const w = parseFloat(node.getAttribute('stroke-width'));
          // 按角色分组：网格线和轴线本来就不是一个粗细，不能互相比较。
          if (Number.isFinite(w))
            strokes.push({
              role: node.getAttribute('data-stroke-role') || node.getAttribute('data-shape-role') || null,
              w: +w.toFixed(3),
            });
        }
        const centering = [...sheet.querySelectorAll('[data-text-center]')].map((shape) => {
          const key = shape.dataset.focusKey;
          const host = shape.closest('.jd-component') || sheet;
          const labels = [...host.querySelectorAll('text[data-label-for]')].filter((t) => t.dataset.labelFor === key);
          const rects = labels.map((t) => t.getBoundingClientRect());
          const b = shape.getBoundingClientRect();
          if (!rects.length) return { key, missing: true };
          const top = Math.min(...rects.map((r) => r.top)),
            bottom = Math.max(...rects.map((r) => r.bottom));
          return { key, offset: (top + bottom - b.top - b.bottom) / 2, outside: top < b.top || bottom > b.bottom };
        });
        return { index, id: sheet.dataset.page || String(index + 1), nodes, strokes, centering };
      });
    },
    { scale, families },
  );

  const issues = [];
  const roleSizes = new Map();
  const roleScale = Object.fromEntries(theme.scale.map((x) => [x.role, x.size]));
  for (const sheet of raw) {
    if (!sheet.nodes.length)
      issues.push({ code: 'COVERAGE', page: sheet.id, message: '页面没有可测量文字，需提供可读文本与独立验收证据' });
    for (const node of sheet.nodes) {
      if (node.outsideComponent)
        issues.push({ code: 'CAPACITY', page: sheet.id, message: '文字超出组件目标区域', text: node.text });
      if (node.role && (roleScale[node.role] === undefined || Math.abs(node.size - roleScale[node.role]) > 0.35))
        issues.push({ code: 'THEME', page: sheet.id, message: '文字字号与主题角色不符', text: node.text });
      if (Number.isFinite(node.size) && !node.inScale) {
        issues.push({
          code: 'THEME',
          page: sheet.id,
          message: `字号 ${node.size}px 不在主题阶梯 ${scale.join('/')}`,
          text: node.text,
        });
      }
      const declared = (node.family || '').split(',')[0].replace(/["']/g, '').trim();
      if (declared && !families.includes(declared)) {
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
    for (const group of sheet.centering) {
      if (group.missing || group.outside || Math.abs(group.offset) > 1)
        issues.push({ code: 'LAYOUT', page: sheet.id, message: '形状内部文字组未垂直居中或越界', ...group });
    }
    const byRole = new Map();
    for (const stroke of sheet.strokes) {
      // 未标注语义的线不能假定属于同一角色；覆盖范围单独记录。
      if (!stroke.role) continue;
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
  return {
    unclassifiedStrokes: raw.reduce((n, s) => n + s.strokes.filter((x) => !x.role).length, 0),
    centeredTextGroups: raw.reduce((n, s) => n + s.centering.length, 0),
    pages: raw.length,
    nodes: raw.reduce((n, s) => n + s.nodes.length, 0),
    issues,
  };
}
