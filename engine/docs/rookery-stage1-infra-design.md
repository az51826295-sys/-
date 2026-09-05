<!-- provenance: {"source_id": "docs/rookery-stage1-infra-design.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-22T17:56:50", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# Rookery 스테이지 1 인프라 — 서버 상주 + 인테이크 자동화 (2026-08-22 등록)

progress.md 다음 할 일 5번. 사람이 하루 세 번 손으로 돌린 것(스캔 →
검증 → 코퍼스 동결 → 러너 실행 → 채택 브랜치 검토)을 상주 서비스가
스스로 하게 한다. 제도(격리·예산·검증·감사·위생·라우팅)는 그대로.

## 있는 것

- `genesis/rookery/engine/service.py` + `deploy/` — systemd 상주
  서비스, **단일 저장소**(ROOKERY_REPO), 핸들러 전부 등록, 일일 보고,
  하트비트, SIGTERM 정리, 크래시 후 자동 복구.
- `tools/live_run0.py` — **다중 저장소** 배치 러너: 저장소별 원장,
  인테이크 테스트를 `*_head`에 커밋, 로컬 전용 PR(외부 저장소 푸시
  금지), 감사 정지 시 다음 저장소로.
- `tools/live_intake_scan.py`(1단: A/B/C 분류, 무인증 API),
  `tools/live_intake_verify.py`(2단: 실행 기반 수용, --mock).
- 엔진: 라우팅 v2, 인프라 오류 requeue, 커밋 위생, 브랜치 충돌 회피.

## 없는 것 (빌드 순서) — ① ② ③ 완료 (08-22), ④ 남음

1. **인테이크 파이프라인 한 명령** `tools/intake_pipeline.py`:
   scan → verify → 코퍼스 동결(`data/corpus_<date>.json`) → 저장소별
   원장에 enqueue. **멱등**: 이미 있는/성공한/소진된 과제는 건너뜀
   (task id = `live-<repo>_<issue>`; I3 소진 규칙과 합치). `--mock`
   경로 필수. 수용 기준: 목 2회 연속 실행에서 2회차 추가 0건.
2. **상주 서비스의 다중 저장소화**: `ServiceConfig.repos`(목록),
   저장소별 store/engine(live_run0의 run_repo를 서비스로 이식),
   외부 저장소 기본 LocalOnlyPr, 저장소별 감사 정지는 다른 저장소를
   막지 않음(이미 store 단위). 인테이크는 서비스의 주기 작업(예:
   일 1회)으로.
3. **운영자 표면**: 일일 보고에 저장소별 해결/지출/정지 집계, **채택
   브랜치 = PR 후보 큐**(커밋 메시지에서 PR 제목·본문 초안 자동 생성,
   compare 링크 포함 → 사람 검토 후 사장님 명의 제출 — 08-22의
   수동 절차를 도구로).
4. **무인 게이트**: 상주 파이프라인의 48시간 목 드라이런(지출 0) →
   일일 상한 하에 실 가동. 기존 unattended-ops-rules.md 절차 준용.

## 원칙 (변경 없음)

사전 등록 → 목 파일럿 → 실. 장부·출처는 프롬프트에 불주입. 외부
저장소에 자동 푸시 없음 — 채택은 언제나 사람 검토 큐에서 멈춘다.
지출은 GENESIS_SPEND + 예산 원장. 비용 단가는 운영자 입력값만.

## 예상 규모

1·3은 각각 반나절(대부분 기존 코드 재배치 + 목 테스트), 2는 하루,
4는 이틀(대기). 새 세션에서 1부터.
