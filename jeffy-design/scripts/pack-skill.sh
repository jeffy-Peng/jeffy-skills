#!/usr/bin/env bash
# 打可分发压缩包：不含 node_modules、草稿、构建产物和测试截图。
# 素材示意图、像素基线与页面骨架图必须带上，离线也能跑回归。
# 用法 bash scripts/pack-skill.sh [--budget-mb 10]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUDGET_MB=10
[ "${1:-}" = "--budget-mb" ] && BUDGET_MB="${2:-10}"
VERSION="$(python3 -c "import json;print(json.load(open('$ROOT/package.json'))['version'])")"
OUT="$ROOT/dist"; mkdir -p "$OUT"
TARGET="$OUT/jeffy-design-$VERSION.tar.gz"
cd "$ROOT"

# 目录黑名单与图片白名单都写在这一处，避免 tar 的排除规则互相覆盖。
LIST="$(mktemp)"
python3 - "$LIST" <<'PY'
import os, sys
skip_dirs = {'node_modules', 'drafts', 'dist', '.git'}
skip_rel = ('build/generated/',)  # 生成物清单随包走，其余构建产物不进包
keep_png = ('assets/materials/specimens/', 'assets/materials/baselines/', 'assets/skeletons/', 'icons/')
out = []
for root, dirs, files in os.walk('.'):
    if os.path.relpath(root, '.').replace('\\', '/') == 'build':
        dirs[:] = ['generated']
    else:
        dirs[:] = [d for d in dirs if d not in skip_dirs]
    for f in files:
        rel = os.path.relpath(os.path.join(root, f), '.')
        if f.endswith('.current.png'):
            continue
        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
            if not rel.startswith(keep_png):
                continue
        out.append(rel)
open(sys.argv[1], 'w').write('\n'.join(sorted(out)) + '\n')
PY
tar -czf "$TARGET" -T "$LIST"
rm -f "$LIST"
SIZE_MB=$(python3 -c "import os,sys;print(round(os.path.getsize(sys.argv[1])/1048576,2))" "$TARGET")
echo "打包完成 $TARGET ${SIZE_MB}MB（预算 ${BUDGET_MB}MB）"
if python3 -c "import sys;sys.exit(0 if $SIZE_MB<=$BUDGET_MB else 1)"; then :
else echo "超出预算：先清 drafts 与大图，或提高 --budget-mb" >&2; exit 1; fi
