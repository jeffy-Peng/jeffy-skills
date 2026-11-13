# Jeffy Design

从内容到整页表达的演示设计 Skill。默认交付 HTML 和逐页讲稿，支持整稿、共创和单页修改。

## 使用

[SKILL.md](SKILL.md) 是唯一主流程：受众、用途与主题 → 问题与逐页提纲 → 研究并明确内容 → 设计可用区域 → 选材适配与组装 → 逐字稿 → 验收修改交付。

需要用户判断时最多一次在聊天中提供整稿方案；不逐页确认、不弹确认 HTML。已有决定直接沿用。

- [主题目录](themes/索引.md)：一套设计语言 `simple-line`，两个色板。
- [Catalog](assets/index.html)：按用途和形态找到素材规范。
- [主题自适应](references/主题自适应.md)：统一测量、布局与绘制接口。
- [页面组装](references/页面组装.md)：工具调用、绘制规则、失败反馈与验收。
- [素材维护](references/素材使用与维护.md)：新增登记与验证边界。

## 安装与运行

完整目录安装，不能只复制 SKILL.md。需要 Node.js 18+、Python 3、Playwright 与所选主题字体。

```sh
git clone https://github.com/jeffy-Peng/jeffy-skills.git
cd jeffy-skills/jeffy-design
npm ci
npx playwright install chromium
npm run doctor                     # 七项自检自修：Node、Playwright、Chromium、字体、子集工具、生成物、验收冒烟
node scripts/build-composition.mjs tests/composition/pressure.json build/pressure/index.html
node scripts/verify-page.mjs build/pressure/index.html build/pressure/validation.json
```

下载后本地打开 HTML；GitHub 链接显示源码。Linux 缺系统依赖时用 `npx playwright install --with-deps chromium`，也可用 `CHROME_PATH` 指定浏览器。字体不打包，新路径缺字体会返回 FONT。

## 三层结构

- 主题 `themes/*.json`：颜色、字体、字号阶梯、间距、圆角、线宽、网格、密度档，以及 `brush` 指定的笔触。
- 笔触 `lib/styles/line.js`：默认线条笔触，只管怎么落笔。不算位置，不选颜色。
- 素材 `assets/materials/<ID>.md`：一条素材一个文件，写语义、画法、可调参数、规则和验收。

几何在 `lib/theming/renderers.js`，七族各一份，属于引擎。素材和笔触都不复制它，所以新增一条同族素材常常零代码。

## 六种页面

`formats.slide.types` 定义六种页面，提纲里用 `type` 指定，不写默认内容页。

- `content` 内容页：标题、分隔线、内容区、页脚。结论行写了才占位。
- `cover` 封面：标题、副标题、日期，居中，无页脚。
- `section` 转折页：一句话，居中。
- `toc` 目录：条目由转折页自动推，也可手写 `items`。
- `appendix` 附录：同内容页，页码带 A 前缀。
- `closing` 结束页：标题加一行联系方式。

骨架图在 `assets/skeletons/`，改骨架跑 `npm run baseline` 看漂移。

## 版面规则

所有页面落在 8 像素基线上，横向四栏、栏距 24。间距只用 8、16、24 三档。密度只管组件数量上限：稀疏 1、常规 2、密集 3，留白由模型放几个东西决定。结论行按实测文字宽度算行数，页面不得手写高度。柱宽取槽位比例，默认一半，夹在 8 像素与槽位八成之间，代码里没有固定像素上限。

完整规则见 [docs/素材规则.md](docs/素材规则.md)。

## 主题与素材维护

两条数据入口，都不需要改脚本。

- 加主题：`themes/` 下放一个 JSON，跑 `npm run sync`，测试自动覆盖。只换配色时在 `palettes` 里加一项，不动字号与版面。
- 加素材：写 `assets/materials/<ID>.md`，跑 `npm run sync`，登记表、能力表与目录一起生成。
- 生成物是 `lib/composition/adapters.json`、`assets/capability.json` 与 `build/generated/`，不要手改。`npm run sync:check` 只检查不写。

Catalog 唯一维护源为 [assets/catalog.json](assets/catalog.json)，运行 `npm run catalog` 更新目录及资源记录。31 项素材每条一个 md 文件：12 条有代码实现，进基线；19 条只写规范，由模型按规范绘制，不进像素基线。素材库只保留规范与示意图。

默认仅保证 HTML 路径，没有原生可编辑 PPTX 导出。

## 验证

```sh
npm test                           # 同步检查 + 主题契约
npm run gen:rules                  # 从 contract 生成规则清单
npm run test:composition           # 12 项组装回归
npm run test:adapters              # 23 项参数回归
npm run test:themes                # 17 项主题与区域检查
npm run test:materials             # 39 项素材契约用例
npm run specimen BAR-001           # 生成素材示意图（只有图表，12 条引擎素材）
npm run baseline                   # 素材与骨架的像素基线回归
```

交付前另有三道检查：

```sh
node scripts/validate-outline.mjs 提纲.json                 # 每页的问题、结论与素材能力
node scripts/verify-page.mjs 输出.html                      # 页面报告 + 整页检查
node scripts/check-notes.mjs 输入.json 输出.html             # 讲稿与画面数字比对
node scripts/embed-fonts.mjs 输出.html 输出.embedded.html    # 字体内嵌，交付自包含
```

失败返回非零；自动检查不能代替内容核验和实际读图。维护与新增约定见 [docs/维护说明.md](docs/维护说明.md)。

## 案例与目录


案例是历史输出与验证证据，不因主题或 Skill 更新自动重写。

```text
SKILL.md       七步制作流程
assets/        素材规范、示意图、页面骨架与样张、Catalog
themes/        场景、空间、写作、视觉、页面类型配置
references/    适配、工具和维护细则
lib/           布局、绘制、组装、检查
scripts/       构建与验收
tests/         可复现输入与测试题
```

随父仓库采用 [MIT License](../LICENSE)。
