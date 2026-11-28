// 可复用的页面渲染验收核查：收集运行时报告、整页 DOM 审计与覆盖率断言。
import { auditDeck } from './page-checks.mjs';

export async function verifyDeckInPage(page, theme, pageErrors = []) {
  const errors = [...pageErrors];
  const failed = await page.evaluate(() => Boolean(window.renderFailed));
  const report = await page.evaluate(() => window.validationReport || []);
  const audit = await auditDeck(page, theme).catch((e) => ({ pages: 0, nodes: 0, issues: [], error: e.message }));
  if (audit.error) errors.push('AUDIT: ' + audit.error);
  if (!Array.isArray(report) || !report.length || report.length !== audit.pages)
    errors.push('COVERAGE: 页面报告缺失或与画布数量不符');
  if (report.some((p) => typeof p.ok !== 'boolean' || !Array.isArray(p.issues)))
    errors.push('CONTRACT: 页面报告字段非法');
  const sheetIds = await page.locator('.sheet').evaluateAll((nodes) => nodes.map((n) => n.dataset.page));
  if (new Set(report.map((p) => p.id)).size !== report.length || report.some((p, i) => p.id !== sheetIds[i]))
    errors.push('COVERAGE: 报告页面 ID 与实际页面不对应');
  if (!audit.pages || !audit.nodes) errors.push('COVERAGE: 未测量任何页面或文字');
  const ok = !failed && !errors.length && report.every((p) => p.ok) && !(audit.issues || []).length;
  return { errors, pages: report, audit, failed, ok };
}
