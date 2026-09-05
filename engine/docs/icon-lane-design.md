<!-- provenance: {"source_id": "docs/icon-lane-design.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-25T22:44:13", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# 아이콘 레인 프롬프트 세트 v1

Proposer = 외부 LLM(교체 가능) · Validator = 우리 순수 함수 J · 2026-08-24
**상태(2026-08-26 08:56 갱신): ③ 후보 유지. 전 구간 실물 1회전 완료**(§9). 심판 J는 구현됨 — `genesis/icon_lane.py`(측정) + `tools/icon_judge.py`(§4 리포트) + 레지스트리 원자 `icon_spec_fit`. **Proposer(외부 LLM)는 미연결**(지출 게이트). 수요 1항은 여전히 미측정 → 출시 순서는 09-05 이후 재채점 (conversation-kit §0).

풍경·그림은 심판이 없어 범위 밖(④)이지만, **스펙으로 조인 아이콘**은 격자·팔레트·
패스 수·대비·왕복오차가 전부 기계 측정 가능 → ③ 후보로 승격. 즉 ④의 정확한 경계는
"이미지"가 아니라 "**주관적** 이미지"다.

---

## 0. 설계 결정 (프롬프트 이전)
| 결정 | 선택 | 이유 |
|---|---|---|
| 생성 매체 | SVG 코드 (래스터 아님) | 격자·팔레트·패스 수가 정확히 측정됨. 픽셀은 심판이 뭉툭 |
| Proposer | 코드 잘 쓰는 LLM 아무거나 | 교체 가능해야 함. 우리 자산은 심판뿐 |
| 심판 | 순수 함수 J(svg, spec) → {통과, 미통과, 미정의} | 모델 호출 아님. 계산 |
| 기준 노출 | 일부 비공개 | 굿하트 대응. hidden 항목은 프롬프트에 안 넣음 |
| 재시도 | 최대 3회, 그 뒤 미정의 | 무한 루프 방지 = 적격성 게이트 |

## 1. spec.yaml — 심판이 읽는 것 (프롬프트 아님)
```yaml
spec_id: icon-24-line-v1
public:                                    # 프롬프트에 넣는다
  viewBox: "0 0 24 24"
  grid:            { snap: 0.5 }
  stroke:          { width: 1.5, linecap: round, linejoin: round }
  fill:            none
  palette:         [currentColor]
  padding:         { min: 2 }
  path:            { max_count: 6, max_total_commands: 60 }
  allowed_elements: [svg, path, circle, rect, line, polyline, g]
  forbidden_elements: [text, image, filter, mask, style, script, defs]
  size:            { max_bytes: 2048 }
hidden:                                     # 심판만 안다. 프롬프트 주입 금지
  contrast:   { min_ratio: 4.5, against: ["#ffffff", "#0b0b0b"] }
  roundtrip:  { render_px: 96, max_pixel_diff: 0.02 }
  set_consistency:
    stroke_width_variance: 0
    optical_weight_delta_max: 0.15
  novelty:
    structure_hash: reject_duplicate
```
왜 hidden: 대비·왕복오차를 프롬프트에 적으면 모델이 그 지표만 겨냥. 숨김 테스트 +
다른 종류 계산으로 이중 판정 — 기존 감사자 구조 그대로.

## 2. 시스템 프롬프트 (Proposer)
```
너는 SVG 아이콘 생성기다. 설명하지 않는다. 협상하지 않는다.
출력 규칙:
- SVG 코드만 출력한다. 마크다운 코드펜스, 주석, 설명 문장 일절 금지.
- 후보를 N개 요구받으면 각 후보를 <!--CANDIDATE k--> 줄로만 구분한다.
- 스펙을 위반하는 출력은 폐기된다. 스펙과 심미성이 충돌하면 스펙이 이긴다.
- 좌표는 소수점 이하 한 자리까지만 쓴다.
- 색을 하드코딩하지 않는다. stroke="currentColor" 만 쓴다.
너는 기계 검증기에 제출하고 있다. 사람이 보고 봐주지 않는다.
```

## 3. 생성 프롬프트 (초회)
```
개념: {concept}
의미: {one_line_meaning}
세트 맥락: {set_name} 세트의 {i}번째. 기존 아이콘 스타일 참고:
{existing_svg_examples_up_to_3}
스펙 (전부 강제):
- viewBox="0 0 24 24" / 모든 좌표 0.5의 배수
- stroke-width="1.5", linecap/linejoin="round", fill="none", stroke="currentColor"
- 가장자리 최소 2 여백 / <path> 최대 6, 명령 최대 60
- 허용: svg,path,circle,rect,line,polyline,g / 금지: text,image,filter,mask,style,script,defs
- 2048바이트 이하
후보 {n}개를 서로 다른 구조로. 회전·반전은 다른 구조가 아니다.
```
호출: temperature 1.0 · n=6 · 1라운드 1호출.
(7A에서 6후보=무작위 120후보 수준. 초기 온도 안 낮춤 — 7D temp 0.3은 중복률 0.972로 붕괴)

## 4. 심판 리포트 포맷 (기계 출력 → 프롬프트 입력)
```
VERDICT: FAIL
candidate: 3
violations:
  - rule: grid.snap
    where: path[0] cmd 2
    got: "M 12.37 8.13"
    want: "0.5의 배수"
  - rule: path.max_count
    got: 8
    want: "<= 6"
passed:
  - stroke.width
  - palette
  - forbidden_elements
```
hidden 규칙 탈락 시 규칙명 비노출: `rule: internal_quality_gate` → 재생성엔 사유 대신
"구조를 바꿔 다시 만들어라"만.

## 5. 재생성 프롬프트 (2·3회차)
```
직전 출력이 기계 검증에서 탈락했다. 리포트:
{judge_report}
수정 규칙:
- violations에 적힌 것만 고쳐라. passed는 건드리지 마라.
- 형태 컨셉 유지, 좌표만 조정. 새로 디자인하지 마라.
- 다시 SVG 코드만.
```
예외 (hidden 탈락 또는 3회차): 사유 미제공 + "다른 구조로 다시, 후보 {n}개, SVG만",
temperature 1.3으로.

## 6. 실패·중복 처리 (프롬프트 밖, 코드)
```
round 1: temp 1.0, n=6            → 전부 FAIL
round 2: temp 1.0, n=6, violations 주입 (최소 수정)
round 3: temp 1.3, n=6, 사유 미제공 + 구조 변경 요구
round 4: 없음 → J = 미정의, 큐에 남김
```
중복 서명 거부: 구조 해시(요소 시퀀스 + 정규화 좌표) 충돌 시 프롬프트에 안 알리고
그 후보만 버리고 재생성. 서명을 프롬프트로 주면 회피가 아니라 모방 유도(7D 관측). 필터로만.

## 7. 상품 규칙 통과 여부
| 항목 | 상태 |
|---|---|
| 심판 있음 | ✅ 전부 결정론적 계산, 모델 호출 0 |
| 심판 지연 | ✅ 밀리초 |
| 오탐 비용 | ✅ 낮음 (버려지고 재생성) |
| 고객이 지금 아파함 | ❓ 미측정 |
| 판정이 고객 눈에 증거로 | ✅ 위반 리포트가 그대로 증거 |

3항 중 2항 통과, 수요 1항 미측정 → **③ 후보 유지. 09-05 이후 재채점.**

---

## 8. 구현 기록 (2026-08-25, 지출 0)

설계 §0~§6 중 **심판 쪽만** 지었다. 문서의 결정 그대로 "우리 자산은 심판뿐".

| 조각 | 상태 |
|---|---|
| `J(svg, spec)` 순수 함수 | ✅ `genesis/icon_lane.py` — 격자·획·팔레트·fill·여백·패스 수·명령 수·요소·바이트 |
| §4 위반 리포트 | ✅ `tools/icon_judge.py --svg / --set-dir` (필드 고정, 사람 말투 없음) |
| hidden 마스킹 | ✅ 위반이 hidden이면 `internal_quality_gate`로만 노출 |
| novelty(구조 해시 중복 거부) | ✅ 서식·공백 무시. **프롬프트에 주지 않고 필터로만** (§6) |
| set_consistency(획 굵기 통일) | ✅ 세트 단위 계산 |
| contrast / roundtrip | ❌ **미측정** — currentColor는 색 문맥이 있어야 대비가 나오고, 왕복오차는 래스터라이저(cairosvg 등)가 필요하다. 재는 척하지 않고 리포트에 미측정으로 남긴다 |
| optical_weight_delta | ❌ 미측정 (같은 이유) |
| Proposer 호출·재시도 루프(§3·§5·§6) | ❌ 미착수 — 지출 게이트(GENESIS_SPEND) |

**심판대 판정**: `icon_spec_fit`은 반례 11건을 전부 거절(teeth), 재료는
`measured.*`(svg_file 어댑터로 실제 측정) — 그림 계열 최초의 **자기신고 아닌**
원자다. 기존 `spec_fit_art_selection`(태그 자기신고)과 대비된다:
**④의 경계는 "이미지"가 아니라 "주관적 이미지"**라는 이 문서의 주장이
숫자로 확인됐다.

**정직한 한계**: 여백은 제어점 볼록껍질로 잡아 **보수적으로(작게)** 나온다 —
통과를 부풀리지 않는 방향이지만, 곡선이 실제보다 크게 잡힐 수 있다. 획 두께로
커지는 시각적 bbox는 세지 않는다(기하 여백만).

---

## 9. 실전 1회전 (2026-08-26 08:51~08:56, 지출 $0.054857)

§3·§5·§6의 루프를 `tools/icon_lane_run.py`로 붙여 **처음으로 후보를 만들어 봤다.**
생성(외부 LLM) → J 채점 → 위반 리포트 주입 재생성 → 통과분 저장이 실물로 돈다.

| 항목 | 결과 |
|---|---|
| 세트 | rpg-ui-v1 (save·inventory·map·settings) + 곡선 2건 |
| 첫 회전 | 25후보 중 15 통과 / 10 거절(격자 이탈 9·여백 부족 1) |
| 재시도 루프 | 탐침 스펙에서 r1 전탈락 → 리포트 주입 → r2 통과 확인 |
| 심판 강화 후 재실행 | 16후보 중 14 통과, 세트 4/4 |
| 호출 | 14회 / $0.054857 (원장 tool=icon_lane) |

**§8의 표가 하나 틀렸다**: "심판 J 구현됨"에 `stroke.linecap`·`stroke.linejoin`이
빠져 있었다. 스펙 §1은 요구했고 프롬프트에도 넣었는데 심판만 몰랐다. 실제 후보를
만들자 모델이 `linecap="round"`(존재하지 않는 속성)로 적어 냈고 **통과 도장이
찍혔다.** 규칙 2개·반례 4건을 추가해 막았다(반례 45 → 49).

**3값 정정**: `judge_svg`가 미정의(ok=None)를 fail로 접고 있었다. PASS/FAIL/
UNDEFINED로 나누고 리포트에 `undecided:` 절을 추가했다. 못 잰 규칙으로는
재생성을 시키지 않는다.

**루프 쪽 규율(코드가 강제)**:
- `_assert_no_hidden_leak()` — 프롬프트는 `public` 가지에서만 만들고, spec 문서의
  hidden 열쇠말이 하나라도 들어가면 생성 직전에 던진다.
- 중복 서명은 프롬프트에 알리지 않고 그 후보만 버린다(§6 그대로).
- 예산 소진은 탈락이 아니라 미정의(`BudgetExhausted` → UNDEFINED).
- 목(mock) 파일럿을 먼저 통과해야 실 호출로 간다(테스트 19건).

**남은 구멍**: contrast·roundtrip·optical_weight_delta 미측정(래스터라이저 필요),
"개념처럼 보이나"는 기계 심판 없음 — `tools/icon_preview.py`가 사람 눈 게이트다.
수요 1항은 여전히 미측정이므로 상품 순위는 ③ 그대로.
