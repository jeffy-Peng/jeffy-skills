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
  // 相对亮度：格子上的字取深还是取浅，按背景实际亮度定。
  function luminance(hex) {
    const c = [0, 2, 4]
      .map((i) => parseInt(String(hex).replace('#', '').substr(i, 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // 取对比度更高的字色：底色深浅不定时，不能按固定阈值拍。
  function isLight(hex, inkHex, paperHex) {
    const l = luminance(hex);
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return ratio(l, luminance(inkHex)) >= ratio(l, luminance(paperHex));
  }
  // 明度阶梯：主题声明两端，中间按比例插值。占比/大小越大越深。
  function rampColor(theme, t, f) {
    const roles = t.shadeRamp && t.shadeRamp.length ? t.shadeRamp : ['ink', 'soft'],
      hex = (h) =>
        [0, 2, 4].map((i) =>
          parseInt(
            String(h)
              .replace('#', '')
              .slice(i, i + 2),
            16,
          ),
        ),
      a = hex(theme.colors[roles[0]]),
      b = hex(theme.colors[roles[roles.length - 1]]);
    return (
      '#' +
      a
        .map((c, i) =>
          Math.round(c + (b[i] - c) * f)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }
  function bars(svg, input, opt, theme, box, material) {
    const p = setup(svg, theme, box),
      horizontal = opt.direction === 'horizontal',
      kind =
        material === 'BAR-005'
          ? 'sign'
          : material === 'BAR-007'
            ? 'target'
            : material === 'DIST-001'
              ? 'distribution'
              : material === 'BAR-002'
                ? 'grouped'
                : material === 'BAR-003'
                  ? 'stacked'
                  : material === 'BAR-006'
                    ? 'waterfall'
                    : 'single',
      percent = kind === 'stacked' && opt.mode === 'percent';
    if (opt.kind && opt.kind !== kind && !['capsule', 'rung'].includes(opt.kind))
      fail('UNSUPPORTED', 'kind与素材ID不一致');
    const style = ['capsule', 'rung'].includes(opt.kind) ? opt.kind : theme.materials.barStyle || 'solid';
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
            d.values.some((v) => !Number.isFinite(v) || (v < 0 && kind !== 'sign')),
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
            : rows.flatMap((d) => (kind === 'target' ? d.values.slice(0, 1) : d.values)),
      range = percent ? { min: 0, max: 100, step: 25 } : domain(values),
      legend =
        kind === 'target'
          ? [
              { name: series[0] || '实际', type: 'bar', paint: p.series(0) },
              { name: series[1] || '目标', type: 'line', paint: 'ink' },
            ]
          : ['grouped', 'stacked'].includes(kind)
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
    if (kind === 'target') {
      const withTarget = rows.flatMap((d) => d.values);
      const r2 = domain(withTarget);
      range.max = Math.max(range.max, r2.max);
      range.min = Math.min(range.min, r2.min);
      f.finish && null;
    }
    if (!horizontal && labels.some((x) => p.measure(x) > slot - p.tokens.clearPx))
      fail('CAPACITY', '类别名称无法在当前列宽容纳');
    // 契约：低于可读厚度的柱不该硬画，宁可报容量让人分页。
    const guardRatio = Number.isFinite(opt.widthRatio) ? opt.widthRatio : kind === 'distribution' ? 1 : 0.5;
    const guardThickness = Math.max(
      8,
      Math.min(slot * 0.8, (slot / (kind === 'grouped' ? rows[0]?.values?.length || 1 : 1)) * guardRatio),
    );
    if (guardThickness < p.tokens.minBarPx && rows.length > 4) fail('CAPACITY', '柱宽低于可读下限，需减少类别或分页');
    // 排序：只在给定顺序之外重排，值和类别标签一起动；瀑布按累积画，不参与排序。
    if (opt.sort && opt.sort !== 'given' && kind !== 'waterfall') {
      const key = (d) => (kind === 'grouped' || kind === 'stacked' ? d.values.reduce((a, b) => a + b, 0) : d.values[0]);
      rows.sort((a, b) => (opt.sort === 'desc' ? key(b) - key(a) : key(a) - key(b)));
      labels = rows.map((d) => d.label);
    }
    const absValues = rows.flatMap((d) => (kind === 'waterfall' ? [d.value] : d.values).map((v) => Math.abs(v)));
    const maxAbs = Math.max(...absValues, 1),
      minAbs = Math.min(...absValues, maxAbs);
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
      let entries = kind === 'waterfall' ? [d.value] : kind === 'target' ? d.values.slice(0, 1) : d.values,
        acc = 0;
      entries.forEach((value, j) => {
        let start = kind === 'waterfall' ? d.start : kind === 'stacked' ? acc : 0,
          end = kind === 'waterfall' ? d.end : start + value;
        acc = end;
        let a = f.coord(start),
          b = f.coord(end),
          widthRatio = Number.isFinite(opt.widthRatio) ? opt.widthRatio : kind === 'distribution' ? 1 : 0.5,
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
        // 阶梯取色：柱子按大小排深浅，最大最深，与占比饼共用同一条明度阶梯。
        const ramp = theme.materials.barPalette === 'ramp';
        const rank = ramp
          ? Math.abs(value) === maxAbs
            ? 0
            : (maxAbs - Math.abs(value)) / Math.max(maxAbs - minAbs, 0.0001)
          : 0;
        const fillHex = ramp ? rampColor(theme, theme.materials, rank) : null;
        const radius = style === 'capsule' ? Math.min(w, h) / 2 : theme.materials.radius;
        const barNode = p.box('bar' + i + '-' + j, x, y, w, h, outline ? 'paper' : paint, {
          stroke: outline ? p.color(paint) : 'none',
          ...(fillHex ? { fill: fillHex } : {}),
          rx: radius,
          'data-value': value,
          'data-category': d.label,
          'data-focus-key': 'bar' + i + '-' + j,
          'data-focus-label': d.label + (series && series.length > 1 ? ' · ' + series[j] : '') + ' ' + num(value),
        });
        void barNode;
        // 刻度柱：一根刻度等于一个单位，值必须是小整数，柱内画横线，柱子本身留纸色做命中区。
        // 刻度柱：一格代表多少单位由值决定，最多画 24 格，超了按 2/5/10/20 合并，避免糊成条纹。
        const rungStep = (() => {
          const v = Math.abs(value);
          for (const st of [1, 2, 5, 10, 20, 50]) if (v / st <= 24) return st;
          return 100;
        })();
        if (style === 'rung' && Number.isInteger(Math.abs(value)) && Math.abs(value) > 0) {
          const n = Math.max(1, Math.round(Math.abs(value) / rungStep)),
            pitch = h / n;
          let d2 = '';
          for (let k = 0; k < n; k++) {
            const yy = y + h - (k + 0.5) * pitch;
            d2 += `M${x} ${yy}H${x + w}`;
          }
          p.add('path', {
            d: d2,
            fill: 'none',
            stroke: fillHex || p.color(paint),
            'stroke-width': Math.max(1, Math.min(3, pitch * 0.55)),
            'data-shape-role': 'rung' + i + '-' + j,
          });
          barNode.setAttribute('fill', p.color('paper'));
          barNode.setAttribute('fill-opacity', '0.001');
          if (rungStep > 1 && i === 0 && j === 0 && kind !== 'grouped')
            p.text(f.left, f.bottom + p.roles.category.size * 2.2, '一格 = ' + rungStep + ' 单位', 'unit', 'start');
        }
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
          ).setAttribute('data-label-for', 'bar' + i + '-' + j);
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
    // 目标对照柱：柱子是实际值，目标值画成一条横刻线，差距一眼看得出。
    if (kind === 'target') {
      rows.forEach((d, i) => {
        const target = Array.isArray(d.values) ? d.values[1] : undefined;
        if (!Number.isFinite(target)) return;
        const c = (horizontal ? f.top : f.left) + (i + 0.5) * slot,
          a = f.coord(target),
          half = Math.max(
            p.tokens.minBarPx,
            Math.min(slot * 0.8, slot * (Number.isFinite(opt.widthRatio) ? opt.widthRatio : 0.5)) / 2,
          );
        p.add('path', {
          d: horizontal ? `M${a} ${c - half}V${c + half}` : `M${c - half} ${a}H${c + half}`,
          fill: 'none',
          stroke: p.color('ink'),
          'stroke-width': Math.max(2, theme.rules.headerWidthPx * 2),
          'data-stroke-role': 'target',
        });
      });
    }
    // 正负柱：零基线必须画出来，正负靠位置区分，不只靠颜色。
    if (kind === 'sign') {
      const z = horizontal ? f.coord(0) : f.coord(0);
      p.add('path', {
        d: horizontal ? `M${z} ${f.top}V${f.bottom}` : `M${f.left} ${z}H${f.right}`,
        fill: 'none',
        stroke: p.color('ink'),
        'stroke-width': theme.rules.headerWidthPx,
        'data-stroke-role': 'zero-line',
      });
    }
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
    const hits = [];
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
        hits.push({ x, y, i, j, label: s.name + ' ' + input.labels[i] + ' ' + num(v) });
        if (opt.labels) p.text(x, y - p.tokens.valueGapPx, num(v));
      });
      p.line('series' + j, d, opt.focus !== undefined && opt.focus !== j ? 'muted' : p.series(j), {
        'stroke-dasharray': j ? '6 4' : '',
      });
    });
    // 命中的透明圆画在折线之后，否则会被线挡住点不中。
    hits.forEach((h) =>
      p.add('circle', {
        cx: h.x,
        cy: h.y,
        r: 11,
        fill: p.color('paper'),
        'fill-opacity': 0.001,
        'pointer-events': 'all',
        'data-shape-role': 'hit' + h.j + '-' + h.i,
        'data-focus-key': 'pt' + h.j + '-' + h.i,
        'data-focus-label': h.label,
      }),
    );
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
        if (i) {
          tr.dataset.focusKey = 'row' + i;
          tr.dataset.focusLabel = String(row[0]) + ' ' + String(row.slice(1).find((v) => v !== null) ?? '');
          tr.style.transition = 'opacity 160ms ease';
        }
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
        'data-shape-role': 'node' + i,
        'data-focus-key': 'node' + i,
        'data-focus-label': e.date + ' ' + (e.title || ''),
        cx: vertical ? axis : v,
        cy: vertical ? v : axis,
        r: opt.focus === e.id ? 5 : 3.5,
        fill: p.color(opt.focus === e.id ? 'accent' : 'paper'),
        stroke: p.color('accent'),
      });
      const dLab = p.text(
        vertical ? axis - pad : v,
        vertical ? v : axis - 25,
        e.date,
        'pill',
        vertical ? 'end' : 'middle',
      );
      dLab.setAttribute('data-label-for', 'node' + i);
      const tLab = p.text(
        vertical ? axis + pad : v,
        vertical ? v : axis + 30,
        e.title,
        'cardTitle',
        vertical ? 'start' : 'middle',
      );
      tLab.setAttribute('data-label-for', 'node' + i);
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
      let x = n.x - nodeW / 2,
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
      let ls = p.wrap(n.title, nodeW - pad, 'cardTitle'),
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
    if (opt.sort && opt.sort !== 'given')
      input.data = [...input.data].sort((a, b) => (opt.sort === 'desc' ? b.value - a.value : a.value - b.value));
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
      p.add('path', {
        'data-shape-role': p.series(i),
        'data-focus-key': 'slice' + i,
        'data-focus-label':
          d.label + ' ' + (opt.percent === false ? num(d.value) : num(+((d.value / total) * 100).toFixed(1)) + '%'),
        d: path,
        ...paint,
      });
      if (p.sliceHighlight) p.sliceHighlight(path);
      const mid = (angle + end) / 2,
        x = cx + Math.cos(mid) * (R + p.tokens.labelOffsetPx),
        y = cy + Math.sin(mid) * (R + p.tokens.labelOffsetPx);
      const labelNode = p.text(
        x,
        y,
        d.label + ' ' + (opt.percent === false ? num(d.value) : num(+((d.value / total) * 100).toFixed(1)) + '%'),
        'pill',
        Math.cos(mid) > 0 ? 'start' : 'end',
      );
      labelNode.setAttribute('data-label-for', 'slice' + i);
      angle = end;
    });
    if (inner) {
      p.text(cx, cy - p.tokens.centerGapPx, input.centerLabel || '合计');
      p.text(cx, cy + 15, num(total), 'cardTitle');
    }
    p.legend(legend, box.width, box.height - p.roles.pill.size);
    return { total };
  }
  // 双编码饼：角度读占比，半径读强度。扇瓣留缝做圆角，外圈内圈各一条虚线参考圈。
  function pieBigSlice(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const data = input.data || [];
    if (
      !data.length ||
      data.some(
        (d) =>
          !d.label || !Number.isFinite(d.value) || d.value < 0 || !Number.isFinite(d.intensity) || d.intensity <= 0,
      )
    )
      fail('DATA', '双编码饼需要非负数值与正的强度');
    const total = data.reduce((a, b) => a + b.value, 0);
    if (!total) {
      p.text(box.width / 2, box.height / 2, '无占比');
      return { total };
    }
    if (opt.sort && opt.sort !== 'given')
      data.sort((a, b) => (opt.sort === 'desc' ? b.value - a.value : a.value - b.value));
    const t = p.tokens,
      cx = box.width / 2,
      cy = box.height / 2 - 14,
      // 半径要给外侧标签留位置，否则标签顶出组件区域。
      R = Math.min(box.height * t.petalRadiusH, box.width * t.petalRadiusW, cy - (t.labelOffsetPx * 1.7 + 20)),
      rMin = R * t.petalMinRatio,
      rIn = Math.min(t.petalHolePx, rMin * 0.8),
      maxI = Math.max(...data.map((d) => d.intensity)),
      gap = (t.petalGapDeg * Math.PI) / 180,
      pt = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    // 明度跟占比走：最大的一块最深，按排序在墨色与浅灰之间线性插值。
    const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16)),
      rampRoles = t.shadeRamp?.length ? t.shadeRamp : ['ink', 'soft'],
      dark = hex(theme.colors[rampRoles[0]]),
      light = hex(theme.colors[rampRoles[rampRoles.length - 1]]),
      order = data.map((d, i) => ({ i, v: d.value })).sort((a, b) => b.v - a.v),
      shade = {};
    order.forEach((r, k) => {
      const f = order.length > 1 ? k / (order.length - 1) : 0;
      shade[r.i] =
        '#' +
        dark
          .map((c, j) =>
            Math.round(c + (light[j] - c) * f)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
    });
    // 参考圈：外圈是半径标尺的上限，内圈给出最小半径的位置。
    for (const r of [R, R * t.petalRingRatio])
      p.add('circle', {
        cx,
        cy,
        r,
        fill: 'none',
        stroke: p.color('muted'),
        'stroke-width': t.petalRingWidthPx,
        'stroke-dasharray': t.petalRingDash,
      });
    let angle = -Math.PI / 2;
    data.forEach((d, i) => {
      const span = (d.value / total) * 2 * Math.PI,
        a0 = angle + gap / 2,
        a1 = angle + span - gap / 2,
        rOut = rMin + (R - rMin) * (d.intensity / maxI),
        [x0i, y0i] = pt(a0, rIn),
        [x1i, y1i] = pt(a1, rIn),
        [x1o, y1o] = pt(a1, rOut),
        [x0o, y0o] = pt(a0, rOut),
        large = span > Math.PI ? 1 : 0,
        path =
          `M${x0i} ${y0i}A${rIn} ${rIn} 0 ${large} 1 ${x1i} ${y1i}L${x1o} ${y1o}` +
          `A${rOut} ${rOut} 0 ${large} 0 ${x0o} ${y0o}Z`;
      p.add('path', {
        'data-shape-role': 'petal' + i,
        'data-focus-key': 'petal' + i,
        'data-focus-label':
          d.label +
          ' ' +
          num(+((d.value / total) * 100).toFixed(1)) +
          '%' +
          (opt.intensity === false ? '' : ' · ' + num(d.intensity)),
        d: path,
        fill: shade[i],
        stroke: shade[i],
        'stroke-width': t.petalCornerPx,
        'stroke-linejoin': 'round',
        'data-corner-role': 'petalCorner',
      });
      const mid = angle + span / 2,
        [lx, ly] = pt(mid, rOut + t.labelOffsetPx * 1.7),
        cos = Math.cos(mid),
        pct = num(+((d.value / total) * 100).toFixed(1));
      const labelNode = p.text(
        lx,
        ly,
        d.label + ' ' + pct + '%' + (opt.intensity === false ? '' : ' · ' + num(d.intensity)),
        'pill',
        cos > 0.12 ? 'start' : cos < -0.12 ? 'end' : 'middle',
      );
      labelNode.setAttribute('data-label-for', 'petal' + i);
      angle += span;
    });
    if (opt.center) p.text(cx, cy, input.centerLabel || '合计', 'pill');
    return { total };
  }

  // 四象限：两轴各一个维度，分界值画出中轴，对象落在点上。
  function quadrant(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const pts = input.points || [];
    const b = input.boundary || {};
    if (!pts.length || pts.some((d) => !d.label || !Number.isFinite(d.x) || !Number.isFinite(d.y)))
      fail('DATA', '四象限需要对象的两个坐标');
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) fail('DATA', '四象限需要横纵分界值');
    const xs = pts.map((d) => d.x).concat(b.x),
      ys = pts.map((d) => d.y).concat(b.y),
      f = window.KitAxis.frame2d(p, {
        width: box.width,
        height: box.height,
        xRange: domain(xs, false),
        yRange: domain(ys, false),
        xLabel: input.xLabel,
        yLabel: input.yLabel,
        num,
      }),
      X = f.X,
      Y = f.Y;
    // 分界中轴：虚线，说明分界不是数据。
    p.add('path', {
      d: `M${X(b.x)} ${f.top}V${f.bottom}M${f.left} ${Y(b.y)}H${f.right}`,
      fill: 'none',
      stroke: p.color('line'),
      'stroke-width': theme.rules.dividerWidthPx,
      'stroke-dasharray': '4 6',
    });
    // 分界值写在轴旁，读的人才知道虚线卡在哪个数上。
    // 分界值贴轴但不出框：无轴模式下没有刻度行，值往图内收。
    const bareMode = (theme.materials.axisMode || 'auto') === 'none',
      byY = Math.min(f.bottom + p.roles.axis.size * 2.9, box.height - p.tokens.padding * 0.5),
      byX = bareMode ? f.left + p.tokens.gap : f.left - p.tokens.gap * 1.6;
    p.text(X(b.x), byY, num(b.x), 'unit', 'middle');
    p.text(byX, Y(b.y), num(b.y), 'unit', bareMode ? 'start' : 'end');
    pts.forEach((d, i) => {
      const x = X(d.x),
        y = Y(d.y);
      p.add('circle', {
        cx: x,
        cy: y,
        r: 5,
        fill: p.color('accent'),
        'data-shape-role': 'point' + i,
        'data-focus-key': 'point' + i,
        'data-focus-label': d.label + ' ' + num(d.x) + ' / ' + num(d.y),
      });
      const flip = x > f.right - 60;
      p.text(x + (flip ? -9 : 9), y - 9, d.label, 'category', flip ? 'end' : 'start').setAttribute(
        'data-label-for',
        'point' + i,
      );
    });
    return { points: pts.length };
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
        fill: rampColor(theme, theme.materials, f * 0.75),
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
  // 热力矩阵：单元格按值归一填色，缺失格留白（斜纹），行列表头在侧边。
  function heatmap(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const rows = input.rows || [],
      cols = input.cols || [],
      values = input.values || [],
      max = Number.isFinite(input.max) ? input.max : Math.max(...values.flat().filter((v) => Number.isFinite(v)), 1),
      min = Number.isFinite(input.min) ? input.min : 0;
    if (!rows.length || !cols.length || values.length !== rows.length)
      fail('DATA', '热力矩阵需要行列与同维度的数值矩阵');
    const pad = p.tokens.padding,
      nameW = p.tokens.labelGutterPx * 0.8,
      headH = p.roles.category.size * 2,
      left = pad + nameW,
      right = box.width - pad,
      top = pad + headH,
      bottom = box.height - pad,
      cellW = (right - left) / cols.length,
      cellH = (bottom - top) / rows.length,
      gap = Math.min(4, cellW * 0.06);
    cols.forEach((c, j) => p.text(left + (j + 0.5) * cellW, top - headH / 2, c, 'category', 'middle'));
    rows.forEach((r, i) => {
      p.text(left - p.tokens.gap, top + (i + 0.5) * cellH, r, 'category', 'end');
      cols.forEach((_, j) => {
        const v = values[i]?.[j],
          x = left + j * cellW,
          y = top + i * cellH;
        if (!Number.isFinite(v)) {
          // 缺失不是零：用斜纹留白，与最浅一档区分。
          p.add('rect', {
            x,
            y,
            width: cellW - gap,
            height: cellH - gap,
            rx: 4,
            fill: p.color('paper'),
            stroke: p.color('line'),
            'stroke-width': theme.rules.dividerWidthPx,
            'stroke-dasharray': '3 4',
          });
          return;
        }
        const f = max > min ? (max - v) / (max - min) : 0,
          fill = rampColor(theme, theme.materials, f),
          light = isLight(fill, '#' + theme.colors.ink, '#' + theme.colors.paper);
        p.add('rect', {
          x,
          y,
          width: cellW - gap,
          height: cellH - gap,
          rx: 4,
          fill,
          'data-shape-role': 'cell' + i + '-' + j,
          'data-focus-key': 'cell' + i + '-' + j,
          'data-focus-label': r + ' · ' + cols[j] + ' ' + num(v),
        });
        if (opt.labels !== false)
          p.text(x + (cellW - gap) / 2, y + (cellH - gap) / 2, num(v), 'pill', 'middle', {
            fill: light ? p.color('ink') : p.color('paper'),
          }).setAttribute('data-label-for', 'cell' + i + '-' + j);
      });
    });
    return { rows: rows.length, cols: cols.length };
  }
  // 散点：两轴都从数据取域，点半径固定，密集时降低不透明度。
  function scatter(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const pts = input.points || [];
    if (!pts.length || pts.some((d) => !Number.isFinite(d.x) || !Number.isFinite(d.y)))
      fail('DATA', '散点需要两个坐标');
    const f = window.KitAxis.frame2d(p, {
        width: box.width,
        height: box.height,
        xRange: domain(
          pts.map((d) => d.x),
          input.zero !== false,
        ),
        yRange: domain(
          pts.map((d) => d.y),
          input.zero !== false,
        ),
        xLabel: input.xLabel,
        yLabel: input.yLabel,
        unit: input.unit,
        num,
      }),
      X = f.X,
      Y = f.Y,
      dense = pts.length > 40;
    pts.forEach((d, i) => {
      p.add('circle', {
        cx: X(d.x),
        cy: Y(d.y),
        r: 5,
        fill: p.color('accent'),
        'fill-opacity': dense ? 0.55 : 1,
        'data-shape-role': 'pt' + i,
        'data-focus-key': 'pt' + i,
        'data-focus-label': (d.label || 'p' + (i + 1)) + ' ' + num(d.x) + ' / ' + num(d.y),
      });
      if (d.label && opt.labels !== false)
        p.text(X(d.x) + 8, Y(d.y) - 8, d.label, 'category', 'start').setAttribute('data-label-for', 'pt' + i);
    });
    return { points: pts.length };
  }
  // 雷达：轴数有上限，网格同心，值连成多边形。
  function radar(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const axes = input.axes || [];
    if (axes.length < 3 || axes.length > 8) fail('CAPACITY', '雷达轴数需在三到八之间');
    if (axes.some((a) => !a.name || !Number.isFinite(a.value))) fail('DATA', '雷达需要轴名与数值');
    const cx = box.width / 2,
      cy = box.height / 2,
      R = Math.min(box.height, box.width) * 0.34,
      max = Number.isFinite(input.max) ? input.max : Math.max(...axes.map((a) => a.value), 1),
      pt = (i, r) => {
        const a = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      };
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const d =
        axes
          .map((_, i) => pt(i, R * f))
          .map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`)
          .join('') + 'Z';
      p.add('path', { d, fill: 'none', stroke: p.color('line'), 'stroke-width': theme.rules.dividerWidthPx });
    }
    axes.forEach((a, i) => {
      const [x, y] = pt(i, R);
      p.add('path', {
        d: `M${cx} ${cy}L${x} ${y}`,
        fill: 'none',
        stroke: p.color('line'),
        'stroke-width': theme.rules.dividerWidthPx,
      });
      const [lx, ly] = pt(i, R + 22);
      p.text(
        lx,
        ly,
        a.name,
        'category',
        Math.cos(-Math.PI / 2 + (i / axes.length) * Math.PI * 2) > 0.15
          ? 'start'
          : Math.cos(-Math.PI / 2 + (i / axes.length) * Math.PI * 2) < -0.15
            ? 'end'
            : 'middle',
      );
    });
    const d =
      axes
        .map((a, i) => pt(i, (a.value / max) * R))
        .map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`)
        .join('') + 'Z';
    p.add('path', {
      d,
      fill: p.color('accent'),
      'fill-opacity': 0.16,
      stroke: p.color('accent'),
      'stroke-width': theme.rules.dividerWidthPx,
      'data-shape-role': 'radar',
    });
    axes.forEach((a, i) => {
      const [x, y] = pt(i, (a.value / max) * R);
      p.add('circle', {
        cx: x,
        cy: y,
        r: 3.5,
        fill: p.color('accent'),
        'data-shape-role': 'rp' + i,
        'data-focus-key': 'rp' + i,
        'data-focus-label': a.name + ' ' + num(a.value),
      });
    });
    return { axes: axes.length };
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

  // 甘特条：每行一条时间跨度，横轴是时间刻度。
  function gantt(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const rows = input.rows || [];
    if (
      !rows.length ||
      rows.some((d) => !d.label || !Number.isFinite(d.start) || !Number.isFinite(d.end) || d.end < d.start)
    )
      fail('DATA', '甘特条需要行名与起止值');
    const pad = p.tokens.padding * 2,
      nameW = p.tokens.labelGutterPx,
      left = pad + nameW,
      right = box.width - pad,
      top = pad,
      bottom = box.height - pad - p.roles.axis.size * 2.6,
      lo = Math.min(...rows.map((d) => d.start)),
      hi = Math.max(...rows.map((d) => d.end)),
      X = (v) => left + ((v - lo) / (hi - lo || 1)) * (right - left),
      rowH = (bottom - top) / rows.length,
      barH = Math.min(rowH * 0.52, 26);
    for (const v of [lo, (lo + hi) / 2, hi])
      p.text(X(v), bottom + p.roles.axis.size * 1.2, num(+v.toFixed(v % 1 ? 1 : 0)), 'axis', 'middle');
    p.add('path', {
      d: `M${left} ${bottom}H${right}`,
      fill: 'none',
      stroke: p.color('ink'),
      'stroke-width': theme.rules.dividerWidthPx,
    });
    rows.forEach((d, i) => {
      const y = top + i * rowH + rowH / 2,
        x = X(d.start),
        w = Math.max(p.tokens.minBarPx, X(d.end) - X(d.start)),
        key = 'task' + i;
      p.text(left - p.tokens.gap, y, d.label, 'category', 'end');
      p.box(key, x, y - barH / 2, w, barH, p.series(0), {
        rx: Math.min(6, barH / 3),
        fill: rampColor(theme, theme.materials, (i / Math.max(rows.length - 1, 1)) * 0.6),
        'data-shape-role': key,
        'data-focus-key': key,
        'data-focus-label': d.label + ' ' + num(d.start) + '–' + num(d.end),
      });
      if (d.note) p.text(x + w + p.tokens.gap, y, d.note, 'unit', 'start');
    });
    if (input.unit) p.text(right, bottom + p.roles.axis.size * 2.6, input.unit, 'unit', 'end');
    return { rows: rows.length };
  }
  // 箱线：箱体是四分位，胡须到极值，离线点单独画。
  function boxplot(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const groups = input.groups || [];
    const okRow = (d) => d.label && ['min', 'q1', 'median', 'q3', 'max'].every((k) => Number.isFinite(d[k]));
    if (!groups.length || groups.some((d) => !okRow(d))) fail('DATA', '箱线需要五数概括');
    const pad = p.tokens.padding * 2,
      left = pad + p.tokens.axisPadPx,
      right = box.width - pad,
      top = pad,
      bottom = box.height - pad - p.roles.axis.size * 2.4,
      lo = Math.min(...groups.map((d) => d.min), ...groups.flatMap((d) => d.outliers || [])),
      hi = Math.max(...groups.map((d) => d.max), ...groups.flatMap((d) => d.outliers || [])),
      Y = (v) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top),
      slot = (right - left) / groups.length,
      bw = Math.min(slot * 0.42, 54);
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4;
      p.text(left - p.tokens.gap, Y(v), num(+v.toFixed(v % 1 ? 1 : 0)), 'axis', 'end');
    }
    p.add('path', {
      d: `M${left} ${top}V${bottom}H${right}`,
      fill: 'none',
      stroke: p.color('ink'),
      'stroke-width': theme.rules.dividerWidthPx,
    });
    groups.forEach((d, i) => {
      const cx = left + (i + 0.5) * slot,
        key = 'box' + i;
      p.text(cx, bottom + p.roles.category.size, d.label, 'category', 'middle');
      // 胡须
      p.add('path', {
        d: `M${cx} ${Y(d.max)}V${Y(d.q3)}M${cx} ${Y(d.q1)}V${Y(d.min)}M${cx - bw / 2} ${Y(d.max)}H${cx + bw / 2}M${cx - bw / 2} ${Y(d.min)}H${cx + bw / 2}`,
        fill: 'none',
        stroke: p.color('ink'),
        'stroke-width': theme.rules.dividerWidthPx,
      });
      // 箱体
      p.box(key, cx - bw / 2, Y(d.q3), bw, Math.max(2, Y(d.q1) - Y(d.q3)), p.series(0), {
        rx: 0,
        stroke: p.color('ink'),
        'stroke-width': theme.rules.dividerWidthPx,
        'data-shape-role': key,
        'data-focus-key': key,
        'data-focus-label': d.label + ' 中位 ' + num(d.median),
      });
      // 中位线
      p.add('path', {
        d: `M${cx - bw / 2} ${Y(d.median)}H${cx + bw / 2}`,
        fill: 'none',
        stroke: p.color('ink'),
        'stroke-width': Math.max(2, theme.rules.dividerWidthPx * 2),
        'data-stroke-role': 'median',
      });
      (d.outliers || []).forEach((v) =>
        p.add('circle', {
          cx,
          cy: Y(v),
          r: 2.6,
          fill: 'none',
          stroke: p.color('muted'),
          'stroke-width': theme.rules.dividerWidthPx,
        }),
      );
    });
    return { groups: groups.length };
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
        fill: rampColor(theme, theme.materials, 0.25 + (i % 3) * 0.18),
        'fill-opacity': theme.materials.flowAlpha === undefined ? 0.55 : theme.materials.flowAlpha,
        'data-shape-role': 'flow' + i,
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
        );
      });
    drawNodes(l, leftX, 'l');
    drawNodes(r, rightX, 'r');
    return { nodes: l.length + r.length };
  }
  return {
    render(svgOrTable, data, opt, theme, box, id) {
      const allowed =
        id.startsWith('BAR-') || id === 'DIST-001'
          ? ['direction', 'mode', 'kind', 'widthRatio', 'sort']
          : id === 'LINE-001'
            ? ['single', 'mode', 'shape', 'zero', 'points', 'labels', 'focus', 'area']
            : id.startsWith('TABLE-')
              ? ['focus']
              : id === 'PIE-001'
                ? ['donut', 'percent', 'sort']
                : id === 'PIE-002'
                  ? ['intensity', 'center', 'sort']
                  : id === 'TIME-001'
                    ? ['direction', 'spacing', 'details', 'focus']
                    : ['direction', 'details', 'arrows', 'labels', 'focus'];
      for (const k of Object.keys(opt)) if (!allowed.includes(k)) fail('UNSUPPORTED', '主题绘制尚未支持选项 ' + k);
      if (id.startsWith('BAR-') || id === 'DIST-001') return bars(svgOrTable, data, opt, theme, box, id);
      if (id === 'LINE-001') return lines(svgOrTable, data, opt, theme, box);
      if (id.startsWith('TABLE-')) return table(svgOrTable, data, opt, theme, box);
      if (id === 'TIME-001') return timeline(svgOrTable, data, opt, theme, box);
      if (id === 'REL-001') return hierarchy(svgOrTable, data, opt, theme, box);
      if (id === 'REL-006' || id === 'FLOW-001') return graph(svgOrTable, data, opt, theme, box, id);
      if (id === 'PIE-001') return pie(svgOrTable, data, opt, theme, box);
      if (id === 'PIE-002') return pieBigSlice(svgOrTable, data, opt, theme, box);
      if (id === 'FUNNEL-001') return funnel(svgOrTable, data, opt, theme, box);
      if (id === 'HEAT-001') return heatmap(svgOrTable, data, opt, theme, box);
      if (id === 'SCATTER-001') return scatter(svgOrTable, data, opt, theme, box);
      if (id === 'RADAR-001') return radar(svgOrTable, data, opt, theme, box);
      if (id === 'REL-003') return containment(svgOrTable, data, opt, theme, box);
      if (id === 'TIME-002') return gantt(svgOrTable, data, opt, theme, box);
      if (id === 'BOX-001') return boxplot(svgOrTable, data, opt, theme, box);
      if (id === 'SANKEY-001') return sankey(svgOrTable, data, opt, theme, box);
      if (id === 'MATRIX-001') return quadrant(svgOrTable, data, opt, theme, box);
      if (id === 'REL-004') return layers(svgOrTable, data, opt, theme, box);
      fail('UNSUPPORTED', '尚未迁移主题渲染器 ' + id);
    },
  };
})();
