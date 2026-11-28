// 对最终 HTML 运行真实浏览器事件；不把包含交互属性等同于事件有效。
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withBrowser } from '../lib/browser.mjs';
const [input, outArg = 'build/reports/html-interaction.json'] = process.argv.slice(2);
if (!input) throw Error('用法 node scripts/test-html-interaction.mjs 输出.html [报告.json]');
const out = resolve(outArg);
mkdirSync(dirname(out), { recursive: true });
let inventory = [];
const results = [],
  errors = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}
async function load(context, url) {
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.renderComplete === true);
  assert.equal(await p.evaluate(() => Boolean(window.renderFailed)), false);
  return p;
}
async function hitPoint(locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate((n) => {
    const b = n.getBoundingClientRect();
    const order = Array.from({ length: 31 }, (_, i) => i + 1).sort((a, b) => Math.abs(a - 16) - Math.abs(b - 16));
    for (const y of order)
      for (const x of order) {
        const px = b.left + (b.width * x) / 32,
          py = b.top + (b.height * y) / 32,
          hit = document.elementFromPoint(px, py);
        if (hit === n || n.contains(hit)) return { x: px, y: py };
      }
    throw Error('对象没有可命中的实际区域：' + n.dataset.focusKey);
  });
}
const url = pathToFileURL(resolve(input));
await withBrowser(async (browser) => {
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
    const page = await load(context, url.href);
    await page.waitForFunction(() => window.interactionReady === true);
    inventory = await page.locator('.jd-component').evaluateAll((hs) =>
      hs.map((h, i) => ({
        index: i,
        id: h.closest('[data-block]')?.dataset.block || String(i),
        count: h.querySelectorAll('[data-focus-key]').length,
        geometry: h.querySelectorAll('svg rect,svg circle,svg path,svg polygon,table').length,
      })),
    );
    check('annotated-components', () => {
      for (const h of inventory) if (h.geometry) assert.ok(h.count > 0, h.id + ' 缺少可选择对象');
    });
    for (const item of inventory.filter((h) => h.count)) {
      const host = page.locator('.jd-component').nth(item.index),
        target = host.locator('[data-focus-key]').last();
      const get = () =>
        host.evaluate((h) => {
          const shape = [...h.querySelectorAll('[data-focus-key]')];
          return shape.map((n) => ({ key: n.dataset.focusKey, opacity: Number(getComputedStyle(n).opacity) }));
        });
      const hasUnrelated = await host.evaluate((h) => {
        const ns = [...h.querySelectorAll('[data-focus-key]')],
          selected = ns.at(-1);
        const ends = (n) => [n.dataset.linkFrom, n.dataset.linkTo];
        return ns.some(
          (n) =>
            n !== selected &&
            !ends(n).includes(selected.dataset.focusKey) &&
            !ends(selected).includes(n.dataset.focusKey),
        );
      });
      const initial = await get();
      check(item.id + '-initial-complete', () => assert.ok(initial.every((n) => n.opacity === 1)));
      const geometry = await target.evaluate((n) => {
        const b = n.getBoundingClientRect();
        return { width: b.width, height: b.height };
      });
      const stateCheck = async (name, complete) => {
        const state = await get();
        check(item.id + '-' + name, () =>
          assert.ok(
            complete
              ? state.every((n) => n.opacity === 1)
              : state.at(-1).opacity === 1 && (!hasUnrelated || state.some((n) => n.opacity < 1)),
          ),
        );
      };
      const point = await hitPoint(target);
      await page.mouse.move(point.x, point.y);
      await stateCheck('hover', false);
      const labelState = await host.evaluate((h) => {
        const shapes = new Map([...h.querySelectorAll('[data-focus-key]')].map((n) => [n.dataset.focusKey, n]));
        return [...h.querySelectorAll('[data-label-for],[data-node-title]')].map((n) => {
          const key = n.dataset.labelFor || 'node' + n.dataset.nodeTitle;
          const shape = shapes.get(key);
          return {
            key,
            ok:
              Boolean(shape) &&
              (Number(getComputedStyle(n).opacity) === 1) === (Number(getComputedStyle(shape).opacity) === 1),
          };
        });
      });
      if (labelState.length)
        check(item.id + '-associated-labels-follow', () =>
          assert.ok(
            labelState.every((x) => x.ok),
            JSON.stringify(labelState),
          ),
        );

      const after = await target.evaluate((n) => {
        const b = n.getBoundingClientRect();
        return { width: b.width, height: b.height };
      });
      check(item.id + '-no-rescale', () =>
        assert.ok(Math.abs(after.width - geometry.width) < 0.01 && Math.abs(after.height - geometry.height) < 0.01),
      );
      const transitions = await target.evaluate((n) => getComputedStyle(n).transitionDuration);
      check(item.id + '-reduced-motion', () => assert.equal(parseFloat(transitions), 0));
      await page.mouse.move(5, 5);
      await stateCheck('leave-restores', true);
      await target.focus();
      await target.press('Enter');
      await page.mouse.move(5, 5);
      await stateCheck('keyboard-lock', false);
      await target.press('Escape');
      await stateCheck('escape-restores', true);
      await page.mouse.click(point.x, point.y);
      await stateCheck('mouse-first-click-locks', false);
      await page.mouse.click(point.x, point.y);
      await stateCheck('mouse-second-click-restores', true);
    }
    await context.close();
    const touchContext = await browser.newContext({
      hasTouch: true,
      viewport: { width: 1400, height: 900 },
      reducedMotion: 'reduce',
    });
    const touch = await load(touchContext, url.href);
    await touch.waitForFunction(() => window.interactionReady === true);
    for (const item of inventory.filter((h) => h.count > 1)) {
      const host = touch.locator('.jd-component').nth(item.index),
        target = host.locator('[data-focus-key]').last();
      const hasUnrelated = await host.evaluate((h) => {
        const ns = [...h.querySelectorAll('[data-focus-key]')],
          s = ns.at(-1);
        return ns.some(
          (n) =>
            n !== s &&
            ![n.dataset.linkFrom, n.dataset.linkTo].includes(s.dataset.focusKey) &&
            ![s.dataset.linkFrom, s.dataset.linkTo].includes(n.dataset.focusKey),
        );
      });
      const values = () =>
        host.locator('[data-focus-key]').evaluateAll((ns) => ns.map((n) => Number(getComputedStyle(n).opacity)));
      const stateCheck = async (name, complete) => {
        const v = await values();
        check(item.id + '-' + name, () =>
          assert.ok(
            complete ? v.every((x) => x === 1) : v.at(-1) === 1 && (!hasUnrelated || v.some((x) => x < 1)),
            JSON.stringify(v),
          ),
        );
      };
      const point = await hitPoint(target);
      await touch.touchscreen.tap(point.x, point.y);
      await stateCheck('first-touch-locks', false);
      await touch.touchscreen.tap(point.x, point.y);
      await stateCheck('second-touch-restores', true);
      await touch.touchscreen.tap(point.x, point.y);
      await touch.touchscreen.tap(5, 5);
      await stateCheck('blank-touch-restores', true);
    }
    await touchContext.close();
    const staticContext = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
    const staticUrl = new URL(url);
    staticUrl.searchParams.set('static', '1');
    const staticPage = await load(staticContext, staticUrl.href);
    const ready = await staticPage.evaluate(() => window.interactionReady);
    check('static-mode-no-binding', () => assert.equal(ready, false));
    const complete = await staticPage
      .locator('[data-focus-key]')
      .evaluateAll((ns) => ns.every((n) => Number(getComputedStyle(n).opacity) === 1));
    check('static-mode-complete', () => assert.ok(complete));
    await staticContext.close();
  } catch (e) {
    results.push({ name: 'event-execution', ok: false, message: e.message });
  }
});
if (errors.length) results.push({ name: 'browser-errors', ok: false, errors });
writeFileSync(
  out,
  JSON.stringify(
    {
      results,
      errors,
      coverage: { components: inventory.length, interactiveComponents: inventory.filter((h) => h.count).length },
      boundary: '真实事件与几何检查；图形语义、全部关联标签及重叠命中仍需逐场景复核',
    },
    null,
    2,
  ),
);
console.log(results.filter((r) => r.ok).length + '/' + results.length + ' HTML 交互检查通过，' + out);
if (results.some((r) => !r.ok)) process.exitCode = 1;
