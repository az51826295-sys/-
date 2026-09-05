<!-- provenance: {"source_id": "docs/rookery-architecture.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-22T19:51:29", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# Rookery 엔진 지도 — 스테이지 1 기준 (2026-08-22 작성)

연구 세계(미로·보드게임)의 지도는 docs/architecture.md. 이 문서는 그
연구에서 나온 제도를 제품으로 옮긴 **Rookery Alpha 엔진**의 지도다.
코드는 `genesis/rookery/`, 제도 원문은 docs/rookery-alpha-spec.md.

## 1. 한 일감의 일생

```
GitHub 이슈 ──스캔(A/B/C)──▶ 검증(헤드에서 재현 테스트 실패해야 수용) ──▶ 날짜 코퍼스
      │                                                                   │
  채팅 지시(재현 테스트 동봉) ────────────────────────────────────────────▶ enqueue
  채팅 지시(테스트 없음) ──▶ 인박스 ──(파이프라인이 유도·검증)──▶             │
                                                                          ▼
                                            저장소별 원장  data/<tag>/<repo>/engine.db
                                                                          │ claim(임대)
                                                                          ▼
   격리 워크트리(rookery/live-<repo>_<n>) ◀─ 엔진(저장소별 1개) ─▶ 예산 원장 reserve→settle
            │ 에이전트 루프(12스텝: read/edit/write/run_tests/done)
            ▼
   검증기: 재현 fail→pass + 스모크 ─▶ 감사 I1~I6(다른 불변식) ─▶ 커밋 위생(스크래치 청소)
            │ 채택                                     │ 불일치 → 내구 정지(사람만 해제)
            ▼
   로컬 브랜치 + pr_ready(pushed=false) ─▶ PR 후보 큐(초안·푸시 명령·compare 링크)
            ▼
   사람 검토 → 사장님 명의 제출 → mark submitted/--fixup → Goodhart(G-a/G-b/G-c)
```

엔진은 남의 저장소에 푸시하지 않는다. 지출은 예산 원장을 통해서만,
정지는 사람만 푼다. 경험(결말·가격)은 선택(라우팅)에만 쓰고 프롬프트에는
넣지 않는다.

## 2. 조각과 책임 (`genesis/rookery/engine/`)

| 조각 | 책임 | 핵심 불변식 |
|---|---|---|
| `store.py` | 과제·런·예약·이벤트·플래그의 SQLite 원장, 임대 기반 크래시 복구 | `add_task`는 멱등(INSERT OR IGNORE); 인프라 오류는 `requeue`(시도 보존) |
| `budget.py` | 예약→정산 원장, 월/일/과제 상한, 초과 검토(과제 범위) | 호출 전 예약 없이는 지출 없음 |
| `safety.py` | 허용목록 명령·git 하위명령·비밀 경로·배포·셸 메타문자 차단 | 거부는 로그되는 결정, 조용한 생략 없음 |
| `isolation.py` | 과제당 워크트리·브랜치, `resolve()` 컨테인먼트, 점유 브랜치 회피(`-2`) | `.git` 밖·작업공간 밖 경로 거부 |
| `auditor.py` | 검증기의 답을 **다른 불변식**으로 역검증(I1 전후, I2 참조, I3 소진, I4 전부0, I5 천장·누출, I6 신규 파일) | 불일치 → 내구 정지 |
| `agentic.py` | 에이전트 루프(도구·스텝 상한·인자 검증·절단 관측), 라우팅 v2(기대 비용/해결), 결말 기록(usd 포함), 커밋 위생 | 도구는 전부 Workspace 경유, 테스트 파일 수정 금지 |
| `agent_tools.py` | 도구 v2(줄 범위 읽기·검색·디렉터리) — 연결 대기 | 읽기 전용, resolve 경유 |
| `worker.py` | 게이트 순서(정지→예산→임대→격리→계획→핸들러→검증→감사→채택/롤백), 인프라 백오프 | 크래시 경로 = 임대 만료 경로 |
| `handlers*.py` | 종류별 핸들러(fix/doc/test_add/data/art/agent_fix) + `classify_pytest` | 채택은 언제나 validator+auditor |
| `prqueue.py` | 채택 → PR 후보(브랜치·커밋·파일·초안·compare), 상태 추적, 저장소별 집계 | 초안은 사실만 자동 채움 |
| `pr.py` | `PrPreparer`(push-only)·`LocalOnlyPrPreparer`(외부 저장소: 푸시 없음) | 자동 PR 없음 |
| `report.py` | 일일 보고(미리보기·확정) | 하루 1회 확정 |
| `service.py`/`config.py` | 상주 서비스(단일/다중 저장소), 주기 인테이크, 목 모드, 유휴 종료, 자진 종료 | 저장소별 엔진 독립(정지·예산 격리) |
| `spent.py`(rookery/) | 소진 레지스트리(v3a·b4·ablation·보고; 합성 id는 synthetic) | I3의 원천 |
| `chat.py`(rookery/) | 루키 대화 창구: 읽기 스냅샷 + 쓰기 경로(재현 테스트 게이트·사장님 확인) | 모델에 등록 권한 없음 |
| `inbox.py`(rookery/) | 테스트 없는 지시의 인박스 → 파이프라인 후보 변환·결말 기록 | 연결 대기 |

## 3. 도구 (`tools/`)

| 도구 | 역할 |
|---|---|
| `intake_pipeline.py` | 스캔→검증→동결→enqueue 한 명령, 멱등(레지스트리 `data/intake_seen.json`) |
| `live_run0.py` | 다중 저장소 배치 러너(원장별 drain), `--seed` |
| `pr_queue.py` | PR 후보 큐 list/mark/summary |
| `goodhart.py` | G-a/G-b/G-c + 14일 이동평균 알람 |
| `ops.py` | status / resume --by / clear-backoff |
| `stage1_dryrun48.cmd`·`_launch.vbs`·`_judge.py` | 48h 목 드라이런 런처·판정 |
| `extract_ledger_seed.py` | 실측 결말(usd) → v2 시드 |
| `stamp_provenance.py` | 출처 헤더(derived/normative) |

## 4. 데이터 배치 (`data/`)

`<tag>/<repo>/engine.db`(원장), `repos/<repo>_head`(헤드 워크트리; 채택
브랜치 `rookery/live-*`), `corpus_<날짜>.json`, `intake_seen.json`,
`chat_inbox.json`, `pr_queue/`·`pr_queue_state.json`, `goodhart/`,
`rookery.log`. 전부 로컬 — 고객 저장소 경계는 docs/rookery-security-boundary-design.md.

## 5. 제도 문서 색인

rookery-alpha-spec(제도 원문) · provenance-contract(출처) ·
unattended-ops-rules(무인 운영) · routing-v2-design(라우팅) ·
goodhart-metric-design(계측) · agent-tools-v2-design(도구) ·
rookery-stage1-infra-design(인프라 빌드 순서) · stage1-dryrun48(게이트) ·
rookery-ops-runbook(운영) · rookery-monetization-memo(돈) ·
ledger-retest-live / capability-run* (실험 기록).
