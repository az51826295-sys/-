<!-- provenance: {"source_id": "docs/deploy-guide.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-24T20:24:48", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# 배포 가이드 — Rookery Reproduce (Week 4, 결제 제외)

목표: 웹훅 수신기 + 대시보드 + 엔진을 **공개 HTTPS URL** 위에 올린다. 결제는
첫 유료 고객 뒤로 미룸(사업자·계좌도 그때). 지금은 무료 파일럿용 배포.

## 왜 서버가 필요한가
GitHub App 웹훅은 **공개 HTTPS URL**로 이벤트를 보낸다. 노트북(절전·10055)은
부적합 — 드라이런이 4시간 만에 죽은 이유(docs/stage1-dryrun48.md). 그래서
항상 켜진 호스트가 필요하다.

## 가장 쉬운 순서 (솔로)
1. **테스트만**: `ngrok http 8000` → 임시 공개 URL. 로컬에서 웹훅 흐름 검증.
2. **실 파일럿**: 관리 필요 없는 PaaS 하나 —
   - **Render.com** (deploy/render.yaml 있음, 무료 티어): 저장소 연결 → 자동 빌드.
   - 또는 Fly.io / Railway (Dockerfile 그대로 씀).
   - VPS(더 안정적이지만 손이 감): deploy/README.md의 systemd 방식.

## 배포 단계 (Render 기준)
1. 이 저장소를 Render에 연결 (Docker 런타임, deploy/Dockerfile).
2. 환경변수 주입 (대시보드에서, 이미지에 넣지 말 것):
   - `GITHUB_APP_ID` = 4689482
   - `GITHUB_APP_KEY_B64` = 개인키 .pem을 base64 한 줄로
     (`base64 -w0 app.pem` → 그 문자열). 시작 시 파일로 자동 복원됨.
   - `WEBHOOK_SECRET` = 아무 긴 랜덤 문자열 (아래 4번과 동일하게)
   - `ANTHROPIC_API_KEY` = 유도(B형)용 (없으면 A형만)
   - `REVIEW_MODE` = 1 (기본; 자동 발송 대신 검토 큐)
3. 배포 후 URL 확인: `https://<앱>.onrender.com/health` → `{"ok":true}`.
4. **GitHub App에 웹훅 켜기** (지금은 꺼져 있음):
   github.com/settings/apps → 앱 → General →
   - Webhook **Active** 체크
   - Webhook URL = `https://<앱>.onrender.com/webhook`
   - Webhook secret = 위 WEBHOOK_SECRET 과 동일
   - Save. Permissions & events → **Subscribe to events → Issues** 체크.
5. 검증: 연결된 저장소(설치된)에 이슈 하나 열기 → 로그에 "검토 큐 등록" →
   `https://<앱>.onrender.com/` (대시보드)에 뜸 → [승인·발송] → 코멘트.

## 보안 (지금 범위)
- 개인키·시크릿은 **런타임 env만**, 이미지·저장소에 넣지 않음(.gitignore *.pem).
- 재현은 격리 워크트리 + 순수 파이썬만(고객 코드가 서버에서 실행되므로,
  샌드박스 강화는 "비밀 있는 저장소 첫 고객"이 방아쇠 —
  docs/rookery-security-boundary-design.md).

## 아직 안 하는 것 (첫 유료 고객 뒤)
결제(Gumroad/Paddle/Stripe 링크 + 유료/무료 게이트), 사업자 등록, 멀티테넌트
과금. 지금은 무료 파일럿으로 머지율·손질률·사람 시간을 재는 게 먼저.
