// 示意图基线回归：几何或笔触改了，像素会变，这里当场报出来。
// 用法 node scripts/visual-baseline.mjs [素材ID...] [--update]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadChromium, findChrome } from '../lib/browser.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specimenDir = resolve(root, 'assets/materials/specimens');
const skeletonDir = resolve(root, 'assets/skeletons');
const pagesDir = resolve(root, 'assets/pages');
const baselineDir = resolve(root, 'assets/materials/baselines');
mkdirSync(baselineDir, { recursive: true });
const update = process.argv.includes('--update');
const threshold = 0.003; // 千分之三的像素不同就算漂移

const ids = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const scan = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.png'))
        .map((f) => ({ id: f.replace(/\.png$/, ''), dir }))
    : [];
const files = ids.length
  ? ids.map((id) => ({ id, dir: specimenDir }))
  : [...scan(specimenDir), ...scan(skeletonDir), ...scan(pagesDir)];

const browser = await loadChromium().launch({ executablePath: findChrome() });
const page = await browser.newPage();
const results = [];
for (const entry of files) {
  const id = entry.id;
  const current = join(entry.dir, id + '.png');
  const baseline = join(baselineDir, id + '.png');
  if (!existsSync(current)) {
    results.push({ id, status: 'missing-specimen' });
    continue;
  }
  if (!existsSync(baseline) || update) {
    writeFileSync(baseline, readFileSync(current));
    results.push({ id, status: update ? 'updated' : 'baseline-created' });
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
  results.push({ id, status: ok ? 'same' : 'drift', ratio: +(diff.ratio * 100).toFixed(3), ...diff });
  if (!ok) {
    writeFileSync(join(baselineDir, id + '.current.png'), readFileSync(current));
  }
}
await browser.close();
console.log(JSON.stringify({ threshold, results }, null, 2));
const drift = results.filter((r) => r.status === 'drift');
if (drift.length) {
  console.error(
    '视觉漂移：' + drift.map((d) => `${d.id} ${d.ratio}%`).join('，') + '。确认是想要的改动后跑 --update 更新基线。',
  );
  process.exitCode = 1;
}
