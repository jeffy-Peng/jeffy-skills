(async () => {
  const { deck, theme, adapters } = window.compositionInput,
    roles = Object.fromEntries(theme.scale.map((x) => [x.role, x])),
    reports = [];
  const issue = (code, message, extra = {}) => ({ code, message, ...extra });
  const overlap = (a, b, g = 0) =>
    a.x < b.x + b.width - g && a.x + a.width > b.x + g && a.y < b.y + b.height - g && a.y + a.height > b.y + g;
  const isInsideBox = (box, container) =>
    box.x >= container.x &&
    box.y >= container.y &&
    box.x + box.width <= container.x + container.width &&
    box.y + box.height <= container.y + container.height;
  const resolvePageRegions = (typeSpec) =>
    typeSpec?.regions || {
      title: theme.page.title,
      rule: theme.page.headerRule,
      footerRule: theme.page.footerRule,
      content: theme.page.content,
      source: theme.page.source,
      pageNo: theme.page.pageNo,
    };
  function textBlock(parent, id, text, box, role = 'body') {
    const r = roles[role];
    if (!r) throw Error('未知主题角色 ' + role);
    let n = document.createElement('div');
    n.className = 'block';
    n.dataset.block = id;
    n.dataset.themeRole = role;
    n.textContent = text;
    n.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;font-size:${r.size}px;line-height:${r.lineHeight};font-weight:${r.weight};letter-spacing:${r.tracking};color:#${theme.colors[r.color]}`;
    parent.append(n);
    return n;
  }
  async function mount(host, spec) {
    if (spec.artifact) {
      const { type, content } = spec.artifact;
      if (type === 'image') {
        const img = document.createElement('img');
        img.src = content;
        img.alt = spec.purpose;
        img.style.cssText = 'width:100%;height:100%;object-fit:contain';
        host.append(img);
        await img.decode();
      } else {
        host.classList.add('jd-component');
        host.innerHTML = content;
        const svg = host.querySelector('svg');
        // 保持绘制时的像素字号；只接受按目标区域绘制的矢量。
        const v = svg.viewBox.baseVal;
        if (v.width !== spec.box.width || v.height !== spec.box.height)
          return { ok: false, issues: [issue('CONTRACT', 'SVG viewBox 必须等于目标区域尺寸，禁止缩放字号')] };
        svg.style.width = '100%';
        svg.style.height = '100%';
        updateLineLabelMasks(svg, theme.materials.labelGap);
      }
      return { ok: true, issues: [], capability: 'artifact', source: spec.artifact.source };
    }
    const a = adapters[spec.material],
      r = roles[spec.labelRole || 'pill'];
    if (!r) return { ok: false, issues: [issue('THEME', '标签角色不存在')] };
    // 在当前文档挂载，沿用主题字体与统一交互。
    const container = document.createElement('div');
    container.className = 'component jd-component';
    container.style.cssText = `position:relative;width:${spec.box.width}px;height:${spec.box.height}px;font-size:${roles.body.size}px`;
    container.innerHTML = '<svg></svg><div id="table"></div>';
    host.append(container);
    await document.fonts.ready;
    if (a.renderer === 'theme-v1')
      return await mountNative(container, {
        ...spec,
        options: { ...a.defaultOptions, ...spec.options },
        archetype: a.archetype,
      });
    return { ok: false, material: spec.material, issues: [issue('UNSUPPORTED', '仅 theme-v1 适配器可装配')] };
  }

  async function mountNative(container, spec) {
    const EDGE = 2;
    const issues = [];
    let result;
    try {
      if (spec.labelRole && spec.labelRole !== 'pill')
        throw Object.assign(Error('theme-v1按元素语义选择角色，不支持labelRole覆盖'), { code: 'UNSUPPORTED' });
      if (spec.data.title?.trim())
        throw Object.assign(Error('组件标题需分配独立主题文字区域，不得静默丢弃'), { code: 'UNSUPPORTED' });
      await window.ThemeDrawing.fonts(document, theme);
      result = window.ThemeRenderers.render(
        spec.material.startsWith('TABLE') ? container.querySelector('#table') : container.querySelector('svg'),
        spec.data,
        spec.options || {},
        theme,
        spec.box,
        spec.material,
      );
    } catch (e) {
      return {
        ok: false,
        material: spec.material,
        issues: [issue(e.code || 'DATA', e.message)],
        capability: 'theme-v1',
      };
    }
    if (spec.material.startsWith('TABLE')) {
      container.querySelector('svg').remove();
      const height = Math.max(container.scrollHeight, container.getBoundingClientRect().height);
      if (height > spec.box.height || result.minWidth > spec.box.width)
        issues.push(issue('CAPACITY', '表格主题字号下区域不足', { required: { width: result.minWidth, height } }));
      return {
        ok: !issues.length,
        issues,
        material: spec.material,
        required: { width: result.minWidth, height },
        actual: spec.box,
        regions: [],
        result,
        capability: 'theme-v1',
      };
    }
    container.querySelector('#table').remove();
    const svg = container.querySelector('svg');
    svg.setAttribute('aria-label', spec.purpose);
    svg.setAttribute('role', 'img');
    window.updateLineLabelMasks(svg, theme.materials.labelGap);
    const bounds = svg.getBoundingClientRect(),
      regions = [...svg.querySelectorAll('text')]
        .filter((t) => t.textContent.trim())
        .map((t) => {
          let b = t.getBoundingClientRect(),
            css = window.getComputedStyle(t),
            role = t.dataset.themeRole;
          return {
            text: t.textContent,
            role,
            x: b.x - bounds.x,
            y: b.y - bounds.y,
            width: b.width,
            height: b.height,
            fontSize: parseFloat(css.fontSize),
            expectedSize: roles[role]?.size,
            fontFamily: css.fontFamily,
          };
        });
    for (const b of regions) {
      if (!Number.isFinite(b.expectedSize) || Math.abs(b.fontSize - b.expectedSize) > 0.2)
        issues.push(issue('THEME', '角色字号不符', { text: b.text }));
      // 字体回退与真实字体之间最多差 2px：同一段文字在 Noto Serif CJK 与 Noto Serif SC 下高度不同。
      // 2px 在 1280×720 上看不出来，但不能放得更宽，否则会掩盖真正的排版溢出。
      if (
        b.x < -EDGE ||
        b.y < -EDGE ||
        b.x + b.width > spec.box.width + EDGE ||
        b.y + b.height > spec.box.height + EDGE
      )
        issues.push(issue('CAPACITY', '主题文字超出目标区域', { text: b.text }));
    }
    for (let i = 0; i < regions.length; i++)
      for (let j = i + 1; j < regions.length; j++)
        if (overlap(regions[i], regions[j], 1))
          issues.push(issue('LAYOUT', '主题文字碰撞', { texts: [regions[i].text, regions[j].text] }));
    const colors = new Set(Object.values(theme.colors).map((v) => '#' + v.toLowerCase()));
    for (const node of [...svg.querySelectorAll('[fill],[stroke]')].filter((n) => !n.closest('mask')))
      for (const key of ['fill', 'stroke']) {
        const value = node.getAttribute(key);
        // 渐变和滤镜引用由笔触定义，不算绕过主题；其余颜色必须来自主题或明度阶梯。
        const brushed = value?.startsWith('url(#');
        if (
          value &&
          !brushed &&
          !['none', 'transparent'].includes(value) &&
          !colors.has(value.toLowerCase()) &&
          !window.ThemeColor.isOnShadeRamp(value, theme)
        )
          issues.push(issue('THEME', '存在绕过主题的颜色', { value }));
      }
    // 交互靠属性契约：没有可聚焦的图形，页面就是死图，算缺陷。
    if (!container.querySelectorAll('[data-focus-key]').length)
      issues.push(issue('INTERACTION', '没有可聚焦的图形，悬停不会生效'));
    return {
      ok: !issues.length,
      issues,
      material: spec.material,
      required: { width: spec.box.width, height: spec.box.height },
      actual: spec.box,
      regions,
      result,
      capability: 'theme-v1',
    };
  }
  await ThemeDrawing.fonts(document, theme);
  for (const [i, page] of deck.pages.entries()) {
    const preview = deck.deliverable === 'chart' || page.preview === true;
    const formatName = deck.format || 'slide';
    const pageType = page.type || 'content';
    const typeSpec = theme.formats?.[formatName]?.types?.[pageType];
    const regions = resolvePageRegions(typeSpec);
    const report = {
      id: page.id,
      ok: false,
      issues: [],
      components: [],
      reviews: page.review || {},
      manualReview: 'pending',
    };
    reports.push(report);
    const sheet = document.createElement('section');
    sheet.className = 'sheet';
    sheet.dataset.page = page.id;
    sheet.style.background = '#' + theme.colors.paper;
    sheet.style.fontFamily = `"${theme.fonts.latin}","${theme.fonts.ea}",serif`;
    // 画布基准字号取主题正文，避免容器继承浏览器默认 16px 而报阶梯外字号。
    sheet.style.fontSize = roles.body.size + 'px';
    document.querySelector('main').append(sheet);
    if (
      !preview &&
      page.skeleton !== true &&
      pageType === 'content' &&
      (!page.question || !page.claim || !page.readingOrder?.length || !page.speakerNotes || !page.source)
    )
      report.issues.push(issue('CONTENT', '缺少问题、观点、阅读顺序、讲稿或来源'));
    sheet.style.width = theme.page.canvas.width + 'px';
    sheet.style.height = theme.page.canvas.height + 'px';
    // 标题的标签由页面给（类别区分、结论、对比之类），分隔符由主题给；来源前缀固定由主题给。
    const separator = theme.labels?.separator || '：';
    const withLabel = (label, text) => {
      let value = String(text || '');
      if (label === theme.labels?.source) value = value.replace(/^(?:数据来源|来源|Source)\s*[：:]\s*/i, '');
      if (!label || !value || value.startsWith(label)) return value;
      // 标签自带分隔符时不再补第二次。
      const clean = label.replace(/[：:]$/, '');
      return clean + separator + value;
    };
    if (!preview) {
      // 标签与标题分两段渲染：标签用弱色，标题用主色，中间给固定间距，避免全角冒号的空档。
      if (page.titleLabel) {
        const block = document.createElement('div');
        block.className = 'block';
        block.dataset.block = 'title';
        block.dataset.themeRole = 'title';
        const r = roles.title;
        block.style.cssText = `left:${regions.title.x}px;top:${regions.title.y}px;width:${regions.title.width}px;height:${regions.title.height}px;font-size:${r.size}px;line-height:${r.lineHeight};font-weight:${r.weight};letter-spacing:${r.tracking};display:flex;align-items:baseline;gap:10px`;
        const label = document.createElement('span');
        label.textContent = page.titleLabel;
        label.style.cssText = `color:#${theme.colors.muted};font-size:${r.size}px`;
        const colon = document.createElement('span');
        colon.textContent = theme.labels?.separator || '：';
        // 全角冒号右半边是空的，负外边距把它收掉，避免标题前出现一个大空档。
        colon.style.cssText = `color:#${theme.colors.muted};font-size:${r.size}px;margin-right:-0.42em`;
        const value = document.createElement('span');
        value.textContent = page.title;
        value.style.cssText = `color:#${theme.colors[r.color]};font-size:${r.size}px`;
        block.append(label, colon, value);
        sheet.append(block);
      } else {
        textBlock(sheet, 'title', page.title, regions.title, 'title');
      }
    }
    // 素材视图不画页面骨架：页眉线上没有标题，留着只是一条凭空出现的横线。
    if (!preview && typeSpec?.hasRule !== false) {
      const line = document.createElement('div');
      line.className = 'block';
      line.dataset.block = 'header-rule';
      line.style.cssText = `left:${regions.rule.x}px;top:${regions.rule.y}px;width:${regions.rule.width}px;border-top:${theme.rules.headerWidthPx}px solid #${theme.colors.ink}`;
      sheet.append(line);
    }
    // 结论行是字符串时走布局器：结论占顶部，其余按权重分给组件。
    const plan =
      regions.content && typeof page.claim === 'string' && page.claim.trim()
        ? window.KitLayout.distribute(theme, page, { content: regions.content, title: regions.title })
        : null;
    if (plan?.claim) textBlock(sheet, 'claim', page.claim, plan.claim, 'claim');
    if (plan?.issues?.length) report.issues.push(...plan.issues.map((i) => ({ ...i, page: page.id })));
    const planned = new Map((plan?.boxes || []).map((item) => [item.id, item.box]));
    const occupied = plan?.claim ? [{ id: 'claim', ...plan.claim }] : [];
    for (const c of page.components || []) {
      if (planned.has(c.id)) c.box = planned.get(c.id);
      if (!c.id || !c.purpose || !c.box || (!c.artifact && !adapters[c.material])) {
        report.issues.push(issue('CONTRACT', '组件缺少 ID、任务、目标区域或适配器'));
        continue;
      }
      if (!isInsideBox(c.box, regions.content))
        report.issues.push(issue('CAPACITY', '组件侵入页眉页脚或越界', { component: c.id }));
      occupied.push({ id: c.id, ...c.box });
      const host = document.createElement('div');
      host.className = 'block component';
      host.dataset.block = c.id;
      host.style.cssText = `left:${c.box.x}px;top:${c.box.y}px;width:${c.box.width}px;height:${c.box.height}px`;
      sheet.append(host);
      const response = await mount(host, c);
      report.components.push({ id: c.id, purpose: c.purpose, ...response });
      report.issues.push(...response.issues.map((v) => ({ ...v, component: c.id })));
    }
    for (const t of page.text || []) {
      if (!isInsideBox(t.box, regions.content))
        report.issues.push(issue('CAPACITY', '文字侵入页眉页脚或越界', { block: t.id }));
      occupied.push({ id: t.id, ...t.box });
      textBlock(sheet, t.id, t.text, t.box, t.role || 'body');
    }
    for (let a = 0; a < occupied.length; a++)
      for (let b = a + 1; b < occupied.length; b++)
        if (overlap(occupied[a], occupied[b]))
          report.issues.push(issue('LAYOUT', '页面区域相交', { blocks: [occupied[a].id, occupied[b].id] }));

    const known = new Set(occupied.map((x) => x.id));
    if ((page.readingOrder || []).some((x) => !known.has(x)))
      report.issues.push(issue('CONTENT', '阅读顺序引用不存在的组件'));
    for (const shared of page.bindings || []) {
      let names = shared.members.map((m) => {
        let c = (page.components || []).find((c) => c.id === m.component);
        return m.field ? m.field.split('.').reduce((v, k) => v?.[k], c?.data) : undefined;
      });
      if (names.some((n) => !n) || new Set(names).size !== 1)
        report.issues.push(issue('BINDING', '跨组件名称不一致', { binding: shared.id, names }));
    }
    if (!preview && (pageType === 'cover' || pageType === 'closing')) {
      if (regions.subtitle && page.claim) textBlock(sheet, 'subtitle', page.claim, regions.subtitle, 'claim');
      if (regions.meta && page.source) textBlock(sheet, 'meta', page.source, regions.meta, 'source');
    }
    if (!preview && pageType === 'toc' && regions.content) {
      const items = page.items?.length
        ? page.items
        : deck.pages
            .map((pg, idx) => ({ ...pg, number: idx + 1 }))
            .filter((pg) => pg.type === 'section')
            .map((pg) => ({ title: String(pg.title || ''), page: pg.number }));
      const box = regions.content;
      const rowH = (theme.grid?.baseline || 8) * 7;
      const list = document.createElement('div');
      list.dataset.block = 'toc';
      list.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px`;
      const role = roles.claim || roles.body;
      items.forEach((it, k) => {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:baseline;gap:16px;height:${rowH}px;border-bottom:1px solid #${theme.colors.rule};font-size:${role.size}px;color:#${theme.colors[role.color]}`;
        const no = document.createElement('span');
        no.textContent = String(k + 1).padStart(2, '0');
        no.style.cssText = `color:#${theme.colors.muted};font-size:${roles.pageNo.size}px`;
        const name = document.createElement('span');
        name.textContent = it.title;
        name.style.flex = '1';
        const pg = document.createElement('span');
        pg.textContent = String(it.page ?? '').padStart(2, '0');
        pg.style.cssText = `color:#${theme.colors.muted};font-size:${roles.pageNo.size}px`;
        row.append(no, name, pg);
        list.append(row);
      });
      if (items.length * rowH > box.height)
        report.issues.push(issue('CAPACITY', '目录条目超出内容区，建议分栏或减少条目'));
      sheet.append(list);
    }
    if (typeSpec?.align === 'center') {
      for (const el of sheet.querySelectorAll('[data-block]')) {
        el.style.textAlign = 'center';
        el.style.justifyContent = 'center';
      }
    }
    if (!preview && typeSpec?.hasFooter !== false) {
      const footerRule = regions.footerRule || theme.page.footerRule;
      if (footerRule) {
        const line = document.createElement('div');
        line.className = 'block';
        line.dataset.block = 'footer-rule';
        line.style.cssText = `left:${footerRule.x}px;top:${footerRule.y}px;width:${footerRule.width}px;border-top:${theme.rules.headerWidthPx}px solid #${theme.colors.ink}`;
        sheet.append(line);
      }
      const source = textBlock(sheet, 'source', withLabel(theme.labels?.source, page.source), regions.source, 'source');
      for (const link of page.sourceLinks || []) {
        if (!link.text || !/^https?:\/\//i.test(link.url || ''))
          throw Error('CONTRACT: 来源链接需 text 和 http(s) URL');
        const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
        const matches = [];
        while (walker.nextNode())
          if (!walker.currentNode.parentElement.closest('a') && walker.currentNode.textContent.includes(link.text))
            matches.push(walker.currentNode);
        for (const node of matches) {
          const parts = node.textContent.split(link.text);
          const fragment = document.createDocumentFragment();
          parts.forEach((part, index) => {
            if (index) {
              const a = document.createElement('a');
              a.textContent = link.text;
              a.href = link.url;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.style.cssText = 'color:inherit;font:inherit;letter-spacing:inherit;text-underline-offset:2px';
              fragment.append(a);
            }
            fragment.append(document.createTextNode(part));
          });
          node.replaceWith(fragment);
        }
      }
      textBlock(
        sheet,
        'pageNo',
        (typeSpec?.pageNoPrefix || '') + String(i + 1).padStart(2, '0'),
        regions.pageNo,
        'pageNo',
      );
    }
    for (const n of sheet.querySelectorAll('.block:not(.component)'))
      if (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1)
        report.issues.push(issue('CAPACITY', '文字区域装不下', { block: n.dataset.block }));
    report.ok = report.issues.length === 0;
    const note = document.createElement('details');
    note.innerHTML = '<summary>逐字稿</summary>';
    const content = document.createElement('p');
    content.textContent = page.speakerNotes;
    note.append(content);
    const status = document.createElement('pre');
    status.className = 'report';
    status.textContent = JSON.stringify(
      {
        automatic: report.ok ? 'pass' : 'fail',
        issues: report.issues,
        expressionReview: '需要人工核对观点、证据及关系完整性',
      },
      null,
      2,
    );
    if (deck.debug === true) note.append(status);
    document.querySelector('main').append(note);
  }
  window.validationReport = reports;
  window.renderComplete = true;
})().catch((e) => {
  if (typeof window.renderFatal === 'function') window.renderFatal(e);
  else {
    window.validationReport = [
      { ok: false, issues: [{ code: e.code || 'RUNTIME', message: e.message, hint: e.hint }] },
    ];
    window.renderComplete = true;
    window.renderFailed = true;
    document.querySelector('main').textContent = e.message;
  }
});
