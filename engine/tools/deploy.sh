#!/bin/sh
# **올리기 = 커밋을 박고 올리기** (2026-09-22).
#
# `railway up` 은 작업 트리를 올리는 방식이라 깃 커밋이 안 딸려 간다
# (`RAILWAY_GIT_COMMIT_SHA` 가 비어 있음을 확인했다).
#
# 파일(`.deploy-commit`)로 박아 봤지만 두 번 다 실패했다:
#   1) `.gitignore` 에 넣었더니 Railway 가 업로드에서 뺐다 — 안전장치 둘이 서로 막았다
#   2) 빼고 다시 올려도 런타임에서 파일이 안 보였다(업로드나 빌드 어딘가에서 빠진다)
# 그래서 **환경변수**로 박는다 — 빠질 자리가 없고 올리는 트리와도 무관하다.
#
#   sh engine/tools/deploy.sh rookery-worker
set -e
SVC="${1:-rookery-worker}"
SHA=$(git rev-parse HEAD)
railway variables --service "$SVC" --set "ROOKERY_COMMIT=$SHA" >/dev/null
echo "박음: $(echo "$SHA" | cut -c1-7) -> $SVC"
railway up --service "$SVC" --ci
echo "올림. 몇 분 뒤: npx tsx engine/tools/rookery_env.mts engine/tools/deploy_check.mts"
