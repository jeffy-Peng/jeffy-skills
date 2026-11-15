# PPT 式 HTML 交付

这是 Jeffy Design 当前默认验证的交付分支。先完成 SKILL 的内容与区域设计，再按本文件构建；不要把构建器的数据结构当成内容提纲。

## 成品要求

- 按演示页组织，使用主题固定页眉页脚与可用区域；不擅自改成长网页或应用界面。
- 自包含 HTML 可离线打开，字体、图片、脚本齐备，逐页讲稿可展开，并另交付 notes.md。
- 默认保留统一交互，执行 docs/交互规则.md；引擎与模型 SVG 使用同一关联属性和运行时。图形标 data-focus-key，标签标 data-label-for，连线标 data-link-from/to。真实图片和纯文字不硬造可选择对象。
- 交互只帮助聚焦和追踪关系，初始画面已完整呈现信息；不靠悬停提示框补关键内容，不改变数据几何。
- 鼠标、键盘、触屏均可操作；减少动态时直接给状态。原本不支持的入场动画或形态切换不能仅凭规范存在就宣称已支持。

## 构建与验收

开工前 npm run doctor -- --no-install；自包含 HTML 加 --embed 检查字体工具。构建输入接口与错误反馈见页面组装.md。

```sh
node scripts/validate-outline.mjs 输入.json
node scripts/build-composition.mjs 输入.json 输出.html
node scripts/check-notes.mjs 输入.json 输出.html
node scripts/embed-fonts.mjs 输出.html 输出.embedded.html
node scripts/verify-page.mjs 输出.embedded.html 验收.json
node scripts/test-html-interaction.mjs 输出.embedded.html 交互验收.json
```

单图不强制整稿提纲和讲稿。verify-page 检查 static=1 的完整终态；交互脚本在正常 URL 上运行真实悬停、键盘、触屏和复原测试。图形叠在同一坐标时，指针只能命中上层对象，仍需键盘访问，不能移动数据点来制造点击空间。

实际查看代表页面，检查读图、讲稿顺序和交互语义。通用脚本不证明每一种图形的全部语义关系，新增或修改交互必须补受影响路径的真实事件用例。

需要 PNG 时运行 export-pages.mjs，脚本自动使用 static=1，保证截图不残留聚焦淡化；打印同样保留完整画面。静态导出不宣称带交互。最终交付正常 URL 的 embedded.html，不把 static=1 当成默认交付方式。
