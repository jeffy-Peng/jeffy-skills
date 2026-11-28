// 跨平台 Python 工具调用器：统一解析普通 Python 或带 fonttools 的 Python。
// 用法 node scripts/run-python.mjs [--fonttools] <script.py> [args...]
import { spawnSync } from 'node:child_process';
import { fontPython } from '../lib/font-environment.mjs';

const args = process.argv.slice(2);
const needFontTools = args[0] === '--fonttools';
const forward = needFontTools ? args.slice(1) : args;
if (!forward.length) throw Error('用法 node scripts/run-python.mjs [--fonttools] <script.py> [args...]');

function resolvePython() {
  if (needFontTools) return [fontPython()];
  for (const cmd of [[process.env.PYTHON], ['python'], ['python3'], ['py', '-3']].filter((c) => c[0])) {
    const probe = spawnSync(cmd[0], [...cmd.slice(1), '--version'], { stdio: 'pipe' });
    if (probe.status === 0) return cmd;
  }
  throw Error('找不到 Python 解释器；请安装 Python 3 或设置 PYTHON 环境变量');
}

const [bin, ...prefix] = resolvePython();
const res = spawnSync(bin, [...prefix, ...forward], { stdio: 'inherit' });
if (res.error) throw res.error;
process.exitCode = res.status ?? 1;
