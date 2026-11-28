// 关系、结构与流向图表家族：层级树、流程图/关系网络、包含关系、分层架构、漏斗、桑基。
window.ThemeRendererFamilies.relational = (() => {
  const { fail, num, setup, rampColor } = window.ThemeRendererShared;

  function graphDraw(p, nodes, edges, opt, box, info = {}) {
    const pad = p.tokens.padding,
      vertical = opt.direction === 'vertical',
      W = box.width,
      H = box.height,
      feedback = edges.some((e) => e.feedback) ? 32 : 0;
    let levels = info.depth + 1 || 1,
      maxCross = info.leaves || 1;
    if (!info.hierarchy && !info.network) {
      const rank = new Map(nodes.map((n) => [n.id, 0])),
        indegree = new Map(nodes.map((n) => [n.id, edges.filter((e) => !e.feedback && e.to === n.id).length])),
        queue = nodes.filter((n) => !indegree.get(n.id));
      let visited = 0;
      while (queue.length) {
        const n = queue.shift();
        visited++;
        for (const e of edges.filter((edge) => !edge.feedback && edge.from === n.id)) {
          rank.set(e.to, Math.max(rank.get(e.to), rank.get(n.id) + 1));
          indegree.set(e.to, indegree.get(e.to) - 1);
          if (!indegree.get(e.to)) queue.push(nodes.find((node) => node.id === e.to));
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
    const nodeH =
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
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
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
    const svg = p.svg;
    const ns = 'http://www.w3.org/2000/svg',
      defs = svg.ownerDocument.createElementNS(ns, 'defs');
    defs.innerHTML = `<marker id="native-tip" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 3L0 6Z" fill="${p.color('muted')}"/></marker>`;
    svg.append(defs);
    edges.forEach((e, i) => {
      const a = map.get(e.from),
        b = map.get(e.to);
      let x1, y1, x2, y2, d, lx, ly;
      if (info.network) {
        const dx = b.x - a.x,
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
        const yy = H - 8;
        d = `M${x1} ${y1}V${yy}H${x2}V${y2}`;
        lx = (x1 + x2) / 2;
        ly = yy;
      } else if (vertical) {
        x1 = a.x;
        y1 = a.y + nodeH / 2;
        x2 = b.x;
        y2 = b.y - nodeH / 2;
        const mid = (y1 + y2) / 2;
        d = `M${x1} ${y1}V${mid}H${x2}V${y2}`;
        lx = (x1 + x2) / 2;
        ly = mid;
      } else {
        x1 = a.x + nodeW / 2;
        y1 = a.y;
        x2 = b.x - nodeW / 2;
        y2 = b.y;
        const mid = (x1 + x2) / 2;
        d = `M${x1} ${y1}H${mid}V${y2}H${x2}`;
        lx = mid;
        ly = (y1 + y2) / 2;
      }
      p.line('edge' + i, d, 'muted', {
        'data-connector': 'true',
        'data-shape-role': 'edge' + i,
        'data-focus-key': 'edge' + i,
        'data-link-from': 'node' + e.from,
        'data-link-to': 'node' + e.to,
        ...(!info.hierarchy && opt.arrows !== false ? { 'marker-end': 'url(#native-tip)' } : {}),
      });
      if (e.label && opt.labels !== false) {
        const el2 = p.text(lx, ly, e.label, 'pill', 'middle', { 'data-line-label': 'true' });
        el2.setAttribute('data-label-for', 'edge' + i);
      }
    });
    nodes.forEach((n) => {
      const x = n.x - nodeW / 2,
        y = n.y - nodeH / 2;
      if (n.type === 'decision')
        p.add('path', {
          'data-shape-role': p.tokens.nodeFill,
          'data-focus-key': 'node' + n.id,
          'data-focus-label': String(n.title || n.id),
          d: `M${n.x} ${y}L${x + nodeW} ${n.y}L${n.x} ${y + nodeH}L${x} ${n.y}Z`,
          fill: p.color(p.tokens.nodeFill),
          stroke: p.color('muted'),
          'stroke-width': p.theme.rules.dividerWidthPx,
        });
      else if (info.network)
        p.add('ellipse', {
          'data-shape-role': p.tokens.nodeFill,
          'data-focus-key': 'node' + n.id,
          'data-focus-label': String(n.title || n.id),
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
          'data-shape-role': 'node' + n.id,
          'data-focus-key': 'node' + n.id,
          'data-focus-label': String(n.title || n.id),
          rx: ['start', 'end'].includes(n.type) ? nodeH / 2 : p.tokens.radius,
        });
      const ls = p.wrap(n.title, nodeW - pad, 'cardTitle'),
        hasBody = opt.details !== false && !!n.body;
      if (hasBody) {
        const tx = x + pad / 2,
          ty = y + pad + lineH / 2;
        ls.forEach((line, i) => p.text(tx, ty + i * lineH, line, 'cardTitle', 'start', { 'data-node-title': n.id }));
        p.block(tx, ty + ls.length * lineH + p.tokens.gap, n.body, nodeW - pad, 'body', 'start', {
          'data-line-label': 'true',
          'data-label-for': 'node' + n.id,
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

  function hierarchy(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box),
      nodes = [],
      edges = [];
    let leaves = 0,
      depth = 0;
    function visit(n, d, parent) {
      if (!n?.title || (n.children && !Array.isArray(n.children))) fail('DATA', '需要有效根节点及children');
      const item = { id: 'n' + nodes.length, title: n.title, body: n.body, depth: d };
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

  // 分层架构：层框横向铺满，模块在层内均分，层名在左。
  function layers(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const rows = input.layers || [];
    if (!rows.length || rows.some((l) => !l.name || !Array.isArray(l.items) || !l.items.length))
      fail('DATA', '分层架构需要层名与模块');
    const gap = p.tokens.gap,
      nameW = p.tokens.labelGutterPx,
      left = p.tokens.padding,
      right = box.width - p.tokens.padding,
      top = p.tokens.padding,
      bottom = box.height - p.tokens.padding,
      bandH = (bottom - top - gap * (rows.length - 1)) / rows.length;
    rows.forEach((layer, i) => {
      const y = top + i * (bandH + gap);
      p.text(left, y + bandH / 2, layer.name, 'category', 'start');
      const x0 = left + nameW,
        w = right - x0,
        n = layer.items.length,
        itemGap = gap,
        iw = (w - itemGap * (n - 1)) / n;
      p.add('rect', {
        x: x0,
        y,
        width: w,
        height: bandH,
        'data-shape-role': 'band' + i,
        'data-focus-key': 'band' + i,
        'data-focus-label': layer.name,
        rx: theme.materials.radius,
        fill: p.color(i % 2 ? 'soft' : 'paper'),
        stroke: p.color('line'),
        'stroke-width': theme.rules.dividerWidthPx,
      });
      layer.items.forEach((item, j) => {
        const ix = x0 + j * (iw + itemGap) + iw / 2,
          key = 'item' + i + '-' + j;
        p.add('rect', {
          x: ix - iw / 2,
          y: y + bandH * 0.22,
          width: iw,
          height: bandH * 0.56,
          rx: Math.min(6, bandH / 8),
          fill: p.color('paper'),
          'fill-opacity': 0.6,
          stroke: p.color('line'),
          'stroke-width': theme.rules.dividerWidthPx,
          'data-shape-role': key,
          'data-focus-key': key,
          'data-focus-label': item.title || item.name || '',
        });
        const t2 = p.text(ix, y + bandH / 2, item.title || item.name || '', 'body', 'middle');
        t2.setAttribute('data-label-for', key);
      });
    });
    return { layers: rows.length };
  }

  // 漏斗：自上而下居中，宽度按阶段数量，阶段之间写转化率。
  function funnel(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const st = input.stages || [];
    if (st.length < 2 || st.some((d) => !d.label || !Number.isFinite(d.value) || d.value < 0))
      fail('DATA', '漏斗需要至少两个阶段的非负数量');
    if (st.length > 8) fail('CAPACITY', '漏斗阶段数超过八个，改用表格');
    for (let i = 1; i < st.length; i++) if (st[i].value > st[i - 1].value) fail('DATA', '漏斗各阶段数量只能递减');
    const pad = p.tokens.padding * 2,
      top = pad,
      bottom = box.height - pad,
      gap = p.tokens.blockGapPx,
      rowH = (bottom - top - gap * (st.length - 1)) / st.length,
      maxV = st[0].value || 1,
      cx = box.width / 2,
      maxW = (box.width - pad * 2) * 0.82;
    st.forEach((d, i) => {
      const y = top + i * (rowH + gap),
        w = Math.max(p.tokens.minBarPx, (d.value / maxV) * maxW),
        x = cx - w / 2,
        f = i / Math.max(st.length - 1, 1);
      p.box('stage' + i, x, y, w, rowH, p.series(0), {
        rx: Math.min(6, rowH / 4),
        fill: rampColor(theme, f * 0.75),
        'data-shape-role': 'stage' + i,
        'data-focus-key': 'stage' + i,
        'data-focus-label': d.label + ' ' + num(d.value),
      });
      p.text(x - p.tokens.gap, y + rowH / 2, d.label, 'category', 'end');
      p.text(x + w + p.tokens.gap, y + rowH / 2, num(d.value), 'pill', 'start');
      if (opt.conversion !== false && i) {
        const rate = st[i - 1].value ? (d.value / st[i - 1].value) * 100 : 0;
        p.text(cx, y - gap / 2, num(+rate.toFixed(1)) + '%', 'unit', 'middle');
      }
    });
    return { stages: st.length };
  }

  // 包含关系：外框写范围名，内部模块均分。
  function containment(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const items = input.items || [];
    if (!input.name || !items.length) fail('DATA', '包含关系需要范围名与内部模块');
    const pad = p.tokens.padding * 2,
      head = p.roles.category.size * 2.4,
      x = pad,
      y = pad,
      w = box.width - pad * 2,
      h = box.height - pad * 2;
    p.add('rect', {
      x,
      y,
      width: w,
      height: h,
      rx: theme.materials.radius,
      fill: p.color('soft'),
      stroke: p.color('line'),
      'stroke-width': theme.rules.dividerWidthPx,
    });
    p.text(x + p.tokens.padding, y + head * 0.7, input.name, 'category', 'start');
    const n = items.length,
      cols = n <= 4 ? n : Math.ceil(n / 2),
      rows = Math.ceil(n / cols),
      gap = p.tokens.gap,
      iw = (w - p.tokens.padding * 2 - gap * (cols - 1)) / cols,
      ih = (h - head - p.tokens.padding - gap * (rows - 1)) / rows;
    items.forEach((it, i) => {
      const r = Math.floor(i / cols),
        c = i % cols,
        ix = x + p.tokens.padding + c * (iw + gap),
        iy = y + head + r * (ih + gap);
      p.add('rect', {
        x: ix,
        y: iy,
        width: iw,
        height: ih,
        rx: Math.min(6, ih / 6),
        fill: p.color('paper'),
        stroke: p.color('line'),
        'stroke-width': theme.rules.dividerWidthPx,
        'data-shape-role': 'inner' + i,
        'data-focus-key': 'inner' + i,
        'data-focus-label': it.title || it.name || '',
      });
      p.text(ix + iw / 2, iy + ih / 2, it.title || it.name || '', 'body', 'middle');
    });
    return { items: n };
  }

  // 桑基：左右两列节点按流量分高，流带用三次贝塞尔。
  function sankey(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const l = input.left || [],
      r = input.right || [],
      links = input.links || [];
    if (!l.length || !r.length || !links.length) fail('DATA', '桑基需要左右节点与流量');
    const valid = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    for (const list of [l, r]) {
      if (list.some((n) => !n.name || !valid(n.value)) || new Set(list.map((n) => n.name)).size !== list.length)
        fail('DATA', '桑基节点需唯一名称与有限非负值');
    }
    const sums = { l: new Map(l.map((n) => [n.name, 0])), r: new Map(r.map((n) => [n.name, 0])) };
    for (const k of links) {
      if (!sums.l.has(k.from) || !sums.r.has(k.to) || !valid(k.value)) fail('DATA', '桑基连线引用无效或流量非法');
      sums.l.set(k.from, sums.l.get(k.from) + k.value);
      sums.r.set(k.to, sums.r.get(k.to) + k.value);
    }
    for (const [side, list] of [
      ['l', l],
      ['r', r],
    ])
      for (const n of list)
        if (Math.abs(sums[side].get(n.name) - n.value) > Math.max(1e-9, n.value * 1e-9))
          fail('DATA', '桑基节点与流量不守恒：' + n.name);
    if (!l.some((n) => n.value > 0)) fail('DATA', '桑基总流量必须大于零');
    const pad = p.tokens.padding * 2,
      nodeW = p.tokens.nodeWidthPx,
      gutter = p.tokens.gap * 2,
      labelGutter = p.tokens.labelGutterPx * 1.1,
      leftX = pad + labelGutter,
      rightX = box.width - pad - labelGutter - nodeW,
      top = pad,
      bottom = box.height - pad,
      lTotal = l.reduce((a, b) => a + b.value, 0),
      lH = (bottom - top - gutter * (Math.max(l.length, r.length) - 1)) / lTotal,
      rH = lH;
    if (lH <= 0) fail('CAPACITY', '桑基节点间距超出可用高度');
    const pos = { l: {}, r: {} };
    let y = top;
    l.forEach((n) => {
      pos.l[n.name] = { y, h: n.value * lH };
      y += n.value * lH + gutter;
    });
    y = top;
    r.forEach((n) => {
      pos.r[n.name] = { y, h: n.value * rH };
      y += n.value * rH + gutter;
    });
    const off = { l: {}, r: {} };
    l.forEach((n) => (off.l[n.name] = pos.l[n.name].y));
    r.forEach((n) => (off.r[n.name] = pos.r[n.name].y));
    const dx = (rightX - leftX - nodeW) * 0.42;
    links.forEach((k, i) => {
      const a = off.l[k.from],
        b = off.r[k.to];
      if (!Number.isFinite(a) || !Number.isFinite(b)) fail('DATA', '桑基连线引用无效');
      const th = k.value * lH,
        th2 = k.value * rH;
      off.l[k.from] += th;
      off.r[k.to] += th2;
      const d =
        `M${leftX + nodeW} ${a}C${leftX + nodeW + dx} ${a} ${rightX - dx} ${b} ${rightX} ${b}` +
        `L${rightX} ${b + th2}C${rightX - dx} ${b + th2} ${leftX + nodeW + dx} ${a + th} ${leftX + nodeW} ${a + th}Z`;
      p.add('path', {
        d,
        'data-shape-role': 'flow' + i,
        'data-focus-key': 'flow' + i,
        'data-link-from': 'nodel' + k.from,
        'data-link-to': 'noder' + k.to,
        'data-focus-label': k.from + ' → ' + k.to + ' ' + num(k.value),
        fill: rampColor(theme, 0.25 + (l.findIndex((n) => n.name === k.from) % 3) * 0.18),
        'fill-opacity': theme.materials.flowAlpha === undefined ? 0.55 : theme.materials.flowAlpha,
      });
    });
    const drawNodes = (list, x, side) =>
      list.forEach((n) => {
        const q = pos[side][n.name];
        p.add('rect', {
          x,
          y: q.y,
          width: nodeW,
          height: q.h,
          rx: nodeW / 3,
          fill: p.color('ink'),
          'data-shape-role': 'node' + side + n.name,
          'data-focus-key': 'node' + side + n.name,
          'data-focus-label': n.name + ' ' + num(n.value),
        });
        p.text(
          side === 'l' ? x - p.tokens.gap : x + nodeW + p.tokens.gap,
          q.y + q.h / 2,
          n.name + '(' + num(n.value) + ')',
          'category',
          side === 'l' ? 'end' : 'start',
        ).setAttribute('data-label-for', 'node' + side + n.name);
      });
    drawNodes(l, leftX, 'l');
    drawNodes(r, rightX, 'r');
    return { nodes: l.length + r.length };
  }

  return { hierarchy, graph, layers, funnel, containment, sankey };
})();
