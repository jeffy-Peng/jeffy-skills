// 供构建验收与回归测试解析浏览器依赖。
// 顺序：环境变量 → 本仓库 node_modules → DSH profile。都找不到就给出安装命令。
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from './constants.mjs';

export { PROJECT_ROOT };

function tryPkg(pkgJson) {
  if (!pkgJson || !existsSync(pkgJson)) return null;
  try {
    const req = createRequire(pathToFileURL(pkgJson).href);
    const pw = req('playwright');
    const chromium = pw.chromium || (pw.default && pw.default.chromium);
    return chromium ? { chromium, from: pkgJson } : null;
  } catch {
    return null;
  }
}

function dshProfiles() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const root = resolve(home, '.dsh', 'profiles');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => existsSync(join(root, d, 'package.json')))
    .sort((a, b) => (a === 'desktop' ? -1 : b === 'desktop' ? 1 : 0))
    .map((d) => join(root, d, 'package.json'));
}

export function loadChromium() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_PKG) candidates.push(resolve(process.env.PLAYWRIGHT_PKG));
  candidates.push(join(PROJECT_ROOT, 'package.json'), join(process.cwd(), 'package.json'));
  candidates.push(...dshProfiles());

  for (const pkg of candidates) {
    const hit = tryPkg(pkg);
    if (hit) return hit.chromium;
  }

  throw new Error(
    '找不到 playwright。两种安装方式任选一种：\n' +
      '  1. 在项目里装：npm i -D playwright && npx playwright install chromium\n' +
      '  2. 已经装在别处：设 PLAYWRIGHT_PKG=那个目录的 package.json 路径；修复依赖后重新渲染验收。',
  );
}

// Chromium 可执行文件。先看 playwright 自己的缓存目录，再看系统安装。
export function findChrome() {
  const roots = [
    join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    join(process.env.USERPROFILE || process.env.HOME || '', 'AppData', 'Local', 'ms-playwright'),
    join(process.env.HOME || '', '.cache', 'ms-playwright'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries = [];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const d of entries
      .filter((x) => x.startsWith('chromium-'))
      .sort()
      .reverse()) {
      for (const sub of ['chrome-win64', 'chrome-win', 'chrome-linux', 'chrome-mac']) {
        const exe = join(root, d, sub, sub.startsWith('chrome-win') ? 'chrome.exe' : 'chrome');
        if (existsSync(exe)) return exe;
      }
    }
  }
  const system = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const p of system) if (existsSync(p)) return p;
  return undefined;
}

export async function withBrowser(fn, launchOptions = {}) {
  const browser = await loadChromium().launch({ executablePath: findChrome(), ...launchOptions });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

export async function openDeckPage(browser, htmlPath, options = {}) {
  const {
    viewport = { width: 1400, height: 1000 },
    deviceScaleFactor,
    reducedMotion = 'reduce',
    staticMode = false,
    timeout = 20000,
  } = options;
  const pageOptions = { viewport, reducedMotion };
  if (deviceScaleFactor !== undefined) pageOptions.deviceScaleFactor = deviceScaleFactor;
  const page = await browser.newPage(pageOptions);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = pathToFileURL(resolve(htmlPath));
  if (staticMode) url.searchParams.set('static', '1');
  await page.goto(url.href);
  await page.waitForFunction(() => window.renderComplete === true, {}, { timeout });
  return { page, errors };
}
