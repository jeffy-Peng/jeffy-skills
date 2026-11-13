// 渲染验收：页面报告 + 整页检查（含手画页）。
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadChromium, findChrome } from '../lib/browser.mjs';
import { auditDeck } from '../lib/checks/page-checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedThemes = resolve(root, 'build', 'generated', 'themes.json');
const defaultTheme = existsSync(generatedThemes)
  ? JSON.parse(readFileSync(generatedThemes, 'utf8'))[0].name
  : 'klein-blue';
const [file, out = 'validation.json', themeName = defaultTheme] = process.argv.slice(2);
if (!file) throw Error('用法 node scripts/verify-page.mjs out.html [report.json] [主题名]');

const theme = JSON.parse(readFileSync(resolve(root, 'themes', themeName + '.json'), 'utf8'));
const browser = await loadChromium().launch({ executablePath: findChrome() });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(resolve(file)).href);
  await page.waitForFunction(() => window.renderComplete === true, {}, { timeout: 20000 });
  const failed = await page.evaluate(() => Boolean(window.renderFailed));
  const report = await page.evaluate(() => window.validationReport);
  const audit = await auditDeck(page, theme).catch((e) => ({ pages: 0, nodes: 0, issues: [], error: e.message }));
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
      `${pass}/${report.length} 页通过，整页检查 ${auditIssues.length ? auditIssues.length + ' 项问题' : (audit.pages || 0) + ' 页无问题'}，${out}`,
    );
    for (const issue of auditIssues.slice(0, 8))
      console.log(`  [${issue.code}] ${issue.page ? issue.page + ' ' : ''}${issue.message}`);
  }
} finally {
  await browser.close();
}
