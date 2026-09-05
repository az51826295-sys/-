<!-- provenance: {"source_id": "docs/mvp-build-playbook.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-24T20:19:47", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# MVP 빌드 플레이북 — 솔로, 실행순서 (2026-08-22 작성)

전제: Phase 0 게이트(수요="재현이 병목" 답) 통과 + 드라이런 종료(08-24) 후 착수.
북극성 docs/product-vision.md, 청사진 docs/rookery-architecture.md 그림3.
엔진(80%)은 있음. 이건 "엔진에 GitHub 얼굴 붙이기." 각 태스크에 완료조건(DoD).

## 순서 원칙
가장 무서운 것부터(리스크 선소진) → 그다음 가치순. 매 태스크는 **하루 안에
데모 가능한 단위**로 쪼갬. 안 되면 더 쪼갬.

---

## Week 0 — 스파이크 ✅ **통과 (2026-08-23)**
**목표: "GitHub App이 이슈를 읽고 코멘트를 단다"를 최소로 증명.**
- [x] GitHub App 등록 (App ID 4689482, 권한 Issues: Read and write)
- [x] 개인키로 JWT → installation token 교환 (tools/spike_github_app.py)
- [x] 그 토큰으로 이슈에 코멘트 발송 → **HTTP 201**
- **DoD 달성**: legendary-octo-spork#1 에 봇 코멘트가 실제로 떴다
  (issuecomment-5384951404).
- **의미**: MVP에서 유일하게 새롭고 무서웠던 조각(JWT→설치토큰→코멘트)이
  증명됨. Week 1~4는 전부 "이미 있는 엔진 + 이 파이프". 24일 이후 Week 1부터.
- 운영 메모: 무인증 60/시 → 설치 토큰 5,000/시로 해결(오늘 겪은 rate limit).
  개인키는 repo 밖(Desktop/…/*.pem), .gitignore에 *.pem.

## 버티컬 슬라이스 ✅ **통과 (2026-08-24)** — 제품이 존재한다
플레이북 순서보다 먼저, 두 반쪽을 잇는 최소 제품을 증명:
- [x] tools/reproduce_and_post.py: 진짜 이슈 → 재현 유도 → HEAD 실패 검증 →
      실패하면 코멘트 발송, 못 만들면 침묵.
- [x] **실증**: toolz#626 재현(Haiku $0.002) → HEAD 실패 확인(accepted) →
      legendary-octo-spork#1에 실제 코멘트 발송 HTTP 201
      (issuecomment-5394023496).
- **의미**: 엔진(재현·검증) + App(코멘트) 두 반쪽이 하나로 돎. Week 1~4는
      이제 이 슬라이스를 "자동·웹훅·다중저장소·배포"로 넓히는 일.

## Week 1 — 웹훅 수신기 ✅ **통과 (2026-08-24)**
- [x] tools/webhook_server.py (FastAPI): GET /health, POST /webhook
      (X-Hub-Signature-256 HMAC 검증) → issues.opened/reopened를 백그라운드
      스레드로 슬라이스(reproduce_and_post) 트리거, 즉시 200 반환.
- [x] 실증: 실제 서버 기동 → 서명된 이슈 이벤트 발송 → dispatch 확인
      (repo/issue 정확). 테스트 5건(서명 강제·디스패치·미지원 로그·noop).
- **설계 메모(정직)**: (1) 웹훅은 **앱이 설치된 저장소에서만** 온다 → post_back
      대상은 언제나 동의한 저장소. (2) 재현은 **헤드 클론이 있는 저장소만**
      (SUPPORTED 7개); 임의 고객 저장소 클론·실행 환경이 Week 2의 핵심.
- 남음: 공개 URL(ngrok/배포는 Week 4), installation 저장·토큰 갱신 배선.

## Week 2 — 임의 고객 저장소 온보딩 ✅ **통과 (2026-08-24)**
- [x] tools/customer_repo.py: 앱 토큰(사설)/공개 URL로 clone → 패키지 탐지
      (root·src 레이아웃 자동) → 임포트 확인 → reproduce_in(재현 실행).
- [x] reproduce_and_post.reproduce_generic: 임의 slug를 온보딩→유도→재현→발송,
      클론 실패는 우아하게 침묵.
- [x] 웹훅 연결: 미리 클론 안 한 저장소는 일반 경로로 온보딩·재현.
- [x] **실증**: toolz를 처음부터 새로 클론(공개) → toolz#626 재현 accepted;
      marshmallow(src 레이아웃) 임포트 자동; 일반 경로 dry-run "reproduced".
      테스트 10건(탐지·재현·침묵·needs_deps·로컬 클론·웹훅).
- **정직한 범위**: **순수 파이썬**(빌드 불필요)만. 서드파티 의존성 부재 시
      needs_deps로 침묵 — venv 의존성 설치·C확장·특정 파이썬 버전은 다음 확장.
      find_package는 첫 패키지를 고름(toolz→tlz 별칭 선택했으나 PYTHONPATH가
      전부 덮어 무해).

## Week 3 — 대시보드 + 사람 검토 게이트 ✅ **통과 (2026-08-24)**
- [x] tools/review_store.py: 재현된 테스트를 자동 발송 대신 검토 큐(json)에.
      멱등(같은 repo#issue pending 하나), pending/posted/dismissed.
- [x] 웹훅 REVIEW_MODE(기본 on): 재현되면 발송 대신 큐에 등록.
- [x] 대시보드 라우트(webhook_server): GET / (지표 카드 + 검토 큐 + 코드),
      POST /review/{id}/approve(승인→코멘트 발송), /dismiss(기각).
- [x] 실증: 서버 기동 → 큐에 toolz#626 → GET / 에 렌더 확인(승인 버튼).
      테스트 9건(CRUD·멱ододент·대시보드 렌더·승인 posted·기각).
- **이제 흐름**: 이슈 열림 → 온보딩·재현 → **검토 큐** → 사장님 승인 → 발송.
      "사장님은 품질 게이트의 마지막 사람 한 명"이 실물이 됨(하루 5분).

## Week 4 — 배포 ✅ **아티팩트 완료 (2026-08-24)** / 결제 보류
- [x] deploy/requirements.txt (프로덕션 의존성 4개: fastapi·uvicorn·PyJWT·
      cryptography; 엔진은 stdlib+sqlite).
- [x] deploy/Dockerfile (git 포함, REVIEW_MODE=1, 키·시크릿은 런타임 주입).
- [x] deploy/render.yaml (무료 티어 원클릭), 개인키 B64 env → 시작 시 파일 복원.
- [x] docs/deploy-guide.md: 공개 URL 필요성, ngrok→Render/Fly, GitHub App
      웹훅 켜기(URL·시크릿·Issues 이벤트), 검증 순서.
- **남은 것(코드 아님, 사장님)**: 호스트 하나 선택(Render 무료 티어 권장) +
      배포 + App 웹훅 켜기. 서버 잡히면 3분.
- **결제·사업자·계좌는 보류**: 첫 유료 고객이 방아쇠. 무료 파일럿이 먼저.

## 크리티컬 패스
Week 0 스파이크가 전부의 열쇠. 그거 되면 1~4는 "이미 있는 엔진 + 알려진 조각".
막히면 Week 0에서 막힘 → 그때 방향 재검토(직접 API가 안 되면 GitHub Action 방식 등).

## 절대 안 늘리는 것 (솔로 규율)
설정 UI·팀 기능·권한·온프렘·다국어·모바일. 한 루프만. 늘리고 싶으면
docs/product-vision.md "경계" 다시 읽기.

## 실험 메뉴 (24일 전 $0로 가능한 것 — 정직한 우선순위)
1. **[최우선·비트랩] 아웃리치 답 관측** — 다른 게 아무리 재밌어도 이게 밸브.
2. **[가능·저트랩] Week 0 스파이크를 지금** — GitHub App 등록·토큰·코멘트는
   엔진/드라이런 무관. 제일 무서운 리스크를 지금 소진해두면 24일이 러닝스타트.
   단 "제품 빌드 시작"이므로 수요 답 전이면 심리적 트랩 주의(리스크 소진 목적만).
3. **[트랩] 재현율 더 측정** — 우리 코퍼스는 소진됐고 게이트 민감. 파일럿에서 잰다.
4. **[트랩] 게임 트랙·새 축** — 수요측 0을 가린다. 안 연다.
