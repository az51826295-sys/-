#!/bin/sh
# **올리기 = 커밋을 박고 올리기** (2026-09-22).
# `railway up` 은 작업 트리를 올리므로 깃 커밋이 안 딸려 간다. 그래서 올리기 직전에 파일로 박는다.
# 이러면 "올렸다" 와 "도는 커밋" 이 **만들어질 때부터** 같아진다 — 사람이 기억할 일이 없다.
#   sh engine/tools/deploy.sh rookery-worker
set -e
SVC="${1:-rookery-worker}"
git rev-parse HEAD > .deploy-commit
echo "박음: $(cat .deploy-commit | cut -c1-7) → $SVC"
railway up --service "$SVC" --ci
echo "올림. 몇 분 뒤: npx tsx engine/tools/rookery_env.mts engine/tools/deploy_check.mts"
