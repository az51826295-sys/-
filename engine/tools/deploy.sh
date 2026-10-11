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
#
# ── 2026-10-12: **문을 거치지 않는 길이었다.** ─────────────────────────────
# 배포 문(deploy_safe.mts)은 타입검사·미커밋·도는 일·죽은 서비스를 막는데,
# 이 스크립트는 그걸 한 번도 안 불렀다. 인수인계 문서가 개발 서버는 여기로 올리라고
# 적어 두었으니, **문이 있다는 말 자체가 반쪽이었다.**
# 이제 여기서 문을 먼저 부른다. 문이 막으면 올리지 않는다.
# 급할 때 문을 건너뛰려면 `ROOKERY_NO_GATE=1` 을 **손으로** 붙여야 한다 —
# 기본이 통과면 아무도 안 고치고, 기본이 막힘이면 적어도 알고 지나간다.
set -e
SVC="${1:-rookery-worker}"

if [ "$ROOKERY_NO_GATE" = "1" ]; then
  echo "⚠ 문을 건너뛴다(ROOKERY_NO_GATE=1) — 타입검사·미커밋·뒤처진 서비스를 아무도 안 본다."
else
  echo "문 먼저: $SVC"
  # --up 은 안 붙인다 — 여기서는 **재기만** 하고, 올리는 것은 아래 railway up 이 한다
  npx tsx engine/tools/rookery_env.mts engine/tools/deploy_safe.mts "$SVC"
fi

SHA=$(git rev-parse HEAD)
railway variables --service "$SVC" --set "ROOKERY_COMMIT=$SHA" >/dev/null
echo "박음: $(echo "$SHA" | cut -c1-7) -> $SVC"
railway up --service "$SVC" --ci
echo "올림. 몇 분 뒤: npx tsx engine/tools/rookery_env.mts engine/tools/deploy_check.mts"
