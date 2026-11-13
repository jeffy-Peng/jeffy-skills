window.ThemeRenderers = (() => {
  const fail = (code, message) => {
      throw Object.assign(Error(message), { code });
    },
    num = (v) => Number(Number(v).toPrecision(6)).toString();
  function setup(svg, theme, box) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.style.cssText = `width:${box.width}px;height:${box.height}px`;
    // 笔触按族选择：主题给每个原型指定一套，未指定用线条。
    const archetype = window.__archetype || 'compare';
    const brushConfig = theme.brush || {};
    const brush = (brushConfig.byFamily && brushConfig.byFamily[archetype]) || brushConfig.default || 'line';
    const params = (brushConfig.params && brushConfig.params[brush]) || {};
    return ThemeDrawing.create(svg, theme);
  }
  function domain(vals, zero = true) {
    let lo = Math.min(...vals),
      hi = Math.max(...vals);
    if (zero) {
      lo = Math.min(0, lo);
      hi = Math.max(0, hi);
    }
    if (lo === hi) {
      let d = Math.abs(lo) * 0.1 || 1;
      lo -= zero && lo === 0 ? 0 : d;
      hi += d;
    }
    let raw = (hi - lo) / 4,
      p = 10 ** Math.floor(Math.log10(raw)),
      step = [1, 2, 2.5, 5, 10].find((v) => v * p >= raw) * p;
    return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
  }
  function frame(p, W, H, labels, range, metric, unit, horizontal = false, legend = []) {
    // 轴、单位、图例统一由 lib/kit 负责，几何只拿回可用区域与坐标换算。
    return KitAxis.frame(p, { width: W, height: H, labels, range, metric, unit, horizontal, legend, fail, num });
  }
  function bars(svg, input, opt, theme, box, material) {
    const p = setup(svg, theme, box),
      horizontal = opt.direction === 'horizontal',
      kind =
        material === 'BAR-002'
          ? 'grouped'
          : material === 'BAR-003'
            ? 'stacked'
            : material === 'BAR-006'
              ? 'waterfall'
              : 'single',
      percent = kind === 'stacked' && opt.mode === 'percent';
    if (opt.kind && opt.kind !== kind) fail('UNSUPPORTED', 'kind与素材ID不一致');
    let labels, rows, series;
    if (kind === 'waterfall') {
      if (!input.data?.length || input.data.some((d) => !d.label || !Number.isFinite(d.value)))
        fail('DATA', '瀑布图需要有限变化值');
      let total = 0;
      rows = input.data.map((d) => {
        let start = total;
        total += d.value;
        return { ...d, start, end: total };
      });
      rows.push({ label: '合计', start: 0, end: total, value: total, total: true });
      labels = rows.map((d) => d.label);
      series = [];
    } else {
      series = kind === 'single' ? ['数值'] : input.series;
      if (
        !input.data?.length ||
        !series?.length ||
        input.data.some(
          (d) =>
            !d.label ||
            !Array.isArray(d.values) ||
            d.values.length !== series.length ||
            d.values.some((v) => !Number.isFinite(v) || v < 0),
        )
      )
        fail('DATA', '需要非负分项和对应系列');
      rows = input.data.map((d) => {
        let sum = d.values.reduce((a, b) => a + b, 0);
        return { ...d, sum, values: percent ? d.values.map((v) => (sum ? (v / sum) * 100 : 0)) : d.values };
      });
      labels = rows.map((d) => d.label);
    }
    let values =
        kind === 'waterfall'
          ? rows.flatMap((d) => [d.start, d.end])
          : kind === 'stacked'
            ? rows.map((d) => d.values.reduce((a, b) => a + b, 0))
            : rows.flatMap((d) => d.values),
      range = percent ? { min: 0, max: 100, step: 25 } : domain(values),
      legend = ['grouped', 'stacked'].includes(kind)
        ? series.map((name, i) => ({ name, type: 'bar', paint: p.series(i) }))
        : [],
      f = frame(
        p,
        box.width,
        box.height,
        labels,
        range,
        input.metric || '名称',
        percent ? '%' : input.unit || '单位',
        horizontal,
        legend,
      ),
      slot = (horizontal ? f.bottom - f.top : f.right - f.left) / rows.length;
    if (!horizontal && labels.some((x) => p.measure(x) > slot - p.tokens.clearPx))
      fail('CAPACITY', '类别名称无法在当前列宽容纳');
    // 契约：低于可读厚度的柱不该硬画，宁可报容量让人分页。
    const guardRatio = Number.isFinite(opt.widthRatio) ? opt.widthRatio : 0.5;
    const guardThickness = Math.max(
      8,
      Math.min(slot * 0.8, (slot / (kind === 'grouped' ? rows[0]?.values?.length || 1 : 1)) * guardRatio),
    );
    if (guardThickness < p.tokens.minBarPx && rows.length > 4) fail('CAPACITY', '柱宽低于可读下限，需减少类别或分页');
    rows.forEach((d, i) => {
      let c = (horizontal ? f.top : f.left) + (i + 0.5) * slot;
      horizontal
        ? p.text(f.left - p.tokens.padding, c, d.label, 'category', 'end')
        : p.text(c, f.bottom + p.roles.category.size, d.label);
      if (percent && !d.sum) {
        p.text(
          horizontal ? f.left + p.tokens.blockGapPx : c,
          horizontal ? c : f.bottom - p.tokens.valueGapPx,
          '无占比',
        );
        return;
      }
      let entries = kind === 'waterfall' ? [d.value] : d.values,
        acc = 0;
      entries.forEach((value, j) => {
        let start = kind === 'waterfall' ? d.start : kind === 'stacked' ? acc : 0,
          end = kind === 'waterfall' ? d.end : start + value;
        acc = end;
        let a = f.coord(start),
          b = f.coord(end),
          widthRatio = Number.isFinite(opt.widthRatio) ? opt.widthRatio : 0.5,
          thickness = Math.max(
            p.tokens.minBarPx,
            Math.min(slot * 0.8, (slot / (kind === 'grouped' ? entries.length : 1)) * widthRatio),
          ),
          cross = c + (kind === 'grouped' ? (j - (entries.length - 1) / 2) * thickness : 0),
          paint = kind === 'waterfall' ? (d.total ? 'accent' : value < 0 ? 'accent2' : 'muted') : p.series(j),
          x = horizontal ? Math.min(a, b) : cross - thickness / 2,
          y = horizontal ? cross - thickness / 2 : Math.min(a, b),
          w = horizontal ? Math.abs(b - a) : thickness,
          h = horizontal ? thickness : Math.abs(b - a);
        // 实心柱不描边，避免柱边线和轴线粗细不一致；空心柱才用同色描边。
        const outline = theme.materials.barMode === 'outline';
        p.box('bar' + i + '-' + j, x, y, w, h, outline ? 'paper' : paint, {
          stroke: outline ? p.color(paint) : 'none',
          'data-value': value,
          'data-category': d.label,
        });
        if (kind === 'stacked') {
          if (!percent) return;
          const label = num(+value.toFixed(1)) + '%';
          if (p.measure(label) > (horizontal ? w : slot) - p.tokens.clearPx)
            fail('CAPACITY', '分段标签放不下，需调整表达');
          p.text(horizontal ? x + w / 2 : cross, horizontal ? cross : y + h / 2, label, 'pill', 'middle', {
            fill: p.color(theme.materials.barMode === 'outline' ? 'body' : p.contrast(paint)),
          });
        } else
          p.text(
            horizontal ? Math.max(a, b) + p.tokens.clearPx : cross,
            horizontal ? cross : Math.min(a, b) - p.roles.pill.size,
            (kind === 'waterfall' && !d.total && i ? (value > 0 ? '+' : '') : '') + num(value),
            'pill',
            horizontal ? 'start' : 'middle',
          );
      });
      if (kind === 'stacked' && !percent)
        p.text(
          horizontal ? f.coord(acc) + p.tokens.clearPx : c,
          horizontal ? c : f.coord(acc) - p.roles.pill.size,
          num(acc),
          'pill',
          horizontal ? 'start' : 'middle',
        );
    });
    f.finish();
    return { ...range, rows: rows.length };
  }
  function lines(svg, input, opt, theme, box) {
    if (opt.area) fail('UNSUPPORTED', '主题折线填充面积尚未迁移，请依规范绘制或关闭面积选项');
    const p = setup(svg, theme, box);
    if (
      !input.labels?.length ||
      !input.series?.length ||
      input.series.some(
        (s) => s.values.length !== input.labels.length || s.values.some((v) => v !== null && !Number.isFinite(v)),
      )
    )
      fail('DATA', '时期与系列长度或值无效');
    let series = (opt.single ? input.series.slice(0, 1) : input.series).map((s) => {
        let sum = 0,
          missing = false,
          base = s.values[0];
        if (opt.mode === 'index' && (base === 0 || base === null)) fail('DATA', '指数基期需非零');
        return {
          ...s,
          values: s.values.map((v) => {
            if (opt.mode === 'cumulative') {
              if (v === null) missing = true;
              else sum += v;
              return missing ? null : sum;
            }
            return v === null ? null : opt.mode === 'index' ? (v / base) * 100 : v;
          }),
        };
      }),
      vals = series.flatMap((s) => s.values).filter((v) => v !== null);
    if (!vals.length) fail('DATA', '没有有效数值');
    // 折线默认零基线，看变化幅度时在提纲里写 zero: false。
    let range = domain(vals, opt.zero !== false),
      legend = series.map((s, i) => ({ name: s.name, type: 'line', paint: p.series(i), dash: i ? '6 4' : '' })),
      f = frame(
        p,
        box.width,
        box.height,
        input.labels,
        range,
        input.metric || '指标',
        input.unit || '单位',
        false,
        legend,
      ),
      slot = (f.right - f.left) / input.labels.length;
    input.labels.forEach((l, i) => {
      if (p.measure(l) > slot - p.tokens.clearPx) fail('CAPACITY', '时期标签放不下');
      p.text(f.left + (i + 0.5) * slot, f.bottom + p.roles.pill.size, l);
    });
    series.forEach((s, j) => {
      let d = '',
        last = null;
      s.values.forEach((v, i) => {
        if (v === null) {
          last = null;
          return;
        }
        let x = f.left + (i + 0.5) * slot,
          y = f.coord(v);
        d += last ? (opt.shape === 'step' ? `H${x}V${y}` : `L${x} ${y}`) : `M${x} ${y}`;
        last = [x, y];
        if (opt.points) p.add('circle', { cx: x, cy: y, r: 3, fill: p.color('paper'), stroke: p.color(p.series(j)) });
        if (opt.labels) p.text(x, y - p.tokens.valueGapPx, num(v));
      });
      p.line('series' + j, d, opt.focus !== undefined && opt.focus !== j ? 'muted' : p.series(j), {
        'stroke-dasharray': j ? '6 4' : '',
      });
    });
    // 轴线与单位在内容之后画，避免被折线压住；漏掉这一步就只有刻度没有轴。
    f.finish();
    return range;
  }
  function table(container, input, opt, theme, box) {
    if (
      !input.columns?.length ||
      !Array.isArray(input.rows) ||
      input.rows.some((r) => r.length !== input.columns.length)
    )
      fail('DATA', '表格列数不一致');
    const doc = container.ownerDocument,
      svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    doc.body.append(svg);
    const p = ThemeDrawing.create(svg, theme);
    let widths = input.columns.map((x, i) =>
        Math.max(
          75,
          Math.min(
            240,
            Math.max(p.measure(x, 'body'), ...input.rows.map((r) => p.measure(r[i] ?? '—', 'body'))) +
              2 * p.tokens.padding,
          ),
        ),
      ),
      minimum = widths.reduce((a, b) => a + b, 0);
    svg.remove();
    container.replaceChildren();
    let t = doc.createElement('table');
    t.dataset.nativeTheme = 'true';
    t.style.cssText = `width:100%;table-layout:fixed;border-collapse:collapse;color:${p.color('body')};font-size:${p.roles.body.size}px;line-height:${p.roles.body.lineHeight}`;
    container.append(t);
    let cg = doc.createElement('colgroup');
    t.append(cg);
    widths.forEach((w) => {
      let c = doc.createElement('col');
      c.style.width = (w / minimum) * 100 + '%';
      cg.append(c);
    });
    for (const [i, row] of [input.columns, ...input.rows].entries()) {
      let tr = doc.createElement('tr');
      t.append(tr);
      row.forEach((v, j) => {
        let td = doc.createElement(i ? 'td' : 'th');
        td.style.cssText = `text-align:center;vertical-align:middle;padding:${p.tokens.padding / 2}px ${p.tokens.padding}px;border-bottom:${theme.rules.dividerWidthPx}px solid ${p.color('line')};font-weight:${i ? p.roles.body.weight : p.roles.cardTitle.weight};background:${p.color(!i || opt.focus === j ? 'soft' : 'paper')}`;
        td.textContent = v === null ? '—' : String(v);
        tr.append(td);
      });
    }
    if (input.note) {
      let n = doc.createElement('p');
      n.style.fontSize = p.roles.source.size + 'px';
      n.textContent = input.note;
      container.append(n);
    }
    return { minWidth: minimum, rows: input.rows.length, columns: input.columns.length };
  }
  function timeline(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    if (!input.events?.length) fail('DATA', '需要事件');
    const events = input.events.map((e) => ({ ...e, t: Date.parse(e.date) })).sort((a, b) => a.t - b.t);
    if (
      events.some((e) => !Number.isFinite(e.t) || !e.title) ||
      new Set(events.map((e) => e.id)).size !== events.length
    )
      fail('DATA', '日期、标题和ID需有效');
    let vertical = opt.direction === 'vertical',
      min = events[0].t,
      span = events.at(-1).t - min,
      pad = p.tokens.padding,
      labelW = Math.max(...events.map((e) => p.measure(e.date))),
      start = vertical ? pad + 25 : pad + labelW / 2,
      end = vertical ? box.height - pad - 25 : box.width - pad - labelW / 2,
      axis = vertical ? labelW + 2 * pad : box.height * 0.38;
    p.line('time', vertical ? `M${axis} ${start}V${end}` : `M${start} ${axis}H${end}`, 'muted');
    events.forEach((e, i) => {
      let t = opt.spacing === 'equal' || span === 0 ? i / Math.max(1, events.length - 1) : (e.t - min) / span,
        v = start + (end - start) * t;
      p.add('circle', {
        cx: vertical ? axis : v,
        cy: vertical ? v : axis,
        r: opt.focus === e.id ? 5 : 3.5,
        fill: p.color(opt.focus === e.id ? 'accent' : 'paper'),
        stroke: p.color('accent'),
      });
      p.text(vertical ? axis - pad : v, vertical ? v : axis - 25, e.date, 'pill', vertical ? 'end' : 'middle');
      p.text(vertical ? axis + pad : v, vertical ? v : axis + 30, e.title, 'cardTitle', vertical ? 'start' : 'middle');
      if (opt.details && e.body)
        p.block(
          vertical ? axis + pad : v,
          vertical ? v + 30 : axis + 58,
          e.body,
          vertical ? box.width - axis - pad * 2 : (end - start) / events.length - 10,
          'body',
          vertical ? 'start' : 'middle',
        );
    });
    return { events: events.length };
  }
  function hierarchy(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box),
      nodes = [],
      edges = [];
    let leaves = 0,
      depth = 0;
    function visit(n, d, parent) {
      if (!n?.title || (n.children && !Array.isArray(n.children))) fail('DATA', '需要有效根节点及children');
      let item = { id: 'n' + nodes.length, title: n.title, body: n.body, depth: d };
      nodes.push(item);
      depth = Math.max(depth, d);
      if (parent) edges.push({ from: parent.id, to: item.id });
      if (n.children?.length) {
        const kids = n.children.map((c) => visit(c, d + 1, item));
        item.slot = (kids[0].slot + kids.at(-1).slot) / 2;
      } else item.slot = leaves++;
      return item;
    }
    visit(input.root, 0);
    return graphDraw(p, nodes, edges, opt, box, { leaves, depth, hierarchy: true });
  }
  function graphDraw(p, nodes, edges, opt, box, info = {}) {
    const pad = p.tokens.padding,
      vertical = opt.direction === 'vertical',
      W = box.width,
      H = box.height,
      feedback = edges.some((e) => e.feedback) ? 32 : 0;
    let levels = info.depth + 1 || 1,
      maxCross = info.leaves || 1;
    if (!info.hierarchy && !info.network) {
      let rank = new Map(nodes.map((n) => [n.id, 0])),
        indegree = new Map(nodes.map((n) => [n.id, edges.filter((e) => !e.feedback && e.to === n.id).length])),
        queue = nodes.filter((n) => !indegree.get(n.id)),
        visited = 0;
      while (queue.length) {
        let n = queue.shift();
        visited++;
        for (let e of edges.filter((e) => !e.feedback && e.from === n.id)) {
          rank.set(e.to, Math.max(rank.get(e.to), rank.get(n.id) + 1));
          indegree.set(e.to, indegree.get(e.to) - 1);
          if (!indegree.get(e.to)) queue.push(nodes.find((n) => n.id === e.to));
        }
      }
      if (visited !== nodes.length) fail('DATA', '循环返回边须标feedback');
      nodes.forEach((n) => (n.depth = rank.get(n.id)));
      levels = Math.max(...rank.values()) + 1;
      maxCross = Math.max(...Array.from({ length: levels }, (_, d) => nodes.filter((n) => n.depth === d).length));
      nodes.forEach((n) => {
        const peers = nodes.filter((x) => x.depth === n.depth);
        n.slot = peers.indexOf(n);
        n.cross = peers.length;
      });
    }
    const maxW =
        Math.max(...nodes.map((n) => p.measure(n.title, 'cardTitle') * (n.type === 'decision' ? 2 : 1))) + pad * 2,
      cellW = info.network ? W / 2 : vertical ? (W - pad * 2) / maxCross : (W - pad * 2) / levels,
      cellH = info.network ? H / 2 : vertical ? (H - pad * 2 - feedback) / levels : (H - pad * 2 - feedback) / maxCross,
      nodeW = Math.min(maxW, cellW - pad * 2),
      lineH = p.roles.cardTitle.size * p.roles.cardTitle.lineHeight;
    if (nodeW < 40) fail('CAPACITY', '节点宽度不足');
    let nodeH =
      Math.max(
        ...nodes.map(
          (n) =>
            p.wrap(n.title, nodeW - pad, 'cardTitle').length * lineH +
            (opt.details !== false && n.body
              ? p.tokens.gap + p.wrap(n.body, nodeW - pad, 'body').length * p.roles.body.size * p.roles.body.lineHeight
              : 0),
        ),
      ) + pad;
    if (nodeH > cellH - 4 && !info.network) fail('CAPACITY', '节点高度不足');
    nodes.forEach((n, i) => {
      if (info.network) {
        let a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
        n.x = W / 2 + Math.cos(a) * (W / 2 - nodeW / 2 - pad);
        n.y = H / 2 + Math.sin(a) * (H / 2 - nodeH / 2 - pad);
      } else if (vertical) {
        n.x = info.hierarchy
          ? pad + ((n.slot + 0.5) * (W - pad * 2)) / maxCross
          : pad + ((n.slot + 0.5) * (W - pad * 2)) / n.cross;
        n.y = pad + ((n.depth + 0.5) * (H - pad * 2 - feedback)) / levels;
      } else {
        n.x = pad + ((n.depth + 0.5) * (W - pad * 2)) / levels;
        n.y = info.hierarchy
          ? pad + ((n.slot + 0.5) * (H - pad * 2 - feedback)) / maxCross
          : pad + ((n.slot + 0.5) * (H - pad * 2 - feedback)) / n.cross;
      }
    });
    const map = new Map(nodes.map((n) => [n.id, n]));
    const svg = p.text(0, 0, '').ownerSVGElement;
    svg.lastElementChild.remove();
    const ns = 'http://www.w3.org/2000/svg',
      defs = svg.ownerDocument.createElementNS(ns, 'defs');
    defs.innerHTML = `<marker id="native-tip" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 3L0 6Z" fill="${p.color('muted')}"/></marker>`;
    svg.append(defs);
    edges.forEach((e, i) => {
      let a = map.get(e.from),
        b = map.get(e.to),
        x1,
        y1,
        x2,
        y2,
        d,
        lx,
        ly;
      if (info.network) {
        let dx = b.x - a.x,
          dy = b.y - a.y,
          t = 1 / Math.sqrt((dx / (nodeW / 2)) ** 2 + (dy / (nodeH / 2)) ** 2);
        x1 = a.x + dx * t;
        y1 = a.y + dy * t;
        x2 = b.x - dx * t;
        y2 = b.y - dy * t;
        d = `M${x1} ${y1}L${x2} ${y2}`;
        lx = (x1 + x2) / 2;
        ly = (y1 + y2) / 2;
      } else if (e.feedback) {
        x1 = a.x;
        y1 = a.y + nodeH / 2;
        x2 = b.x;
        y2 = b.y + nodeH / 2;
        let yy = H - 8;
        d = `M${x1} ${y1}V${yy}H${x2}V${y2}`;
        lx = (x1 + x2) / 2;
        ly = yy;
      } else if (vertical) {
        x1 = a.x;
        y1 = a.y + nodeH / 2;
        x2 = b.x;
        y2 = b.y - nodeH / 2;
        let mid = (y1 + y2) / 2;
        d = `M${x1} ${y1}V${mid}H${x2}V${y2}`;
        lx = (x1 + x2) / 2;
        ly = mid;
      } else {
        x1 = a.x + nodeW / 2;
        y1 = a.y;
        x2 = b.x - nodeW / 2;
        y2 = b.y;
        let mid = (x1 + x2) / 2;
        d = `M${x1} ${y1}H${mid}V${y2}H${x2}`;
        lx = mid;
        ly = (y1 + y2) / 2;
      }
      p.line('edge' + i, d, 'muted', {
        'data-connector': 'true',
        ...(!info.hierarchy && opt.arrows !== false ? { 'marker-end': 'url(#native-tip)' } : {}),
      });
      if (e.label && opt.labels !== false) p.text(lx, ly, e.label, 'pill', 'middle', { 'data-line-label': 'true' });
    });
    nodes.forEach((n) => {
      let x = n.x - nodeW / 2,
        y = n.y - nodeH / 2;
      if (n.type === 'decision')
        p.add('path', {
          'data-shape-role': p.tokens.nodeFill,
          d: `M${n.x} ${y}L${x + nodeW} ${n.y}L${n.x} ${y + nodeH}L${x} ${n.y}Z`,
          fill: p.color(p.tokens.nodeFill),
          stroke: p.color('muted'),
          'stroke-width': p.theme.rules.dividerWidthPx,
        });
      else if (info.network)
        p.add('ellipse', {
          'data-shape-role': p.tokens.nodeFill,
          cx: n.x,
          cy: n.y,
          rx: nodeW / 2,
          ry: nodeH / 2,
          fill: p.color(opt.focus === n.id ? 'soft' : p.tokens.nodeFill),
          stroke: p.color('muted'),
          'stroke-width': p.theme.rules.dividerWidthPx,
        });
      else
        p.box(n.id, x, y, nodeW, nodeH, opt.focus === n.id ? 'soft' : p.tokens.nodeFill, {
          rx: ['start', 'end'].includes(n.type) ? nodeH / 2 : p.tokens.radius,
        });
      let ls = p.wrap(n.title, nodeW - pad, 'cardTitle'),
        hasBody = opt.details !== false && !!n.body;
      if (hasBody) {
        const tx = x + pad / 2,
          ty = y + pad + lineH / 2;
        ls.forEach((line, i) => p.text(tx, ty + i * lineH, line, 'cardTitle', 'start', { 'data-node-title': n.id }));
        p.block(tx, ty + ls.length * lineH + p.tokens.gap, n.body, nodeW - pad, 'body', 'start', {
          'data-line-label': 'true',
        });
      } else
        ls.forEach((line, i) =>
          p.text(n.x, n.y + (i - (ls.length - 1) / 2) * lineH, line, 'cardTitle', 'middle', {
            'data-node-title': n.id,
          }),
        );
    });
    return { nodes: nodes.length, edges: edges.length, nodeWidth: nodeW, nodeHeight: nodeH };
  }
  function graph(svg, input, opt, theme, box, material) {
    if (material === 'FLOW-001' && input.nodes?.some((n) => !['start', 'end', 'process', 'decision'].includes(n.type)))
      fail('DATA', '流程节点类型需为start/end/process/decision');
    const p = setup(svg, theme, box);
    if (
      !input.nodes?.length ||
      !Array.isArray(input.edges) ||
      new Set(input.nodes.map((n) => n.id)).size !== input.nodes.length ||
      input.nodes.some((n) => !n.id || !n.title) ||
      input.edges.some((e) => !input.nodes.some((n) => n.id === e.from) || !input.nodes.some((n) => n.id === e.to))
    )
      fail('DATA', '节点或关系引用无效');
    return graphDraw(
      p,
      input.nodes.map((n) => ({ ...n })),
      input.edges,
      opt,
      box,
      { network: material === 'REL-006' },
    );
  }
  function pie(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    if (!input.data?.length || input.data.some((d) => !d.label || !Number.isFinite(d.value) || d.value < 0))
      fail('DATA', '占比图需要非负分项');
    let total = input.data.reduce((a, b) => a + b.value, 0);
    if (!total) {
      p.text(box.width / 2, box.height / 2, '无占比');
      return { total };
    }
    let cx = box.width / 2,
      cy = box.height / 2 - 20,
      R = Math.min(box.height * p.tokens.pieRadiusH, box.width * p.tokens.pieRadiusW),
      inner = opt.donut ? R * 0.6 : 0,
      angle = -Math.PI / 2,
      legend = input.data.map((d, i) => ({ name: `${d.label} ${num(d.value)}`, type: 'bar', paint: p.series(i) }));
    input.data.forEach((d, i) => {
      if (!d.value) return;
      let end = angle + (d.value / total) * 2 * Math.PI,
        pt = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
        a = pt(angle, R),
        b = pt(end, R),
        c = pt(end, inner),
        z = pt(angle, inner);
      if (d.value === total) end -= 0.000001;
      let path =
        `M${a}A${R} ${R} 0 ${end - angle > Math.PI ? 1 : 0} 1 ${pt(end, R)}L${c}` +
        (inner ? `A${inner} ${inner} 0 ${end - angle > Math.PI ? 1 : 0} 0 ${z}` : `L${cx} ${cy}`) +
        'Z';
      // 取色交给笔触：线条返回主题色，玻璃返回半透明加亮边。
      const paint = p.slicePaint
        ? p.slicePaint(i)
        : {
            fill: p.color(p.series(i)),
            stroke: p.color('paper'),
            'stroke-width': theme.rules.dividerWidthPx,
          };
      p.add('path', { 'data-shape-role': p.series(i), d: path, ...paint });
      if (p.sliceHighlight) p.sliceHighlight(path);
      const mid = (angle + end) / 2,
        x = cx + Math.cos(mid) * (R + p.tokens.labelOffsetPx),
        y = cy + Math.sin(mid) * (R + p.tokens.labelOffsetPx);
      p.text(
        x,
        y,
        d.label + ' ' + (opt.percent === false ? num(d.value) : num(+((d.value / total) * 100).toFixed(1)) + '%'),
        'pill',
        Math.cos(mid) > 0 ? 'start' : 'end',
      );
      angle = end;
    });
    if (inner) {
      p.text(cx, cy - p.tokens.centerGapPx, input.centerLabel || '合计');
      p.text(cx, cy + 15, num(total), 'cardTitle');
    }
    p.legend(legend, box.width, box.height - p.roles.pill.size);
    return { total };
  }
  return {
    render(svgOrTable, data, opt, theme, box, id) {
      const allowed = id.startsWith('BAR-')
        ? ['direction', 'mode', 'kind', 'widthRatio']
        : id === 'LINE-001'
          ? ['single', 'mode', 'shape', 'zero', 'points', 'labels', 'focus', 'area']
          : id.startsWith('TABLE-')
            ? ['focus']
            : id === 'PIE-001'
              ? ['donut', 'percent']
              : id === 'TIME-001'
                ? ['direction', 'spacing', 'details', 'focus']
                : ['direction', 'details', 'arrows', 'labels', 'focus'];
      for (const k of Object.keys(opt)) if (!allowed.includes(k)) fail('UNSUPPORTED', '主题绘制尚未支持选项 ' + k);
      if (id.startsWith('BAR-')) return bars(svgOrTable, data, opt, theme, box, id);
      if (id === 'LINE-001') return lines(svgOrTable, data, opt, theme, box);
      if (id.startsWith('TABLE-')) return table(svgOrTable, data, opt, theme, box);
      if (id === 'TIME-001') return timeline(svgOrTable, data, opt, theme, box);
      if (id === 'REL-001') return hierarchy(svgOrTable, data, opt, theme, box);
      if (id === 'REL-006' || id === 'FLOW-001') return graph(svgOrTable, data, opt, theme, box, id);
      if (id === 'PIE-001') return pie(svgOrTable, data, opt, theme, box);
      fail('UNSUPPORTED', '尚未迁移主题渲染器 ' + id);
    },
  };
})();
