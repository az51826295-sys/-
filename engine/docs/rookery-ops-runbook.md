<!-- provenance: {"source_id": "docs/rookery-ops-runbook.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-22T19:16:58", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# Rookery 운영 런북 — 스테이지 1 상주 파이프라인 (2026-08-22 작성)

④ 48h 목 드라이런 통과 후 **실 가동**할 때 사람이 따르는 절차. 엔진은
남의 저장소에 푸시하지 않고, 정지는 스스로 풀지 않으며, 지출은 원장을
통해서만 한다 — 사람의 일은 검토·제출·정지 해제·예산 결정이다.

## 0. 지도

| 무엇 | 어디 |
|---|---|
| 저장소별 원장 | `data/<TAG>/<repo>/engine.db` (과제·예약·이벤트·플래그) |
| 헤드 체크아웃(엔진이 고치는 코드) | `data/repos/<repo>_head` (git worktree), 채택 브랜치 `rookery/live-<repo>_<issue>` |
| 서비스 로그 | `data/rookery.log` (회전), 콘솔 `data/stage1_*_console.log` |
| 인테이크 레지스트리 | `data/intake_seen.json` (검증한 이슈 — 재검증·재지출 방지) |
| 날짜 코퍼스 | `data/corpus_<YYYYMMDD>.json` |
| PR 후보 큐·상태 | `data/pr_queue/queue.md`, `data/pr_queue_state.json` |
| Goodhart 이력 | `data/goodhart/history.jsonl`, `latest.json` |
| 계정 키 | `C:\Users\az518\Desktop\ai-workforce\.env.local` (`ANTHROPIC_API_KEY`) |

## 1. 시작 (실 가동)

1. 사전 조건: 크레딧 잔액(`console.anthropic.com/settings/billing`), 헤드
   체크아웃 7개 존재, `git pull`로 HEAD 최신.
2. 환경 — `tools/stage1_dryrun48.cmd`를 복사해 실 가동용으로 고친다:
   `ROOKERY_MOCK=0`, `ROOKERY_INTAKE_MOCK=0`(B형 유도에 Haiku 1회 호출),
   `ROOKERY_TAG=live_auto`, `GENESIS_SPEND=i-approve`,
   `ROOKERY_DAILY_KRW`/`ROOKERY_TASK_KRW`는 **운영자 결정**(재검증 실측:
   fast 12스텝 ≈ $0.17, smart 12스텝 ≈ $1.0~1.1; 과제 2시도면 task 2,400원
   이상, smart 2시도까지 담으려면 3,600원). `ROOKERY_STOP_AFTER_S=0`
   (신호까지 상주) 또는 일 단위 배치면 86400.
3. 검증만: `python -m genesis.rookery.engine.service --check` (환경 변수 세팅
   후). 문제 목록이 비어야 한다.
4. 무창 실행: `wscript tools\stage1_dryrun_launch.vbs` 대신 실 가동용
   cmd를 가리키는 vbs를 하나 더 만들어 쓴다(콘솔 창을 만들지 않는 이유:
   드라이런 2차 부검 — 창이 닫히며 CONTROL_C_EXIT 사망).
5. 첫 5분: `data/rookery.log`에 "워커 N개 시작", 저장소별 heartbeat,
   "인테이크 실행 rc=0"이 찍히는지. 시작 시각을 progress.md에 기록·커밋.

Linux 서버면 `deploy/README.md` + `deploy/rookery-alpha.env.example`의
"Stage 1: multi-repo residency" 절.

## 2. 일일 루틴 (10분)

```
python tools/ops.py status --tags live_auto          # 큐·정지·백오프·지출
python tools/pr_queue.py list --tags live_auto       # 새 채택 후보
python tools/goodhart.py --tags live_auto            # G-a/G-b/G-c + 알람
```

1. **정지가 있으면 먼저** (§3). 정지 저장소는 큐가 멈춰 있고 나머지는 돈다.
2. **PR 후보** — `data/pr_queue/queue.md`의 `[new]` 항목마다:
   - 헤드 저장소에서 브랜치 diff를 읽는다: `git -C data/repos/<repo>_head
     show <branch>`. 판단 기준: 이슈가 진짜 버그/요청인가, 변경이 범위 안인가,
     산출물에 스크래치·마커·디버그 흔적이 없는가.
   - 제출하기로 하면: `python tools/pr_prepare.py <task> --tags live_auto` —
     깨끗한 `origin/master`(marshmallow는 `dev`) 위 브랜치 `rookery-pr/<repo>-<n>`에
     체리픽(사장님 명의·트레일러) + 재현 테스트를 회귀 테스트 **초안**으로 해당
     테스트 파일 끝에 추가 + 전체 스위트(doctest) 실행까지 자동(실측 9초). 사람은
     패치 읽기·초안 다듬기(import 합치기)·커밋 제목/본문 →
     커밋 저자 `az518 <az51826295@gmail.com>` + 트레일러
     `Co-Authored-By: Rookery Alpha (AI agent, human-reviewed)` → 큐의 push
     명령(포크 `fork` 원격) → compare 링크(제목·본문 자동 채움; Summary는
     사람이 채움) → GitHub에서 **사람이** Create pull request.
   - 기록: `python tools/pr_queue.py mark <task> submitted <PR URL>`
     — 채택 **코드**를 고쳤으면 `--fixup`(테스트·본문 추가는 손질 아님).
     제출하지 않기로 하면 `mark <task> dismissed`.
3. **Goodhart** 출력에 `ALARM:`이 있으면 그날 안건으로 등록(문턱 조정 아님,
   감사 불변식 추가 검토 — docs/goodhart-metric-design.md).
4. 며칠에 한 번: 열린 PR의 메인테이너 반응 확인(goodhart가 G-b로 읽는다;
   리뷰 코멘트 대응은 사람 검토 후 사장님 명의).

## 3. 정지 해제 (사람만)

```
python tools/ops.py status --tags live_auto                  # 사유 읽기
python tools/ops.py resume --tag live_auto --repo <repo> --by <이름>
```

- **감사 정지**(`auditor_halt`): 원장 events의 `audit_disagree`/`engine_halt`
  와 해당 과제의 `agent_response`를 읽고 원인을 분류한다 — (a) 환경(헤드
  체크아웃 깨짐, 의존성) → 고치고 해제, (b) 계측기(분류기·추정기) →
  부검·수리·목 테스트 후 해제, (c) 에이전트 파손은 I4 게이트로 정지를
  내지 않는 것이 정상 — 났다면 (b)로 본다. 해제는 `--by`에 이름을 남긴다.
- **격리 정지**(`isolation_halt`): 작업공간 밖 경로 접근 시도. 해제 전 그
  과제는 `failed`로 남았는지, 헤드 체크아웃이 무사한지(`git status`) 확인.
- **인프라 백오프**(`infra_backoff_until`): 30분 뒤 자동 해제. 크레딧 소진
  이면 충전 후 `ops.py clear-backoff`로 즉시 재개(requeue된 과제는 시도를
  잃지 않았다).

## 4. 예산

- 게이트: `GENESIS_SPEND=i-approve` 없으면 호출 자체가 안 된다.
- 원장 상한: daily/task는 저장소(원장)별로 센다. 월 상한·정지선도 원장별.
- 크레딧 소진은 HTTP 400 "credit balance is too low" → 인프라로 분류돼
  requeue+백오프 (08-22 부검). 잔액은 콘솔에서만 보인다 — 런 전 확인.
- 지출 집계: `python tools/pr_queue.py summary --tags live_auto`(저장소별
  usd), 재검증 실측 단가는 docs/ledger-retest-live.md.

## 5. 하지 말 것

- 외부 저장소에 자동 푸시·자동 PR. (엔진에 경로가 없다 — 만들지 말 것.)
- 정지를 코드로 풀기, 플래그 DB 직접 편집.
- 원장·출처 레코드를 프롬프트에 넣기 (출처 계약 8항).
- 실험 중 설정·프롬프트 변경 (사전 등록·동결 원칙; 개입 = 시도 종료).
- 단가 추측: `MODELS`의 단가는 문서 확인값만.

## 6. 드라이런·소크 판정

- 48h 목 드라이런: `python tools/stage1_dryrun_judge.py` (기준 동결:
  docs/stage1-dryrun48.md). 통과 → 이 런북으로 실 가동, 미달 → 부검·수리·
  재주행.
- 7일 무인 소크(다른 시스템, rookery-dryrun): CLAUDE.md "시작" 절차.
