// 直角坐标系数值图表家族：柱族（单/分组/堆叠/正负/瀑布/目标/直方）、折线、四象限、散点、箱线。
window.ThemeRendererFamilies.cartesian = (() => {
  const { fail, num, setup, domain, frame, rampColor } = window.ThemeRendererShared;

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
    if (opt.kind && opt.kind !== kind && !['solid', 'capsule', 'rung', 'rhythm'].includes(opt.kind))
      fail('UNSUPPORTED', 'kind与素材ID不一致');
    const style = ['solid', 'capsule', 'rung', 'rhythm'].includes(opt.kind)
      ? opt.kind
      : theme.materials.barStyle || 'solid';
    if (style === 'rhythm' && kind !== 'single') fail('UNSUPPORTED', '随机分节当前仅支持单系列比较');
    if (style === 'rung' && horizontal) fail('UNSUPPORTED', '刻度柱当前仅支持纵向；横向请按规范重绘');
    let labels, rows, series;
    if (kind === 'waterfall') {
      if (!input.data?.length || input.data.some((d) => !d.label || !Number.isFinite(d.value)))
        fail('DATA', '瀑布图需要有限变化值');
      let total = 0;
      rows = input.data.map((d) => {
        const start = total;
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
        const sum = d.values.reduce((a, b) => a + b, 0);
        return { ...d, sum, values: percent ? d.values.map((v) => (sum ? (v / sum) * 100 : 0)) : d.values };
      });
      labels = rows.map((d) => d.label);
    }
    if (kind !== 'waterfall') {
      if (['single', 'sign', 'distribution'].includes(kind) && rows.some((d) => d.values.length !== 1))
        fail('DATA', '该素材每个类别只接受一个值');
      if (kind === 'target' && series.length !== 2) fail('DATA', '目标对照需要实际与目标两个系列');
      if (style === 'rung' && rows.some((d) => d.values.some((v) => !Number.isInteger(v))))
        fail('UNSUPPORTED', '刻度柱当前仅支持整数，不能静默改为实心');
    }
    const values =
        kind === 'waterfall'
          ? rows.flatMap((d) => [d.start, d.end])
          : kind === 'stacked'
            ? rows.map((d) => d.values.reduce((a, b) => a + b, 0))
            : rows.flatMap((d) => d.values),
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
        style === 'rhythm' ? 'ruler' : undefined,
      ),
      slot = (horizontal ? f.bottom - f.top : f.right - f.left) / rows.length;
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
      const c = (horizontal ? f.top : f.left) + (i + 0.5) * slot;
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
      const entries = kind === 'waterfall' ? [d.value] : kind === 'target' ? d.values.slice(0, 1) : d.values;
      let acc = 0;
      entries.forEach((value, j) => {
        const start = kind === 'waterfall' ? d.start : kind === 'stacked' ? acc : 0,
          end = kind === 'waterfall' ? d.end : start + value;
        acc = end;
        const a = f.coord(start),
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
        const fillHex = ramp ? rampColor(theme, rank) : null;
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
        if (style === 'rhythm') {
          // A shared, index-based sequence is stable across redraws, rows and directions.
          // Only longitudinal length encodes value; cross-axis variation is decorative.
          const length = horizontal ? w : h;
          const axisLength = horizontal ? f.right - f.left : f.bottom - f.top;
          const pitch = Math.max(p.tokens.clearPx * 2, 10);
          const step = (range.max - range.min) / Math.max(1, Math.floor(axisLength / pitch));
          const full = Math.abs(f.coord(step) - f.coord(0));
          const group = p.add('g', {
            'data-focus-key': 'bar' + i + '-' + j,
            'data-focus-label': barNode.getAttribute('data-focus-label'),
            'data-value': value,
            'data-category': d.label,
            'data-segment-step': step,
            'data-encoded-length': length,
          });
          barNode.removeAttribute('data-focus-key');
          barNode.removeAttribute('data-focus-label');
          barNode.setAttribute('fill', p.color('paper'));
          barNode.setAttribute('fill-opacity', '0.001');
          barNode.setAttribute('stroke', 'none');
          group.append(barNode);
          for (let k = 0, pos = 0; pos < length - 1e-8; k++, pos = k * full) {
            const cell = Math.min(full, length - pos);
            // Keep the first and last endpoints exact, even for a fractional final cell.
            const gap = Math.min(full * 0.22, cell * 0.22);
            const markLength = cell - (pos + cell < length - 1e-8 ? gap : 0);
            const hash = Math.imul(k + 1, 1597334677) >>> 0;
            const crossSize = thickness * (0.35 + ((hash % 1000) / 999) * 0.65);
            const mark = p.add('rect', {
              x: horizontal ? x + pos : cross - crossSize / 2,
              y: horizontal ? cross - crossSize / 2 : y + h - pos - markLength,
              width: horizontal ? markLength : crossSize,
              height: horizontal ? crossSize : markLength,
              fill: fillHex || p.color(paint),
              'data-rhythm-segment': k,
            });
            group.append(mark);
          }
        }
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
      const z = f.coord(0);
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
    const series = (opt.single ? input.series.slice(0, 1) : input.series).map((s) => {
        let sum = 0,
          missing = false;
        const base = s.values[0];
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
    const range = domain(vals, opt.zero !== false),
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
        const x = f.left + (i + 0.5) * slot,
          y = f.coord(v);
        d += last ? (opt.shape === 'step' ? `H${x}V${y}` : `L${x} ${y}`) : `M${x} ${y}`;
        last = [x, y];
        if (opt.points) p.add('circle', { cx: x, cy: y, r: 3, fill: p.color('paper'), stroke: p.color(p.series(j)) });
        hits.push({ x, y, i, j, label: s.name + ' ' + input.labels[i] + ' ' + num(v) });
        if (opt.labels) p.text(x, y - p.tokens.valueGapPx, num(v)).setAttribute('data-label-for', 'pt' + j + '-' + i);
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

  // 箱线：箱体是四分位，胡须到极值，离线点单独画。
  function boxplot(svg, input, opt, theme, box) {
    const p = setup(svg, theme, box);
    const groups = input.groups || [];
    const okRow = (d) =>
      d.label &&
      ['min', 'q1', 'median', 'q3', 'max'].every((k) => Number.isFinite(d[k])) &&
      d.min <= d.q1 &&
      d.q1 <= d.median &&
      d.median <= d.q3 &&
      d.q3 <= d.max &&
      (d.outliers === undefined || (Array.isArray(d.outliers) && d.outliers.every(Number.isFinite)));
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
      p.text(cx, bottom + p.roles.category.size, d.label, 'category', 'middle').setAttribute('data-label-for', key);
      const before = new Set(svg.children);
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
      const parts = [...svg.children].filter((n) => !before.has(n));
      const group = p.add('g', {
        'data-focus-key': key,
        'data-focus-label': d.label + ' 中位 ' + num(d.median) + '，离群点 ' + (d.outliers || []).length + ' 个',
      });
      parts.forEach((n) => group.append(n));
    });
    return { groups: groups.length };
  }

  return { bars, lines, quadrant, scatter, boxplot };
})();
