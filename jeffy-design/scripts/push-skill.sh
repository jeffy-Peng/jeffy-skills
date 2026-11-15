#!/usr/bin/env bash
# 把这个 skill 推到 jeffy-skills 仓库的 jeffy-design 目录。
# 本地不做 git 仓库：每次浅克隆到缓存目录，覆盖、提交、推送。
# 用法：bash scripts/push-skill.sh "提交说明"
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${PUSH_WORKDIR:-/opt/data/cache/push-jeffy-skills}"
MSG="${1:-更新 jeffy-design}"
TOKEN_FILE="$HOME/.config/gh/hosts.yml"
[ -f "$TOKEN_FILE" ] || { echo "找不到 $TOKEN_FILE，无法取 token"; exit 1; }
TOKEN=$(grep -m1 'oauth_token' "$TOKEN_FILE" | sed 's/.*oauth_token: *//')
[ -n "$TOKEN" ] || { echo "token 为空"; exit 1; }

rm -rf "$WORK"
git clone --depth 1 --quiet https://github.com/jeffy-Peng/jeffy-skills.git "$WORK"
python3 - "$SRC" "$WORK/jeffy-design" <<'PY'
import shutil, sys
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
shutil.rmtree(dst, ignore_errors=True)
shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
    'node_modules', '.git', 'build', 'dist', '__pycache__', '*.log'))
PY

cd "$WORK"
git config user.name "jeffy-Peng"
git config user.email "jeffy7@163.com"
git add -A
if git diff --cached --quiet; then
  echo "无变化，跳过推送"
  exit 0
fi
git commit -q -m "$MSG"
git remote set-url origin "https://${TOKEN}@github.com/jeffy-Peng/jeffy-skills.git"
git push --quiet origin HEAD
git remote set-url origin https://github.com/jeffy-Peng/jeffy-skills.git
echo "已推送 $(git rev-parse --short HEAD)：$MSG"
