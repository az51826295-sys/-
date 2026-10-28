#!/usr/bin/env bash
# 두근도트 결제를 여는 마지막 한 걸음 (10-28).
#
# 열쇠를 화면에 찍지 않는다 — 파일에서 읽어 바로 넘긴다.
# 웹훅 비밀(whsec_...)은 Dodo 대시보드에서 엔드포인트를 만들면 거기 뜬다.
#   https://app.dodopayments.com  →  Developer → Webhooks → Add Endpoint
#   URL: https://dot-web-production-7e03.up.railway.app/api/dot/pay/webhook
#   이벤트: payment.succeeded  (이것만 쓴다)
set -euo pipefail
cd "$(dirname "$0")/../.."

SECRET="${1:-}"
if [ -z "$SECRET" ]; then
  echo "사용: bash engine/tools/dot_pay_open.sh whsec_여기에붙여넣기"
  echo "(웹훅 비밀이 있어야 연다 — 없으면 돈만 받고 구독이 안 켜진다)"
  exit 1
fi

KEY=$(node -p "JSON.parse(require('fs').readFileSync('.keys/dodo-rookery.json','utf8')).DODO_API_KEY")

railway variables --service dot-web \
  --set "DOT_DODO_API_KEY=$KEY" \
  --set "DOT_DODO_PRODUCT_MENHERA=pdt_0Nqh2PP7irGeINl9HANq4" \
  --set "DOT_DODO_ENV=test" \
  --set "DOT_DODO_WEBHOOK_SECRET=$SECRET"

echo
echo "넷 다 넣었습니다. 서버가 다시 뜨면 결제창을 확인하세요:"
echo "  npx tsx engine/tools/ui_audit.mts dot"
