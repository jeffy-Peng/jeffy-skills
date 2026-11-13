// 环境自检与自修。换机器、容器重建、隔了几个月回来，先跑这一条。
// 用法 node scripts/doctor.mjs [--no-install]
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noInstall = process.argv.includes('--no-install');
const results = [];
const browser = await import('../lib/browser.mjs');

function run(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
}

function record(ok, label, detail = '') {
  results.push({ ok, label, detail });
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' · ' + detail : ''}`);
}

async function check(label, probe, repair) {
  try {
    record(true, label, (await probe()) || '');
  } catch (error) {
    if (!repair || noInstall) {
      record(false, label, error.message);
      return;
    }
    console.log(`  修复中：${repair.description}`);
    const fixed = repair.run();
    if (fixed.status !== 0) {
      record(false, label, (fixed.stderr || fixed.stdout || '修复失败').trim().split('\n').slice(-2).join(' '));
      return;
    }
    try {
      record(true, label, ((await probe()) || '') + '（已修复）');
    } catch (retry) {
      record(false, label, retry.message);
    }
  }
}

await check('Node 18+', () => {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) throw Error('当前 ' + process.versions.node + '，需要 18 或更高');
  return process.versions.node;
});

check(
  'Playwright 模块',
  () => {
    const pkg = resolve(root, 'node_modules/playwright/package.json');
    if (!existsSync(pkg)) throw Error('未安装');
    return JSON.parse(readFileSync(pkg, 'utf8')).version;
  },
  { description: 'npm install', run: () => run('npm', ['install', '--no-audit', '--no-fund']) },
);

await check(
  'Chromium 浏览器',
  async () => {
    const launched = await browser.loadChromium().launch({ executablePath: browser.findChrome() });
    const version = launched.version();
    await launched.close();
    return 'Chromium ' + version;
  },
  {
    description: 'npx playwright install chromium',
    run: () => run('npx', ['playwright', 'install', 'chromium']),
  },
);

const lock = JSON.parse(readFileSync(resolve(root, 'scripts/fonts.lock.json'), 'utf8'));
await check(
  '主题字体',
  () => {
    if (process.platform === 'win32') return 'Windows 上跳过 fc-match 检查';
    const missing = lock.fonts.filter((entry) => {
      const hit = run('fc-match', ['-f', '%{family}', entry.family]);
      return hit.status !== 0 || !hit.stdout.toLowerCase().includes(entry.family.toLowerCase());
    });
    if (missing.length) throw Error('缺 ' + missing.map((f) => f.family).join('、'));
    return lock.fonts.map((f) => f.family).join('、');
  },
  { description: 'bash scripts/install-fonts.sh（带校验和）', run: () => run('bash', ['scripts/install-fonts.sh']) },
);

check(
  '字体子集工具',
  () => {
    const candidates = [process.env.FONTTOOLS_PYTHON, '/opt/data/venvs/fonts/bin/python', 'python3', 'python'].filter(
      Boolean,
    );
    for (const candidate of candidates) {
      const probe = run(candidate, ['-c', 'import fontTools, brotli; print(fontTools.version)']);
      if (probe.status === 0) return `${candidate} fonttools ${probe.stdout.trim()}`;
    }
    throw Error('缺 fonttools 与 brotli');
  },
  {
    description: '新建 /opt/data/venvs/fonts 并安装 fonttools brotli',
    run: () => {
      mkdirSync('/opt/data/venvs', { recursive: true });
      const venv = run('python3', ['-m', 'venv', '/opt/data/venvs/fonts']);
      if (venv.status !== 0) return venv;
      return run('/opt/data/venvs/fonts/bin/pip', ['install', '-q', 'fonttools', 'brotli']);
    },
  },
);

await check(
  '生成物一致性',
  () => {
    const stale = run(process.execPath, ['scripts/sync.mjs', '--check']);
    if (stale.status !== 0) throw Error('生成物与声明不一致');
    return '无变化';
  },
  { description: 'node scripts/sync.mjs', run: () => run(process.execPath, ['scripts/sync.mjs']) },
);

await check('验收冒烟', () => {
  const built = run(process.execPath, [
    'scripts/build-composition.mjs',
    'tests/composition/pressure.json',
    '/tmp/doctor-smoke.html',
  ]);
  if (built.status !== 0) throw Error((built.stderr || '构建失败').trim().split('\n')[0]);
  const verify = run(process.execPath, ['scripts/verify-page.mjs', '/tmp/doctor-smoke.html', '/tmp/doctor-smoke.json']);
  if (verify.status !== 0) throw Error((verify.stderr || verify.stdout || '验收失败').trim().split('\n')[0]);
  return (verify.stdout || '').trim().split('\n')[0];
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项就绪`);
if (failed.length) {
  console.error('未就绪：' + failed.map((r) => `${r.label}（${r.detail}）`).join('，'));
  process.exitCode = 1;
}
