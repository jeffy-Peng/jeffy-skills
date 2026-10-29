# 报告构建与本地运行环境

本入口只执行确定性的构建和检查，不调用模型，不评价事实与论证，也不代替视觉审查。继续使用原有 `render_report.py`、WeasyPrint 69.0、report.css 和 Noto CJK 字体。

## 正常使用

```bash
python [skill目录]/scripts/build_report.py report.md
```

默认在 Markdown 同级生成 `output.html`、`output.pdf`、各自 `.manifest.json`、`build-summary.json`、`build-logs/` 与 `preview/`。`preview/index.json` 列出本次有效图片；只检查其中的图片，旧版本残留文件不属于本次预览。

正文及直接资源、构建代码、配置与探测到的运行时版本不变且重新校验通过时复用产物。远程媒体及带潜在嵌套依赖的外部 SVG 不自动复用构建。摘要仍只覆盖直接依赖；正式交付优先采用自包含资源。HTML 的图像可随文件独立携带，manifest 的验证仍需保留源文件和依赖。

摘要中的 `checks_passed` 只说明机器检查通过。先完成正文内容验收，再查看联系表以及封面、代表性正文、图表页与末页；有异常则扩大检查。人工审查状态不由脚本自动打勾。

用户明确只需 HTML 时：

```bash
python [skill目录]/scripts/build_report.py report.md --formats html
```

只需 Markdown 时运行 `validate_report.py report.md`，不运行构建。另存测试产物可用 `--output-dir [目录]`，不会改动源报告。调试时读取报错指向的日志；正常构建不需把全文、图片二进制或完整日志装入上下文。

## 一次性配置

优先复用已经验证的本地运行环境。默认读取 `$CODEX_HOME/3d-deep-research/runtime.json`，未设置 CODEX_HOME 时使用 `~/.codex/3d-deep-research/runtime.json`；也可显式传 `--runtime-config [路径]`。这属于本机配置，不写进可分发 Skill 的机器路径。

```json
{
  "python": "已验证的Python绝对路径",
  "dll_dirs": ["Windows的GTK DLL绝对目录"],
  "fontconfig_file": "需要显式指定时的fonts.conf绝对路径",
  "font_dir": "集中存放两种Noto字体的绝对目录",
  "preview_python": "安装Pillow的Python绝对路径",
  "pdftoppm": "Poppler的pdftoppm绝对路径"
}
```

非 Windows 可省略 `dll_dirs`；仅在 Fontconfig 无法找到默认配置时设置 `fontconfig_file`，保留其配套 conf.d 文件。无配置时使用当前 Python、报告同级 `fonts/` 和 PATH 上的 pdftoppm；preview_python 默认等于 python。配置中的文件路径使用绝对路径，preview_python 需要 Pillow，python 需要 Python-Markdown、pypdf；PDF 还需要 WeasyPrint 69.0 及其本地库。字体文件为 `NotoSansCJKsc-Regular.otf`、`NotoSansCJKsc-Bold.otf`。运行环境放在持久本机目录，不依赖项目临时目录；升级依赖后重新预检。

预检不通过时按具体缺失修复，不反复安装无关依赖。Windows 的 `libgobject-2.0-0` 导入错误通常需要检查已安装 GTK 的 DLL 目录；仅重装 Python 包不能替代 DLL 配置。脚本不会自动安装软件或切换 PDF 引擎。

构建先处理 HTML，再处理 PDF。PDF 字体、引擎或预览依赖缺失时，已验证的 HTML 保留，摘要列出成功部分与阻塞；不得把这种状态称为完整交付。PDF 已生成但缺预览时同样保留文件，并明确视觉检查尚未完成。
