<!-- provenance: {"source_id": "docs/provenance-contract.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-08T13:20:17", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# 출처 계약 v0.1 (스키마 동결안 — 코드 아님)

> 1개월차 1주차 산출물. 골든 케이스 전부 통과 전에는 실제 로그·
> 문서에 붙이지 않는다 (2주차). 필드 추가는 개정 절차 없이 금지.

## 1. 헤더 7필드 (모든 원로그·파생 문서)

| # | 필드 | 정의 |
|---|---|---|
| 1 | `source_id` | 전역 고유 식별자. 파생물이 근거를 가리킬 때 쓰는 유일한 이름 |
| 2 | `source_kind` | `raw`(원로그), `derived`(파생), `normative`(규범 — v0.1 추가, §5). 이 구분이 as_of 의미를 가른다 |
| 3 | `parent_ids` | 파생의 부모 `source_id` 목록. `raw`는 빈 목록 |
| 4 | `parent_hash` | 승격·생성 시점에 본 부모 내용의 해시. `raw`는 없음 |
| 5 | `as_of` | **이원화**: `raw` = 마지막 이벤트 시각 / `derived` = 부모를 마지막으로 확인한 시점. 생성 시각이 아니다 |
| 6 | `generator` | 사람 / 스크립트 경로 / 모델. 자동 생성물의 재현 경로 확인용 |
| 7 | `status` | `fresh` / `stale` / `unknown` — 아래 계약이 기계 판정 |

## 2. 승격 레코드 8필드 (원로그 → 문서로 오르는 주장 단위)

| # | 필드 | 정의 |
|---|---|---|
| 1 | `claim_id` | 주장 고유 식별자 |
| 2 | `text` | 주장 문안 (수치 포함) |
| 3 | `source_id` | 근거 원로그의 `source_id` |
| 4 | `source_locator` | 원로그 안의 위치 (파일·행·쿼리·이벤트 id) |
| 5 | `parent_hash` | 승격 시점의 원로그 해시 |
| 6 | `promoted_at` | 승격 시각 |
| 7 | `verifier` | 재계산 수단 (스크립트 경로 / 수동 / 없음) |
| 8 | `status` | `fresh` / `stale` / `unknown` |

## 3. 계약 8항

1. **헤더 없는 문서는 `unknown`이다.** 예외 없음.
2. **as_of 이원화.** 원로그의 as_of는 마지막 이벤트 시각, 파생의
   as_of는 부모 확인 시점. 두 의미를 섞어 쓰는 문서는 위반.
3. **부모 해시가 현재 부모와 다르면 `stale`.** stale은 삭제가
   아니라 표시 + 재확인 대상이다.
4. **`unknown`은 어떤 집계에도 넣지 않는다.** 단, unknown률
   자체는 상시 산출한다 (자기감시).
5. **요약본은 원로그를 대체하지 못한다.** 원로그가 열리지 않으면
   그 트랙은 시작하지 않는다 — 요약본으로 억지 착수 금지.
6. **stale률·unknown률은 계측기 자기감시 1급 지표다.** 조용히
   오르면 알람 대상.
7. **스키마 동결.** 필드 추가·의미 변경은 이 문서 개정 + 골든
   케이스 갱신을 먼저 통과해야 한다.
8. **출처 레코드·상태 장부는 제안기 프롬프트에 주입하지 않는다.**
   P36·P38·P39b에서 세 번 기각된 것은 *탐색 프롬프트에의 이력
   주입*이다. 이 장부는 운영 상태(확정 사실·차단 목록·롤백
   대상)이지 제안기 컨텍스트가 아니다. 이 경계가 흐려지면 4개월차
   무인 운영에서 기각된 기억 기능이 뒷문으로 들어온다.

## 4. 골든 케이스 (손으로 작성 — 코드보다 먼저)

픽스처: [tests/fixtures/provenance/](../tests/fixtures/provenance/)
— `cases.json`(입력)과 `expected.json`(정답)을 사람이 먼저 썼다.
2주차 코드는 이 정답을 재현해야 실제 로그에 붙는다.

| 케이스 | 입력 | 기대 판정 |
|---|---|---|
| G1 | 파생, parent_hash == 현재 부모 해시 | `fresh`, 집계 포함 |
| G2 | 파생, 부모가 승격 후 수정됨 (해시 불일치) | `stale`, 집계 포함하되 stale 표시, 재확인 큐 |
| G3 | 헤더 자체가 없는 문서 | `unknown`, 집계 제외, unknown률에 계수 |
| G4 | 원로그, as_of ≠ 마지막 이벤트 시각 | 계약 2항 위반 → `unknown` 강등 |
| G5 | 승격 레코드, verifier 없음 | 유효하되 `verifier: none` 표시 유지 (confidence 유도는 장부 v0 범위 — 여기서 안 함) |

| G6 | 규범 문서, 부모 없음, 헤더 유효 | `fresh`, stale 분모 **제외**(부모가 없어 낡을 수 없다), unknown 아님 |
| G7 | 규범 문서인데 `parent_ids`가 비어 있지 않음 | 계약 1항 위반 → `unknown` (규범은 파생이 아니다 — 파생이면 `derived`로 써라) |

집계 규칙 요약: 분모 = fresh + stale (unknown·normative 제외),
stale률 = stale / (fresh + stale), unknown률 = unknown / 전체(normative 포함),
normative 수는 별도 산출.

## 5. 제3 source_kind `normative` (v0.1 개정, 2026-08-22)

**왜**: 설계서·규칙·계약·절차 문서는 원로그에서 파생되지 않는다. v0에는
`raw`/`derived`뿐이라 이런 문서는 헤더를 가질 수 없었고, 계약 1항에 따라
전부 `unknown`으로 계수돼 unknown률(자기감시 1급 지표)을 규범 문서 수만큼
부풀렸다 (08-22 스캔: 문서 42건 중 unknown 38, 그중 규범 28). 지표가
"헤더 없는 파생 문서"만 가리키게 하려면 규범을 따로 이름 붙여야 한다.

**정의**: `normative` = 사람이 쓴 규범(설계·규칙·계약·절차·사전 등록).
주장의 근거가 원로그가 아니라 결정이다. 결과·수치를 담으면 그 문서는
규범이 아니라 파생이다 — 섞였으면 `derived`로 부모를 대라.

**필드 의미**: `parent_ids` = `[]`, `parent_hash` = `{}` (없음 — 비어 있지
않으면 G7 위반), `as_of` = **마지막 개정 시각**(문서 자체의 시각; 생성
시각이 아니다), `generator` = 사람 또는 스탬프 도구 경로, `status` =
기계 판정(유효 헤더면 `fresh`).

**판정·집계**: 유효 헤더 → `fresh`이되 stale 분모에서 제외(부모가 없어
낡을 수 없다). unknown률의 전체에는 포함(헤더가 있으므로 unknown이
아니다 — 이것이 개정의 목적). 규범 수는 별도 산출한다.

**적용**: `python tools/stamp_provenance.py --normative docs/x.md`
(as_of = 그 문서의 마지막 git 커밋 시각, 없으면 지금).

---

## 6. 원로그 목록의 구멍 (2026-08-26 발견·수정)

계약은 "부모를 확인한다"고 말하지만, 확인할 **목록**(`RAW_PATTERNS`)이 우리가
실제로 인용하는 기록을 안 담고 있었다. 그래서 이런 일이 벌어졌다:

```
docs/icon-golden-v1-brief.md   부모: data/goldens/icon-v1.result.json  → "없음"
docs/taste-judge-image-v0-design.md  부모: data/picks/pixellab-v1.json → "없음"
```

**두 파일 다 디스크에 있다.** 목록이 `*.jsonl`·`*_report.json` 같은 이름 규칙만
훑고 `data/goldens/`·`data/picks/` 밑의 판정 기록을 안 봤을 뿐이다. 결과적으로
출처가 제대로 적힌 문서가 `unknown`으로 강등됐다 — **계기판이 거짓 경보를 냈다.**

### 수정 (동결)

이름 규칙에 더해 **판정 기록 디렉터리**를 통째로 원로그로 본다:

```
RAW_DIRS = ["goldens", "picks", "observed"]   # data/ 밑
```

이 셋을 고른 기준은 취향이 아니다 — **문서가 인용하는 기록이 사는 곳**이다
(골든 표본·결과, 선별 기록, observed 통제 등록부). 여기 파일들은 판정의 근거이고,
근거를 못 찾는 계기판은 계기판이 아니다.

`data/repos/`처럼 큰 디렉터리는 넣지 않는다(클론된 저장소이고 인용 대상이 아니다).
목록을 넓히는 것은 손으로 하고, 이 문서에 이유를 적는다.
