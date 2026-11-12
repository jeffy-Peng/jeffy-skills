# Jeffy Design

从内容到整页表达的演示设计Skill。默认交付HTML和逐页讲稿，支持整稿、共创和单页修改。

## 使用

[SKILL.md](SKILL.md)是唯一主流程：受众、用途与主题 → 问题与逐页提纲 → 研究并明确内容 → 设计可用区域 → 选材适配与组装 → 逐字稿 → 验收修改交付。

需要用户判断时最多一次在聊天中提供整稿方案；不逐页确认、不弹确认HTML。已有决定直接沿用。

- [主题目录](themes/索引.md)：目前仅保留klein-blue。每份JSON维护适用场景、正文与讲稿提示词、可用区域和视觉参数。
- [Catalog](assets/index.html)：按用途和形态找到表达规范，再看参考样张与实现。素材不限制本次对象数量与结构。
- [主题自适应](references/主题自适应.md)：统一测量、布局与绘制接口。
- [页面组装](references/页面组装.md)：工具调用、绘制规则、失败反馈与验收。
- [素材维护](references/素材使用与维护.md)：新增登记与验证边界。

## 安装与运行

完整目录安装，不能只复制SKILL.md。需要Node.js 18+、Python 3、Playwright与所选主题字体。

```sh
git clone https://github.com/jeffy-Peng/jeffy-skills.git
cd jeffy-skills/jeffy-design
npm ci
npx playwright install chromium
node scripts/build-composition.mjs tests/composition/pressure.json build/pressure/index.html
node scripts/verify-page.mjs build/pressure/index.html build/pressure/validation.json
```

下载后本地打开HTML；GitHub链接显示源码。Linux缺系统依赖时使用 `npx playwright install --with-deps chromium`，也可用CHROME_PATH指定浏览器。字体不打包，新路径缺字体会返回FONT。

常规制作使用区域组装或共享绘制接口。柱线同绘图区另见[工具说明](references/页面描述.md)，它尚未迁移全部主题接口，不能当成任意页面模板。早期固定版式引擎及其专用契约已移除。

## 主题与素材维护

主题JSON中的usage说明场景与受众，writing提供整体语气、标题、正文、逐字稿与自审提示，page定义画布及页眉页脚和可用内容区域。模型先读配置，再创作与构图；writing不是自动文案过滤器。

Catalog唯一维护源为[assets/catalog.json](assets/catalog.json)，运行 `npm run catalog` 更新目录及资源记录。31项素材有规范入口，4项原版的遗留草稿标记已纠正；独立时序组件仍为试验版；规范齐全不代表代码覆盖所有合法表达。后续机制重写版在drafts单独保留，不覆盖已确认原版；现用证据保留，已被正式素材替代的未引用试稿删除。

12项静态区域适配器使用theme-v1，当前验证klein-blue。其他独立源件、共享坐标引擎和动效尚未全部迁移。主题page在静态区域引擎中实际生效；新增配置仍需实际渲染验收。默认仅保证HTML路径，暂无统一原生可编辑PPTX导出。

## 验证

```sh
npm test
npm run test:composition
npm run test:adapters
npm run test:themes
python scripts/test-catalog-contract.py
npm run catalog
```

分别验证主题字段与保留区域、12项组装回归、23项参数回归、17项主题及区域检查、31项Catalog契约与9项登记用例。失败返回非零；自动检查不能代替内容核验和实际读图。

结构案例还可运行 `python scripts/test-layer-adaptation.py`、`python scripts/test-cross-material-adaptation.py`、`python scripts/test-mechanism-drafts.py`。这些脚本需要Python Playwright与本机Edge，目前按Windows验证。

## 案例与目录

- [室内攀岩市场三页](examples/climbing-market/index.html)：区域任务、图文组合、来源与逐字稿，用户认可整体方向。
- [主题适配样例](examples/theme-adaptation/index.md)：克莱因蓝素材检查页。
- [结构重绘](examples/layer-adaptation/index.html)、[跨素材适配](examples/cross-material-adaptation/index.html)：依规范重构而非套样张。
- [机制审核稿](drafts/机制表达审核/index.html)：仍为草稿，不自动提升状态。

案例是历史输出与验证证据，不因主题或Skill更新自动重写；以记录中的输入、版本和范围为准。

```text
SKILL.md       七步制作流程
assets/        表达规范、素材样张、源件与Catalog
themes/        场景、空间、写作与视觉配置
references/    适配、工具和维护细则
lib/           共享绘制、区域组装、共享坐标引擎
scripts/       构建与验收
tests/         可复现输入与测试题
examples/      参考案例与证据
drafts/        仍在登记或测试中使用的未入库草稿
icons/         独立线框图标源件
```

随父仓库采用[MIT License](../LICENSE)。
