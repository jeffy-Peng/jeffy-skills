#!/usr/bin/env bash
# 只从正常 Git 工作树推送；不克隆覆盖、不读取 token、不修改 remote。
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SRC"
git rev-parse --show-toplevel >/dev/null
BRANCH="$(git symbolic-ref --short HEAD)"
[ "$BRANCH" != main ] && [ "$BRANCH" != master ] || { echo "请在修复分支提交后推送，再通过 PR 审查"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "工作树未提交，请先审查并提交变更"; exit 1; }
git fetch origin
# 陈旧快照不能覆盖远端；先正常合并/变基并重新验证。
git merge-base --is-ancestor origin/main HEAD || { echo "分支未包含最新 origin/main，先更新并验证"; exit 1; }
node scripts/sync.mjs --check
npm run test:all
git push --set-upstream origin "$BRANCH"
