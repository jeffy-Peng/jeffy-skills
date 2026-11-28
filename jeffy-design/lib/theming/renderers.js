// 主题渲染器公共门面与声明式分发注册表；具体图形实现按家族位于 lib/theming/renderers/。
window.ThemeRenderers = (() => {
  const { fail } = window.ThemeRendererShared;
  const { cartesian, polar, tabular, relational } = window.ThemeRendererFamilies;

  const validateBars = (id) => (opt) => {
    if (opt.mode !== undefined && !['absolute', 'value', 'percent'].includes(opt.mode))
      fail('UNSUPPORTED', '未知数值模式');
    if (opt.mode === 'percent' && id !== 'BAR-003') fail('UNSUPPORTED', '百分比构成请使用 BAR-003');
    if (id === 'BAR-006' && opt.sort && opt.sort !== 'given') fail('UNSUPPORTED', '瀑布图必须保持业务顺序');
  };

  const validateLines = (opt) => {
    if (
      (opt.mode !== undefined && !['line', 'raw', 'cumulative', 'index'].includes(opt.mode)) ||
      (opt.shape !== undefined && !['line', 'step'].includes(opt.shape))
    )
      fail('UNSUPPORTED', '折线 mode 控制数据变换，shape 控制普通或阶梯');
  };

  const BAR_SORT_OPTIONS = ['direction', 'sort', 'widthRatio'];
  const GRAPH_OPTIONS = ['direction', 'details', 'arrows', 'labels', 'focus'];

  const SPECS = {
    'BAR-001': {
      render: cartesian.bars,
      allowedOptions: ['direction', 'sort', 'widthRatio', 'kind'],
      validate: validateBars('BAR-001'),
    },
    'BAR-002': { render: cartesian.bars, allowedOptions: BAR_SORT_OPTIONS, validate: validateBars('BAR-002') },
    'BAR-003': {
      render: cartesian.bars,
      allowedOptions: ['direction', 'mode', 'sort', 'widthRatio'],
      validate: validateBars('BAR-003'),
    },
    'BAR-005': { render: cartesian.bars, allowedOptions: BAR_SORT_OPTIONS, validate: validateBars('BAR-005') },
    'BAR-006': {
      render: cartesian.bars,
      allowedOptions: ['direction', 'widthRatio'],
      validate: validateBars('BAR-006'),
    },
    'BAR-007': { render: cartesian.bars, allowedOptions: BAR_SORT_OPTIONS, validate: validateBars('BAR-007') },
    'DIST-001': { render: cartesian.bars, allowedOptions: BAR_SORT_OPTIONS, validate: validateBars('DIST-001') },
    'LINE-001': {
      render: cartesian.lines,
      allowedOptions: ['single', 'mode', 'shape', 'zero', 'points', 'labels', 'focus', 'area'],
      validate: validateLines,
    },
    'MATRIX-001': { render: cartesian.quadrant, allowedOptions: ['labels'] },
    'SCATTER-001': { render: cartesian.scatter, allowedOptions: ['labels'] },
    'BOX-001': { render: cartesian.boxplot, allowedOptions: [] },
    'PIE-001': { render: polar.pie, allowedOptions: ['donut', 'percent', 'sort'] },
    'PIE-002': { render: polar.pieBigSlice, allowedOptions: ['intensity', 'center', 'sort'] },
    'RADAR-001': { render: polar.radar, allowedOptions: [] },
    'TABLE-001': { render: tabular.table, allowedOptions: ['focus'] },
    'TABLE-002': { render: tabular.table, allowedOptions: ['focus'] },
    'TIME-001': { render: tabular.timeline, allowedOptions: ['direction', 'spacing', 'details', 'focus'] },
    'HEAT-001': { render: tabular.heatmap, allowedOptions: ['labels'] },
    'TIME-002': { render: tabular.gantt, allowedOptions: [] },
    'REL-001': { render: relational.hierarchy, allowedOptions: ['direction', 'details', 'focus'] },
    'REL-003': { render: relational.containment, allowedOptions: [] },
    'REL-004': { render: relational.layers, allowedOptions: [] },
    'REL-006': { render: relational.graph, allowedOptions: GRAPH_OPTIONS },
    'FLOW-001': { render: relational.graph, allowedOptions: GRAPH_OPTIONS },
    'FUNNEL-001': { render: relational.funnel, allowedOptions: ['conversion'] },
    'SANKEY-001': { render: relational.sankey, allowedOptions: [] },
  };

  return {
    listIds() {
      return Object.keys(SPECS);
    },
    getSpec(id) {
      const spec = SPECS[id];
      return spec ? { allowedOptions: [...spec.allowedOptions] } : null;
    },
    render(svgOrTable, data, opt, theme, box, id) {
      const options = opt || {};
      if (options.direction !== undefined && !['horizontal', 'vertical'].includes(options.direction))
        fail('UNSUPPORTED', '未知方向');
      if (options.sort !== undefined && !['given', 'asc', 'desc'].includes(options.sort))
        fail('UNSUPPORTED', '未知排序');
      if (
        options.widthRatio !== undefined &&
        (!Number.isFinite(options.widthRatio) || options.widthRatio < 0.2 || options.widthRatio > 0.8)
      )
        fail('DATA', 'widthRatio 需在 0.2 到 0.8 之间');
      const spec = SPECS[id];
      if (!spec) fail('UNSUPPORTED', '尚未迁移主题渲染器 ' + id);
      if (spec.validate) spec.validate(options);
      for (const key of Object.keys(options))
        if (!spec.allowedOptions.includes(key)) fail('UNSUPPORTED', '主题绘制尚未支持选项 ' + key);
      return spec.render(svgOrTable, data, options, theme, box, id);
    },
  };
})();
