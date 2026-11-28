// 示意图基线回归：几何或笔触改了，像素会变，这里当场报出来。
// 用法 node scripts/visual-baseline.mjs [素材ID...] [--update]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { getDefaultThemeName, loadThemeConfig, PROJECT_ROOT, readJson } from '../lib/constants.mjs';
import { visualBaselineSourceFiles } from '../lib/composition/bundle.mjs';
import { withBrowser } from '../lib/browser.mjs';

const root = PROJECT_ROOT;
// 页面与骨架的旧截图仅是参考；不宣称它们经过当前源码回归。

// 基线按主题分目录：同一个素材在不同主题下的像素本来就不同，混在一起会把真漂移埋掉。
const themeName = process.env.SPECIMEN_THEME || getDefaultThemeName();
const baselineDir = resolve(root, 'assets/materials/baselines', themeName);
mkdirSync(baselineDir, { recursive: true });
const update = process.argv.includes('--update');
const threshold = 0.003; // 千分之三的像素不同就算漂移

const ids = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const caps = readJson('assets/capability.json');
const wanted = ids.length ? ids : Object.keys(caps).filter((id) => caps[id].capability === 'assemble');
if (!wanted.length || wanted.some((id) => caps[id]?.capability !== 'assemble'))
  throw Error('基线只接受已登记的引擎素材，不能空跑或跳过未知 ID');
// 每次从当前代码与受控样本重建，不能比较磁盘上的旧截图冒充回归。
const currentDir = join(root, 'build/baseline-current', themeName);
const baselineTheme = loadThemeConfig(themeName);
const rendered = spawnSync(process.execPath, [join(root, 'scripts/build-specimen.mjs'), ...wanted], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SPECIMEN_DIR: currentDir,
    SPECIMEN_THEME: themeName,
    SPECIMEN_PALETTE: baselineTheme.defaultPalette || baselineTheme.palette || '',
  },
});
if (rendered.status !== 0) throw Error('当前源码示意图构建或验收失败：' + rendered.stdout + rendered.stderr);
const files = wanted.map((id) => ({ id, dir: currentDir }));

const results = [];
const browserVersion = await withBrowser(async (browser) => {
  const page = await browser.newPage();
  for (const entry of files) {
    const id = entry.id;
    const current = join(entry.dir, id + '.png');
    const baseline = join(baselineDir, id + '.png');
    if (!existsSync(current)) {
      results.push({ id, status: 'missing-specimen' });
      continue;
    }
    if (!existsSync(baseline) && !update) {
      results.push({ id, status: 'missing-baseline' });
      continue;
    }
    if (update) {
      writeFileSync(baseline, readFileSync(current));
      results.push({ id, status: 'updated' });
      continue;
    }
    const diff = await page.evaluate(
      async ({ a, b }) => {
        const load = (src) =>
          new Promise((ok, bad) => {
            const img = new Image();
            img.onload = () => ok(img);
            img.onerror = bad;
            img.src = src;
          });
        const [imgA, imgB] = await Promise.all([load(a), load(b)]);
        if (imgA.width !== imgB.width || imgA.height !== imgB.height)
          return { shape: [imgA.width, imgA.height, imgB.width, imgB.height], ratio: 1 };
        const canvas = document.createElement('canvas');
        canvas.width = imgA.width;
        canvas.height = imgA.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgA, 0, 0);
        const da = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgB, 0, 0);
        const db = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let changed = 0;
        for (let i = 0; i < da.length; i += 4) {
          if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8)
            changed += 1;
        }
        return { ratio: changed / (da.length / 4), pixels: changed };
      },
      // file:// 图片会污染 canvas，改用 data URL。
      {
        a: 'data:image/png;base64,' + readFileSync(current).toString('base64'),
        b: 'data:image/png;base64,' + readFileSync(baseline).toString('base64'),
      },
    );
    const ok = diff.ratio <= threshold;
    results.push({ id, status: ok ? 'same' : 'drift', percent: +(diff.ratio * 100).toFixed(3), ...diff });
    if (!ok) {
      writeFileSync(join(baselineDir, id + '.current.png'), readFileSync(current));
    }
  }
  return browser.version();
});
const fingerprint = createHash('sha256');
for (const file of visualBaselineSourceFiles(themeName))
  fingerprint.update(file).update(readFileSync(join(root, file)));
const report = {
  theme: themeName,
  sourceHash: fingerprint.digest('hex'),
  browser: browserVersion,
  threshold,
  results,
};
writeFileSync(join(root, 'build/baseline-report.json'), JSON.stringify(report, null, 2));
if (update) writeFileSync(join(baselineDir, 'manifest.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const drift = results.filter((r) => !['same', 'updated'].includes(r.status));
if (drift.length) {
  console.error(
    '视觉漂移：' +
      drift.map((d) => `${d.id} ${d.percent ?? d.status}%`).join('，') +
      '。确认是想要的改动后跑 --update 更新基线。',
  );
  process.exitCode = 1;
}
