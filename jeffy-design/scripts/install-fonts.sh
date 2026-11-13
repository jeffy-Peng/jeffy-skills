#!/usr/bin/env bash
# 安装主题需要的字体。幂等：已经能命中就跳过。
# 用法 bash scripts/install-fonts.sh [--force]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$ROOT/scripts/fonts.lock.json"
DEST="${FONTS_DIR:-$HOME/.local/share/fonts/jeffy-design}"
FORCE=""
[ "${1:-}" = "--force" ] && FORCE=1

have_family() { command -v fc-match >/dev/null 2>&1 && fc-match "$1" 2>/dev/null | grep -qi "$1"; }

if [ -z "$FORCE" ] && have_family "Noto Serif SC" && have_family "Georgia"; then
  echo "字体已可用，跳过。需要重装加 --force。"
  exit 0
fi

command -v python3 >/dev/null 2>&1 || { echo "需要 python3 读取字体清单"; exit 1; }
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 - "$LOCK" <<'PY' > "$TMP/plan.txt"
import json,sys
lock=json.load(open(sys.argv[1],encoding='utf-8'))
for f in lock['fonts']:
    print('\t'.join([f['family'],f['url'],f['file'],f['sha256'],f.get('extract','')]))
PY

while IFS=$'\t' read -r family url file sha extract; do
  echo "下载 $family"
  curl -fsSL --retry 3 --connect-timeout 15 -o "$TMP/$file" "$url"
  actual="$(python3 -c "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" "$TMP/$file")"
  if [ "$actual" != "$sha" ]; then
    echo "校验失败：$family 期望 $sha 实际 $actual" >&2
    exit 1
  fi
  if [ "$extract" = "cabextract" ]; then
    if ! command -v cabextract >/dev/null 2>&1; then
      echo "缺少 cabextract，尝试用包管理器安装"
      if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then sudo -n apt-get install -y cabextract >/dev/null 2>&1 || true; fi
      if ! command -v cabextract >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then apt-get install -y cabextract >/dev/null 2>&1 || true; fi
    fi
    command -v cabextract >/dev/null 2>&1 || { echo "需要 cabextract 解压 Georgia。Debian/Ubuntu: apt-get install cabextract；macOS: brew install cabextract" >&2; exit 1; }
    mkdir -p "$TMP/georgia"
    cabextract -q -d "$TMP/georgia" "$TMP/$file"
    cp "$TMP"/georgia/*.TTF "$DEST/"
  else
    cp "$TMP/$file" "$DEST/"
  fi
done < "$TMP/plan.txt"

if command -v fc-cache >/dev/null 2>&1; then fc-cache -f "$DEST" >/dev/null 2>&1 || fc-cache -f >/dev/null 2>&1 || true; fi

for f in "Noto Serif SC" "Noto Sans SC" "Georgia"; do
  if have_family "$f"; then echo "✓ $f"; else echo "✗ $f 仍未命中，检查 $DEST 与 fontconfig 路径" >&2; exit 1; fi
done
echo "字体安装在 $DEST"
