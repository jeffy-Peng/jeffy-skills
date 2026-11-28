// 渲染验收：页面报告 + 整页检查（含手画页）。
import { writeFileSync } from 'node:fs';
import { getDefaultThemeName, loadThemeConfig } from '../lib/constants.mjs';
import { withBrowser, openDeckPage } from '../lib/browser.mjs';
import { verifyDeckInPage } from '../lib/checks/verify.mjs';

const defaultTheme = getDefaultThemeName();
const [file, out = 'validation.json', themeName = defaultTheme] = process.argv.slice(2);
if (!file) throw Error('用法 node scripts/verify-page.mjs out.html [report.json] [主题名]');

const theme = loadThemeConfig(themeName);
await withBrowser(async (browser) => {
  const { page, errors: pageErrors } = await openDeckPage(browser, file, { staticMode: true });
  const { errors, pages: report, audit, failed } = await verifyDeckInPage(page, theme, pageErrors);
  writeFileSync(out, JSON.stringify({ errors, pages: report, audit }, null, 2));

  if (failed) {
    const fatal = report?.[0]?.issues?.[0] || {};
    console.error((fatal.code || 'FATAL') + '：' + (fatal.message || '页面无法生成'));
    if (fatal.hint) console.error('修复：' + fatal.hint);
    process.exitCode = 2;
  } else {
    const auditIssues = audit.issues || [];
    if (errors.length || report.some((p) => !p.ok) || auditIssues.length) process.exitCode = 1;
    const pass = report.filter((p) => p.ok).length;
    console.log(
      `${process.exitCode ? '验收失败' : '验收通过'}：页面 ${pass}/${report.length}，整页检查 ${auditIssues.length ? auditIssues.length + ' 项问题' : (audit.pages || 0) + ' 页无问题'}，${out}`,
    );
    for (const error of errors) console.error('  ' + error);
    if (audit.unclassifiedStrokes)
      console.log('  覆盖说明：' + audit.unclassifiedStrokes + ' 条未标注语义的线未参与同角色线宽比较');
    for (const issue of auditIssues.slice(0, 8))
      console.log(`  [${issue.code}] ${issue.page ? issue.page + ' ' : ''}${issue.message}`);
  }
});
