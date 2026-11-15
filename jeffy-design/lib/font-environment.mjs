import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function fontPython() {
  for (const candidate of [
    process.env.FONTTOOLS_PYTHON,
    '/opt/data/venvs/fonts/bin/python',
    'python',
    'python3',
  ].filter(Boolean)) {
    if (spawnSync(candidate, ['-c', 'import fontTools, brotli'], { stdio: 'pipe' }).status === 0) return candidate;
  }
  throw Error('嵌入字体需 Python + fonttools + brotli；可设置 FONTTOOLS_PYTHON');
}
export function resolveFontFile(family, filename, directory) {
  const dirs = [
    directory,
    process.env.FONTS_DIR,
    join(homedir(), '.local/share/fonts/jeffy-design'),
    join(process.env.WINDIR || 'C:/Windows', 'Fonts'),
    join(process.env.LOCALAPPDATA || '', 'Microsoft/Windows/Fonts'),
  ].filter(Boolean);
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const file = readdirSync(dir).find((n) => n.toLowerCase() === filename.toLowerCase());
    if (file) return join(dir, file);
  }
  const hit = spawnSync('fc-match', ['-f', '%{family}\n%{file}', family], { encoding: 'utf8' });
  const [matched, file] = (hit.stdout || '').trim().split('\n');
  if (hit.status === 0 && matched?.toLowerCase().includes(family.toLowerCase()) && existsSync(file)) return file;
  throw Error('找不到字体文件：' + family + '；设置 FONTS_DIR 或安装主题字体');
}
