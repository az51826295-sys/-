# Progress

## Completed

- [x] Project scaffold (pyproject, package layout, config)
- [x] Core Pydantic models (Position, Entity, AgentState, Observation,
      Action, ActionResult, Prediction, Experience, EpisodeSummary)
- [x] Genesis World: deterministic solvable map generation, movement,
      turning, key/door, button, goal, energy, max steps, text rendering
- [x] Observation limited to Manhattan distance 2, deep-copied
- [x] SQLite ExperienceStore (save / get_by_episode / get_recent / count)
- [x] NaiveWorldModel: rule-based predictions + per-state-key success-rate
      statistics with growing confidence
- [x] Prediction error metric (weighted success/reward/position/terminal)
- [x] RandomAgent with pick-up/open/press priorities
- [x] AgentLoop: observe -> predict -> act -> compare -> store -> update
- [x] `python -m genesis.main` with `--episodes`, `--seed`, `--verbose`
- [x] Test suite
- [x] **World model rehydration** (Next Task 1): `ExperienceStore.iter_all()`
      + `NaiveWorldModel.rehydrate()`; main replays every stored experience
      on startup, so learning persists across process runs
- [x] **GreedyAgent** (Next Task 2): observation-only goal seeker — builds
      an internal map from what it has seen, BFS-plans key -> button ->
      door -> goal, explores frontiers when information is missing.
      Solves **20/20 random seeds** (22-66 steps, always positive reward).
      `python -m genesis.main --agent greedy`
- [x] Per-episode prediction error trend printed after multi-episode runs
      (start of Next Task 5)
- [x] **Curiosity scoring** (Next Task 1 of session 3): world model now
      tracks mean prediction error per state key; `CuriosityScorer`
      (novelty + historical error) + `CuriousAgent` picks the available
      action the model is least sure about. Coverage check vs random over
      3 seeds: 36/28/31 distinct state keys vs 29/28/20.
      `python -m genesis.main --agent curious`
- [x] **Experience similarity retrieval** (Next Task 1 of session 4):
      `SimilarityWorldModel` (new default; `--model naive` reverts)
      predicts from the top-k most similar past experiences with graded,
      state-aware features. Verified: open/closed doors and
      pressed/unpressed buttons no longer share statistics (the naive
      model provably cannot separate them), and curiosity decays with
      distance from where experiences were actually made.
- [x] **Learning report** (session 5): per-episode metrics persisted to an
      `episodes` table (run id, agent, model, seed, outcome, error);
      `python -m genesis.main --report` prints per-run aggregates, an
      ASCII error chart, and an earlier-vs-recent trend verdict.
- [x] **AdaptiveAgent** (session 5): greedy planning + curiosity probes
      (energy-reserved) + curious fallback. Fresh-model sweep: 40/40
      episodes solved; second visit to the same map took fewer or equal
      steps on 16/20 seeds. `python -m genesis.main --agent adaptive`
- [x] **Bucketed similarity retrieval** (session 5): records bucketed by
      (action type, front kind) — lossless per the similarity invariant;
      predict now scans one bucket instead of every record.
- [x] **Advanced difficulty** (session 6): chained keys/doors, patrolling
      hazards, slippery movement (`--difficulty advanced`). Greedy solves
      20/20 advanced seeds (after fixing its held-key targeting bug for
      chains); prediction error restored from ~0.000 to ~0.107.
- [x] **Model snapshotting** (session 6): models serialize to
      `model_snapshots`; startup loads the snapshot and replays only
      experiences newer than its rowid watermark.
- [x] **Per-agent trends** in the learning report (session 6).
- [x] **Similarity weight experiment** (session 6): variants measured,
      all equivalent — weights kept, conclusion recorded in decisions #16.
- [x] **Generalized entry costs** (session 8): the adaptive planner
      prices every cell as 1/(experienced MOVE success rate toward that
      kind of cell), evidence-gated and capped — closed doors price in
      their real overhead, slips price in retries. Verified: a taught
      agent routes around a door when an open detour is cheaper.
- [x] **Outcome metrics** (session 8): hazard hits tracked per episode
      (loop -> summary -> episodes table); the report now shows
      per-difficulty solve rate, average reward, and hits/step as
      first-class signals.
- [x] **Long-horizon study** (session 8): 100 advanced episodes, one
      persistent model, varying maps — see Findings below.
- [x] **Relative hazard geometry** (session 7): features carry the
      nearest hazard's offset and heading; geometry gates similarity
      multiplicatively. Unit-verified hit anticipation; aggregate error
      is already at the slip-noise floor (decisions #18).
- [x] **Per-difficulty trends** (session 7): the report now splits trends
      by difficulty — basic/advanced/gauntlet each show *improving*;
      the old overall "worsening" verdict was difficulty mix.
- [x] **Scenario files** (session 7): `--scenario scenarios/x.json` loads
      any GenesisConfig; unknown keys fail loudly. Shipped `gauntlet`
      (12x12, 3 chained doors, 3 hazards — greedy and adaptive both
      solve 10/10) and `slippery` (30% slip).
- [x] **Model-informed planning** (session 6): hazard avoidance learned
      from experience — `hazard_near` feature, patrol-line path costs
      priced by `hazard_context_reward()`, and learned probe caution.
      Fresh agents walk straight through danger; experienced ones detour.
      Measured: ep1 18/20 -> ep2 20/20 solved, hazard hits -30%.
      Advanced hazards now cost 15 energy / -1.0 reward per hit (the old
      5 / -0.25 economy made avoidance genuinely not worth a detour).

## In Progress

- **임무세계 모드 (게임 설계 협업 실험)**: M0~M5 구현 완료 (2026-07-30).
  - 검토 확정 반영: traits 4개 축소, 재미 대리 지표 4종(고민 결정 비율·
    리드 교체·결정 시점·역전율) 정식 편입, GRID 전용, 투표 λ 제거
    (반사실 보고로 대체) — decisions #19.
  - `python -m genesis.mission --arm C --seed 42` 완주: 제안 43개,
    최종 objective 0.765, 개선도 +0.161.
  - 2수 탐색 지표는 11.1배 비용 실측 → 기본 비활성.
  - M6 본실험 완료 — 결과는 아래 Findings 참조. **사전 예측 미충족**
    (C는 B를 이기지 못했고 A가 최강). 부정적 결과를 사전 등록대로 기록.
- **자유문명 트랙 (Stage 1)**: 설계서([stage1-design.md](stage1-design.md))는
  장기 구조로 유지, 구현은 보류. 부분 골격은 `genesis/society/`에 WIP
  커밋으로 보존 (config, models, world grid — 미완성, 테스트 없음).

## Tests

- `pytest`: **97 passed** (environment 15, actions 8, memory 6,
  world model 7, similarity model 11, agent loop 3, greedy agent 3,
  curiosity 4, adaptive agent 5, report 9, advanced world 7,
  snapshot 4, model-informed planning 11, scenarios 4 — run 2026-07-30,
  Python 3.12.10, pydantic 2.13.4, pytest 9.1.1)
- Advanced 4-episode trajectory: solve 16/20 -> 20/20 -> 20/20 -> 20/20;
  average prediction error flat at ~0.09 = the slip-noise floor
- Gauntlet scenario: greedy 10/10, adaptive 10/10
- `python -m genesis.main --episodes 3 --seed 42 --agent greedy`:
  3/3 SUCCESS (goal_reached), rehydration count grows across runs
- `python -m genesis.main` (random agent default): still runs clean

## Decisions

See [decisions.md](decisions.md). Highlights:

- PICK_UP acts on the agent's cell or the cell directly in front.
- OPEN/USE both open the door ahead if the matching key is held; key not consumed.
- Button gives a one-time +0.5 reward.
- Observation radius: Manhattan distance 2.
- Maps are guaranteed solvable via BFS check at generation time.

## Git

- Repository on `main` with repo-local identity
  (`az518 <az51826295@gmail.com>`); the MVP is committed in small
  per-feature commits (scaffold, world, store, world model, agent loop,
  tests, docs).

## Findings: long-horizon study (2026-07-30)

100 advanced episodes, one SimilarityWorldModel, world seed = episode
index (different map every episode), 10-episode windows:

- Solve rate stayed high and stable: 96/100 overall.
- Hazard hits/step showed **no downward trend** (0.024 -> oscillating
  0.019-0.034): hazard-geometry anticipation does not transfer across
  maps at this feature granularity.
- Average prediction error **rose** with accumulation (0.109 in the
  first window -> 0.15-0.19 later). Diagnosis: retrieval increasingly
  overrides the rules with statistics pooled across many different
  maps, and a position (x, y) means something different on every map —
  cross-world contamination, the coarse-statistics bleed reappearing at
  scale. **Naive experience accumulation degrades prediction; the model
  needs features that identify world context (or recency weighting /
  per-map partitions) before more experience helps.**
- Throughput: 0.56s/episode at 5.3k records — bucketed retrieval holds.

## Mission World Series 1 — 동결 (2026-07-30)

실험 1~5는 하나의 완결된 연구 단위로 동결되었다. 논문형 통합 보고서:
**[mission-world-series1.md](mission-world-series1.md)** (초록, 방법론
규약, 실험별 결과, **판정식 오류·설계 실패 이력 표**, 통합 결론,
재현 패키지, 실험별 커밋). 태그: `mission-world-v1`.

중심 주장: *다중 에이전트 협력의 성능은 상호작용량이나 중앙화 여부
자체가 아니라, 과제의 정보 의존성·공유 선택 지능·실수 복구 여유에
의해 결정된다. 효과적인 선택 지능은 중앙 코디네이터 없이 분산
프로토콜로 재현할 수 있지만, 현재의 에이전트들은 그 프로토콜을 스스로
발견하지 못했다.*

시리즈 2(실험 6, 프로토콜 발견)는 브랜치
`experiment/mission6-protocol-discovery`에서 진행한다.

## In Progress: 실험 6 — 프로토콜 발견 (2026-07-30)

사전 등록: [mission6-design.md](mission6-design.md). 구현 완료:

- **DSL + 안전 검증기** (`genesis/mission6/dsl.py`): 화이트리스트 지표
  9종 × 행동 4종, 조건 최대 2, 규칙 상한 8. 시조 프로토콜은
  `ALWAYS → SHARE_BEST` 하나 (C와 동일 행동). I2/하강 문턱 개념은
  어디에도 없음. 제안은 무작위 규칙 연산만 (실패 요약은 기록만 —
  성능 신호는 선택 단계에서만 작용).
- **고정 실행기** (`executor.py`): 발언 사이클 의미론, MAX_PASSES=6
  초과 시 강제 공유(로그). J군용 개체별 프로토콜 지원. 사이클당
  local_best 캐시 (동작 동일, 속도만).
- **진화 루프 + 4개 채택 제도** (`evolution.py`): J(개별 스왑인 개선),
  K(소표본 다수결, 롤백 없음 — 실험 1 투표 경고의 제도 변인),
  M(블라인드 평가 + protocol_score + 롤백), L(전담 설계자, 탐색 상한).
  λ = (0.02, 0.20, 0.005) 동결. seed: 훈련 2001-2020 / 검증 2101-2120 /
  시험 3001-3040, 훈련 slack {1.0,1.25,1.5} + 미관측 {0.9,2.0}.
- **계보 저장·감사** (`lineage.py`): 전 후보의 제안자/연산/점수/채택
  기록, 버전 사슬·유효성·M 단조성 자동 감사.
- **시험 평가 + P20-P27 판정** (`report6.py`): 기준선 C/E/I2/시조.
- 테스트 15개 (전체 스위트 178 passed).

**파일럿 (3세대, 축소 seed) 통과**: 4개 군 모두 규칙 생성·채택·
롤백 작동, 계보 감사 위반 0 (`data/mission6_pilot_log.txt`).
하이퍼파라미터 동결 후 본실험(20세대) 실행 시작 — 결과는 완료 후
Findings에 기록 예정.

**설계 오류 이력 (P10·P16 계열, 은폐하지 않고 기록)**: 1차 본실험의
실행기 rng가 `(instance, protocol.version)`으로 키돼 있어, 채택 시
버전 승격만으로 셔플 난수열이 재추첨됐다. 증상: J 세대 16에서 짝지은
비교로는 개선인 후보가 채택 직후 재키잉된 난수로 0.537→0.414 하락.
제도의 성질이 아니라 실행기 인공물. 수정: rng를 인스턴스 seed에만
키잉 — 프로토콜 점수가 버전과 무관한 결정론적 값이 되고 모든 비교가
짝지어짐. 1차 M 결과는 `data/mission6_M_*_rngv1.*`로 보존 (참고:
수정 전에도 M은 약공유 억제 규칙을 발견, 검증 acc 0.967). 전 군
재실행.

## 통합 결론 (2026-07-30, 실험 1+2 확정 문구)

> Genesis의 초기 실험은 다중 AI 협업의 성과가 개체 수나 상호작용량이
> 아니라 **과제의 정보 의존성과 공유 선택 지능의 구조적 배치**에 의해
> 결정된다는 것을 보여줬다. 협력은 본질적으로 우월한 방식이 아니다 —
> 과제에 상호 의존성이 존재할 때만 가치가 생기며, 그 가치가 성과로
> 전환되는 정도는 정보 선택 구조가 결정한다. 중앙이 모든 정보를 아는
> 것이 중요한 게 아니라, **분산된 로컬 평가를 전역적으로 비교할 수 있는
> 선택 계층**이 중요하다.

**투표 경고 (독립 항목으로 보존)**: 실험 1에서 개체 선호 집계(투표)를
반영했다면 20 중 18 seed에서 더 나쁜 최종안이 선택됐을 것이다. 선호
집계는 품질 평가를 대체하지 못하며, 합의 증가와 품질 저하는 동시에
나타날 수 있다. Rookery의 의사결정은 제안 생성 / 품질 검증 / 최종
선택의 3층 분리를 전제로 설계할 것 — 제안자 투표에 최종 선택을 맡기지
않는다.

## Findings: 임무세계 본실험 (2026-07-30)

**공식 해석 (판정 노이즈 반영 확정 문구)**: 관측 평균은 A > B > C였으나
평가 노이즈(σ=0.055)가 군간 차이보다 커서 성능 순위를 확정적으로 주장할
수 없다. 다만 **협력 행동이 역할 분화나 측정 가능한 개선으로 이어지지
않았다**는 결과는 노이즈와 무관하게 유지된다.

프로토콜: 20 seed × [A 단일, B 독립+선발, C 상호작용, 클론 대조 C,
개체 2 제거 C], 군당 예산 120행동 동일, 판정은 사전 등록된 objective만.
원자료: `data/mission.db`, `data/mission_report.json`.

- **1차 (사전 예측 미충족)**: 최종안 objective 중앙값 A 0.814 >
  B 0.794 > C 0.781. C≥B는 9/20 (예측선 13/20). A≥C 15/20.
  **상호작용 구조는 이 과제에서 가치를 만들지 못했고, 단일 개체가
  최강이었다** — 사전 등록의 반증 분기 그대로 기록한다.
- **2차**: 개선도(최종−1라운드 최고)도 A 0.227 ≫ B 0.109 ≈ C 0.108.
- **3차 (역할 분화 없음)**: C군 행동 분포 JSD 0.054 < 클론 대조군
  95분위 0.098 — traits 메아리 범위조차 넘지 못함. 맥락 반응성은
  0.158로 존재(개체가 보드 상태에 반응은 함)하나 성과로 이어지지 않음.
- **정보 전파는 기계적으로 작동**: run당 타인 제안 수정 19.9회,
  비판→수정 링크 8.1회, 타인 시뮬 재활용 7.6회. 채널은 돌았지만
  최종 품질로 변환되지 않았다.
- **강건성**: 개체 2 제거 시 점수 하락 중앙값 0.000 — 시스템이 개체에
  의존하지 않지만, 그것은 개체들이 사실상 교환 가능했기 때문.
- **투표 반사실**: 주관 투표를 반영했다면 18/20 seed에서 다른(대개 더
  나쁜) 최종안이 선택됐을 것 — 주관 합의는 객관 최적과 크게 어긋남.
- **메커니즘 (로그 분석)**: 후보 생성량은 군간 비슷(46~54개/run) —
  "C가 후보에 예산을 덜 썼다" 가설 기각. 차이는 **수정 계보의 깊이**:
  A의 최종안은 평균 2.4단(최대 6단) 정제 사슬의 산물, C는 1.6단(최대
  3단). 단일 개체는 일관된 주관 함수로 한 계보에 집중하고, C는 개체별
  주관이 어긋나 수정이 여러 제안에 흩어진다.
- **지형 진단**: 유효 무작위 스펙이 이미 ~0.7+, 상한 ~0.85의 얕은
  지형. 탐색이 쉬운 과제에서는 협업이 이길 공간 자체가 없다. 집단
  구조의 가치는 단일 언덕오르기가 멈추는 난이도에서만 증명될 수 있다.
- **한계 → 정량화 완료 (사후 정정)**: 최종안 32개를 judge seed 5종으로
  재판정한 결과 **판정 노이즈 σ 평균 0.055** (중앙값 0.041, 최대 0.35).
  즉 군간 중앙값 격차(0.02~0.03)는 노이즈 범위 안이며, 개별 seed의
  점수 차로는 아무것도 주장할 수 없다. 유지되는 것은 부호 일관성뿐
  (A≥C 15/20). 실험 1의 결론은 "C가 우월하지 않았다"까지가 정직한
  상한이고, "A가 우월하다"는 약한 증거다.

## Findings: 실험 2 — 분산 단서 추리 (2026-07-30)

프로토콜: [mission2-design.md](mission2-design.md) 사전 등록 그대로.
20 seed × 4군, 공유 예산 = 전체 단서의 60%, 판정은 전수 CSP (노이즈 0).
원자료: `data/mission2_report.json`.

- **사전 등록 5항목 전부 통과.** V1: A(전체 정보) 20/20 해결.
  V2: B(소통 없음) 평균 0.014 — 과제가 진짜로 협력을 요구함이 구성으로
  확인됨. P1: C > B 20/20.
- **핵심 결과 (P2)**: 자유 소통 C가 평균 0.917, 유일해 도달 17/20으로
  **천장(A) 근접**. 인간 설계 순번제 D는 평균 0.434, 도달 5/20.
  **C ≥ D가 20/20** — 희소 예산에서 로컬 정보 이득 선택이 눈먼 절차를
  압도했다.
- **메커니즘**: 커버리지는 두 군이 동일(0.584 — 예산 고정의 산물).
  낭비율은 오히려 C가 높다(0.220 vs 0.169). 차이는 공유량도 중복
  회피도 아니고 **어떤 단서를 보드에 올리느냐의 가치 밀도**다. C는
  중앙값 8회 공유로 유일해에 도달(D는 도달한 5개 seed에서 10회).
- **실험 1과 합친 결론**: 협력의 가치는 과제 구조에 조건부다.
  정보가 공유된 얕은 지형(실험 1) → 협력 무가치, 단일 개체 우세.
  정보가 분산되고 채널이 희소(실험 2) → 협력 필수, 자유 소통이
  천장 근접. **Genesis/Rookery 함의: 다중 개체 구조는 정보가 실제로
  분산된 곳에만 세워라.**
- **정직한 한계 2건**: (1) D의 순번제는 의도적으로 눈먼 기준선이다 —
  → E군 추가로 해소, 아래 참조. (2) C의 로컬 휴리스틱(탐욕 정보 이득)도
  우리가 준 능력이다 — 자유로운 것은 선택이지 능력이 아니다 (실험 1의
  traits 메아리 주의와 같은 계열의 유보).

### E군 추가 — "똑똑한 D" (2026-07-30, 사용자 지시, P4·P5 사전 등록 후)

E = 설계 절차 + 지능: 매 공유마다 각 개체가 자기 최선 단서의 정보
이득 수치만 보고하고 코디네이터가 전체 최선을 채택 (사적 단서 비공개,
로컬 계산 + 조정 규칙만).

- **E 평균 1.000, 유일해 도달 20/20, 중앙값 6회 공유** (C 8회, D 10회).
  P4 (E≥D) 20/20, P5 (E≥C) 20/20 — 둘 다 예측대로 충족.
- **최종 서열: 눈먼 절차 D (0.434) < 자유 소통 C (0.917) < 지능형 절차
  E (1.000)**. 협업 성능을 가르는 것은 "설계했느냐"가 아니라 **선택
  지능이 어디에 있고 얼마나 좋은가**다. C의 실패 3 seed는 분산 선택의
  순서 무작위성에서 왔고, 중앙화가 그것을 제거했다.
- ~~낭비율 지표 주의~~ → **평가기 v2로 해소** (사용자 지시): 정답 확정
  시 실험 종료, top-3 기여 집중도 추가. v2 재실행: C 18/20 (0.056 낭비),
  D 5/20 (0.148), E 20/20 (**낭비 0.000, 커버리지 0.334** — 전체 단서의
  1/3로 전부 해결). 사전 등록 항목 전부 유지 통과 (P2는 19/20).
- **C 실패 seed 법의학 (v2 기준 2건)**: seed 13 — 후보 4개 남김, 대안
  순서 20/30 회복 → 순서 운 실패. seed 14 — 후보 2개 남김, 대안 순서
  **8/30만 회복** → 순서를 바꿔도 대부분 실패하는 **근시안 고착**: 로컬
  탐욕이 조합적으로만 가치 있는 단서를 체계적으로 미룬다. 실험 3의 P8
  (단기 이득 vs 장기 가치 충돌)이 현행 과제에서 이미 관측된 셈.
- **사용자 질문에 대한 최종 답**: "자유 사회 협업 vs 인간 설계 협업" —
  이 과제에서는 잘 설계된 지능형 절차가 자유 소통을 이긴다 (1.000 vs
  0.917). 단, 자유 소통도 천장의 92%에 도달하며 눈먼 절차보다 2배
  이상 낫다. Rookery 함의: 코디네이터(매니저)가 있는 팀 구조가
  방임보다 낫지만, 방임 + 좋은 로컬 판단도 크게 뒤지지 않는다.

## Findings: 실험 3 — 선택 지능의 붕괴 조건 (2026-07-30)

프로토콜: [mission3-design.md](mission3-design.md) 사전 등록. 20 seed ×
3 난이도 × 10 변형. 원자료: `data/mission3_report.json`.

판정: **P6 충족** (E 최고, easy·medium 20/20) / **P7 충족**(단 medium은
전 σ에서 1.000으로 자명 — 중복 단서가 노이즈를 흡수, 실질 신호는
easy·hard의 F1.0 하락 0.825/0.805) / **P8 미충족** / **P9 미충족** /
**P10 방향 유효·판정식 오설계** / **P11 조건부 취약**.

- **헤드라인 1 — 중앙 선택은 무작위 노이즈에 강건하고 전략적 왜곡에
  취약하다.** F0.2는 사실상 무손실(0.967~1.000), F1.0도 0.8대 유지.
  반면 G(절반 과장·절반 축소)는 0.470~0.792로 강한 노이즈보다 나쁘다.
  무작위 오류는 단계마다 상쇄되지만, 편향은 발언권 배분을 체계적으로
  오염시킨다 — 조직의 자기 과시가 정보 선택을 망가뜨리는 구조의 재현.
- **헤드라인 2 — P8은 실패했지만 그 대가로 진짜 변수를 발견했다.**
  단서 종류 조작으로는 근시안 함정이 안 만들어졌다 (E는 hard에서도
  20/20 — 한계 이득은 매 단계 재계산되므로 개별 가치가 낮아도 탐욕이
  통함). 대신 분산 협력 C의 성패를 결정한 것은 **여유율 = 공유 예산 /
  필수(critical) 단서 수**였다: easy 1.51→C 0.713, hard 2.42→0.879,
  medium 2.61→0.925 (단조). 협력 구조의 가치·취약성 모두 자원이
  빠듯할수록 커진다.
- **헤드라인 3 — 학습형 분산(I)은 아직 조정 기능을 재발명하지 못했다.**
  학습 곡선은 실재(easy 0.21→0.67, medium 0.42→0.85)하나 hard는
  평평(0.35→0.37), 시험 성능은 전 난이도에서 C 미달 (hard 강한 추월
  1/20). (kind, attr) 특징 수준의 가치 일반화로는 인스턴스 맥락을 볼
  수 없다는 한계. 다음 후보: 보드 상태 조건부 학습, 또는 학습된 보고를
  중앙이 결합하는 혼성 구조.
- **헤드라인 4 — 평판 투표 H는 최악권(0.41~0.73).** 평판이 후행
  지표라 초기 운이 발언권을 고착시킨다(부익부 스피커 락). P10 판정식
  (엄격 부등호 ≥18/20)은 동률 1.0 처리를 잘못 설계해 수치상 미충족 —
  방향(H 평균 ≪ E 평균)은 전 난이도에서 유효. 판정식 오설계로 정직
  기록.
- **P11 — E-decap**: 코디네이터 제거 하락폭이 easy 0.175, hard 0.157로
  (E−C)/2를 초과 → **여유율이 낮은 조건에서 E는 강력하지만 취약한
  중앙 시스템**. medium은 하락 0.000으로 견고. 취약성도 조건부다.
- 사용자 핵심 질문에 대한 현재 답: E의 성능은 중앙화 자체가 아니라
  **정확한 가치 평가 + 전역 비교**의 합작이다 (노이즈 σ0.2까지는 중앙화가
  거의 모든 것을 보상). 분산 사회의 자체 대체는 이번 학습기로는 실패 —
  단, 학습 곡선의 존재는 경로 자체가 막혀 있지 않음을 시사한다.

## Findings: 실험 4 — 여유율 인과 검증 (2026-07-30)

프로토콜: [mission4-design.md](mission4-design.md) 사전 등록. 과제 고정
(medium, 20 seed), 예산 = slack × **인스턴스별 최소 증명 집합**(정확
계산, 평균 6.3), slack 0.75~4.0 8격자 × 5군. 원자료:
`data/mission4_report.json`.

- **사전 등록 P11~P15 전부 충족.** 여유율은 우연한 상관이 아니라
  통제 변수로 재검증된 인과 후보다.
  - P11: C 정확도 여유율 단조 비감소 (위반 0).
  - P12: E−C 격차 저여유율 0.409 → 고여유율 0.000.
  - P13: 코디네이터 제거 피해 저 0.170 → 고 0.000.
  - P14: 전략 왜곡 G 피해 ≥ 노이즈 F 피해 (7/8 격자), 여유율로 완충
    (0.284 → 0.000).
  - P15: C의 90% 임계 여유율 = **2.0** (등록 범위 1.5~3.5 내).
- **운영 결론 (통신 절약 배율)**: E는 여유율 1.25에서 90% 도달, C는
  2.0 필요 — **중앙 정보 선택은 같은 결과에 필요한 통신 자원을 1.6배
  절약**한다. E는 여유율 1.0(이론적 최소 통신량)에서도 15/20 해결.
- **심층 가설 확정 — 여유율 = 실수 복구 공간.** C는 **모든 여유율에서
  20/20 run이 비최적 공유를 저지른다** (로컬 탐욕의 실수율은 상수).
  변하는 것은 복구율뿐: slack 0.75에서 5% → 1.5에서 70% → 2.5에서
  100%. 확정 실패 시점도 여유율과 함께 뒤로 밀린다(4→9→소멸).
  **"C는 선택이 멍청해서가 아니라, 낮은 여유율에서 작은 로컬 실수가
  비가역이 되기 때문에 실패한다"** — 사용자 가설 그대로 입증.
- 부수 관찰: "불가능 구간" slack 0.75에서도 E는 5/20 해결 — 최선
  개체의 사적 단서가 보드를 보완하기 때문. 바닥은 0이 아니다.
- **연구 스토리 완성형**: 협력은 분산 정보가 있을 때 필요하다(실험 2)
  → 협력 성능은 공유 선택 지능이 결정한다(실험 2·3) → 그 선택 지능의
  가치는 자원 여유가 적을수록 커지고, 그 이유는 실수의 비가역성이다
  (실험 4) → 다음: 분산 사회가 이 선택 지능을 스스로 학습할 수 있는가
  (실험 5, I-v2: 보드 상태·남은 예산·현재 여유율·복구 가능성을 상태로
  보는 학습기 + "즉시 이득 + 선택권 보존 가치").

## Findings: 실험 5 — I-v2 학습형 분산 조정 (2026-07-30)

프로토콜: [mission5-design.md](mission5-design.md) 사전 등록. 하강 문턱
양보 프로토콜(분산 argmax 근사) + 공개 관찰 경험 통계. 고정 slack
{1.25, 1.5, 2.0} × 20 seed. 원자료: `data/mission5_report.json`.

- **P17 충족 — 격차 100% 봉합**: I2는 학습 여부와 무관하게 **전 slack에서
  E와 정확도 동률** (1.25에서 0.950/18도달, 이하 만점). P18 충족.
- **P16 미충족 — 그러나 판정식 오설계 (실험 3 P10과 동일 계열)**: 엄격
  부등호 기준인데 C가 1.0으로 동률인 seed가 많아 구조적으로 13/20 불가.
  실질 주장(I2 ≥ C 전 seed, 평균 +0.193)은 성립. **반복 교훈: 동률
  처리를 사전 등록에 명시할 것.**
- **P19 — 이 실험의 핵심 판정**: 프로토콜 기여 +0.193/+0.133/0.000,
  **학습 기여 0.000/0.000/0.000**. 사전 등록 규칙에 따라 **"사회가
  조정을 학습으로 획득했다"는 주장은 불허**된다. 성과는 전부 (실험자가
  설계한) 양보 프로토콜의 공이다. 조정 충실도는 학습으로 실제 개선
  (0.84 → 0.97)되지만 성과로 전환되지 않음 — 여유율이 차이를 흡수.
- **탐색 분석 (사전 등록 외, slack 1.0)**: 이론적 최소 예산에서도
  미학습 I2가 0.875/16도달로 E(0.850/15)를 근소하게 앞서고, 학습
  순기여는 여전히 0 (승1 패1). 충실도 0.84→0.98 개선도 성과 무전환.
- **확정 결론**: 중앙 코디네이터의 기능은 **단순한 사회적 프로토콜
  (문턱 양보 + 공개 관찰)만으로 완전히 분산 재현 가능**하다. 다만 그
  프로토콜은 설계로 주어졌고 경험 학습이 만든 것이 아니다. 남는 열린
  질문: **개체들이 프로토콜 자체를 발견할 수 있는가** — 파라미터
  튜닝이 아니라 프로토콜 공간의 탐색 문제이며, LLM 연결(장기 계획)이
  처음으로 실질적 역할을 가질 수 있는 지점.

## Findings: 실험 6 — 프로토콜 발견 (2026-07-30, 본실험 1차)

프로토콜: [mission6-design.md](mission6-design.md) 사전 등록 그대로.
20세대 × 4군, 시험 seed 40 × slack 5종. 원자료:
`data/mission6_*_lineage.json`, `data/mission6_report.json`.
외부 논의용 브리프: [mission6-results-brief.md](mission6-results-brief.md).

- **헤드라인 — M(블라인드 평가 채택)은 사전 등록 4중 성공 기준을
  전부 충족**: 시조에 없던 규칙 생성·채택 (P22), 제거 시 −0.332
  (P23), 미관측 seed +0.216 vs C (P24), 미관측 slack 유지·slack 0.9
  에서 I2와 동률 (P25). 시험 정확도 0.951 — C(0.735)→I2(0.987)
  격차의 86% 봉합.
- **발견된 프로토콜 (2규칙)**: `IF my_best_gain < 0.3 THEN 양보,
  ELSE 공유`. 7버전 계보: 양보 규칙 등장(세대 1) → 문턱 강화
  0.1→0.5(세대 5) → 시조 규칙 삭제(세대 8) → 잉여 가지치기(세대 9)
  → 문턱 미세조정 0.3(세대 10) → 10세대 안정. 기능적으로 I2 계열
  (약공유율 0.018, 충실도 0.727 vs I2 0.686) — P26 예측 그림.
- **P20 미충족 (정직 기록)**: J(개별 정책만)는 검증 개선(0.617→
  0.729)이 시험으로 전이되지 않아 C(0.735)에 미달(0.623). 개별
  선택압은 발언 시점의 역할 분화(후발 발언자·관망자 등)를 만들었지만
  훈련 분포 과적합.
- **K(다수결)의 병리 — 실험 1 투표 경고의 제도 수준 재현**: 세대 1에
  사실상 교착 규칙 채택, 세대 2에 **투표가 시조의 공유 규칙을 삭제**
  → 자발적 공유 없는 사회로 고착(시험 0.703, 전부 강제 공유 의존).
  3개 소표본 평가의 노이즈가 품질 신호를 압도. → "규칙을 검증·보존
  하는 메타제도" 연구 질문이 실측으로 구체화.
- **L(전담 설계자)의 정지**: 무작위 제안 체제에서 설계자의 난수열이
  유효 규칙을 못 뽑으면 탐색이 멈춘다(세대 2 이후 18연속 롤백) —
  발견은 제안 분포가 상한. M의 세대 1 행운도 같은 동전의 앞면.
  LLM 제안자(의미를 이해한 제안)가 다음 실험의 자연스러운 변인.
- **실행기 rng 오설계 수정 이력**: 1차 실행은 프로토콜 버전이 rng
  시드에 들어가 채택 시 점수가 재추첨되는 인공물 존재(J의 채택 직후
  하락으로 발견). 인스턴스 seed 단독 키잉으로 수정 후 전 군 재실행.
  1차 결과는 `*_rngv1`로 보존 — 수정 전에도 M은 같은 계열 규칙을
  발견(문턱 0.5, 검증 0.967), 결론의 난수열 비의존성 방증.
- **재발견 (3회 중 2회)**: master-seed 1의 독립 진화는 다른 문법
  (시조 규칙에 조건 추가: `gain ≥ 0.3이면 공유`)으로 **같은 문턱값
  0.3**에 재수렴 (검증 0.939). master-seed 2는 K·L과 같은 교착
  끌개(전면 억제, 0.669)에 고착 — 전면 억제는 전면 공유보다 나은
  국소 최적이라 제도가 보존만 하고 탈출시키지 못함.
- **절제 실험**: 규칙 개별 제거가 두 실패 끌개를 정확히 재현 (양보
  제거 → 0.620 = 시조 수준, 공유 제거 → 0.703 = 교착 수준) — 두
  규칙 모두 인과 필수. 조건값 재추첨 −0.147 (문턱 0.3은 튜닝된
  가치). 재시작 안정성: 5세대 재진화에도 퇴행 없음 (0.8844→0.8944).
- **가장 중요한 통제 결과 — 무학습 무작위 탐색이 M과 동급** (동일
  평가 예산: 검증 0.8853 vs M 0.8844, 시험 0.971 vs 0.951). 이 DSL
  공간에서 계보적 진화 절차의 고유 기여는 0 — 성과의 원천은 표현
  공간 + **블라인드 검증 제도**다. "사회적 진화" 서사는 약화되지만
  "검증 제도가 본질"이라는 시리즈 주장은 강화됨. 다음 실험 후보:
  (1) 무작위 탐색이 실패할 만큼 큰 표현 공간에서 재검증, (2) 교착
  끌개 탈출 메커니즘, (3) LLM 제안자 (의미 기반 제안, 유출 통제
  사전 등록 필요).

## Findings: 실험 7A — 의미 있는 프로토콜 제안 (2026-07-31)

프로토콜: [mission7-design.md](mission7-design.md) 사전 등록. 브리프:
[mission7-results-brief.md](mission7-results-brief.md). 모델 Haiku 4.5,
총 ~$1.8. 원자료 `data/mission7_*`.

- **P28 충족 (3/3)**: 실패 관측을 받은 LLM-T는 무작위(120후보)의
  최종치에 **후보 6개(5%)** 로 도달 — 전 seed 세대 1.
- **P29 충족 + Z의 진단**: T 6 = S 6 ≪ Z 94. 결과 정보 없는 LLM은
  무작위보다 나빴다 — 효과의 원천은 사전지식이 아니라 **관측-제안-
  검증 폐쇄 루프**.
- **S ms1이 I2의 하강 문턱 기능을 재발명** (전원 무발언 시 조건 완화
  규칙, 검증 0.967 > 무작위 최종 0.939). 무작위 진화는 60세대 동안 못
  찾은 구조.
- **교착 탈출 3/3 vs R 0/3** (세대 1·4·14): 교착 규칙을 상위 우선순위
  조건부 공유로 무력화 — 스모크 테스트의 우선순위 실수가 피드백 후
  교정된 폐쇄 루프 실증. **P30은 문자상 미충족** (등록 기준 0.85를
  절대 점수로 잘못 설정, 전 런 0.745 고원 — P10·P16 계열 3번째
  판정식 오류로 기록).
- **P31 충족**: T 최종(= `gain ≥ 0.3` 조건부 공유, 실험 6 발견과 동일)
  시험 0.951 (+0.216 vs C); 탈출 프로토콜 0.907 (+0.172).
- **동결 감사 (2026-07-31)**: 0.745 고원의 원인은 다양성 부족도 검증
  과적합도 아니라 **제안 연산 편향** — 문턱 인하 후보는 최대 92%
  비율로 생성·평가됐고 정직하게 열등 판정(0.7297<0.7447), 교착 규칙
  **삭제 제안은 246후보 중 0개** (add 96%/mutate 4%/remove 0%).
  중복 제안률 0.81~0.94 (T-Memory/P36의 표적). P30 보조 판정(상대
  개선 정의): 3/3 충족. 비용 확정 $2.47.
- 남은 관찰 과제: T=S 천장(궤적 정보의 한계 효용은 7B에서 분리),
  타 모델 반복.
- **다음 단계 (사용자 제안서 2026-07-31 접수)**: A. 7A 동결·감사(완료)
  → B. 공통 인터페이스 분리(**완료** — `genesis/loop/`: 계약·레지스트리·
  재개 가능 러너, mission6 동등성 테스트로 검증) → C. 7B 확장 DSL
  (**구현 완료** — 모드·역할·연쇄·사회 지표 + 절제 플래그, 공간 실측
  342,280→69,058,800(200배), R/Z/S/T/T-Memory 제안자, 목 파일럿 통과.
  사전 등록 초안 [mission7b-design.md](mission7b-design.md) — 끌개
  구성·파일럿 후 동결 예정) → D. Rookery Minimum 골격(다음 작업).
  Mission 8 (평가 제도 자기수정)은 명시적 후순위.

## Findings: 실험 7B — 확장 공간에서의 의미 기반 제안 (2026-08-01)

등록: [mission7b-design.md](mission7b-design.md) (동결본). 브리프:
[mission7b-results-brief.md](mission7b-results-brief.md). 40런 완주,
비용 $7.71 (시리즈 누적 ≈ $10.2).

- **P32·P33·P34 충족**: 공간 200배 확장에서 무작위 붕괴 (중앙 0.608,
  114후보) vs LLM 전 계층·전 seed 0.887~0.899 (6후보). 성공률 100%
  vs 0%. 교착 탈출 **T·TM 10/10 vs R 0/5** (상대 정의 — 7A P30 교훈
  적용, 검증 +0.20~0.38·시험 +0.20~0.31).
- **Z의 반전**: 작은 공간(7A)에선 Z<R, 큰 공간(7B)에선 Z(0.887)≫
  R(0.608) — 공간이 클수록 사전지식의 가치 증가. 관측 계층(0.8985)
  과의 간격은 전 seed 일관.
- **P35 미충족 (동률 재현)**: 시조 출발 천장에서 T=S. 궤적의 가치는
  탈출 과제에서만 분리 가능 — 두 실험 연속 확인.
- **P36 미충족 (가설 실패, 원인 진단됨)**: TM은 중복률을 못 줄였고
  (0.787→0.832) remove 0 유지. 원인: 이력 블록이 연산:점수 요약만
  담고 **과거 후보의 규칙 내용을 안 담아** 구조적 중복 회피가
  원리적으로 불가능했음 — 프롬프트 정보 설계 실패로 기록. 그럼에도
  TM 탈출 5회 중 2회 고원 돌파(0.850·0.886, T는 0/5) — 점수 궤적만
  으로도 무언가 바뀜, 메커니즘 미해명 (계보 부검 가능, 후보 전문
  보존됨).
- 운영: 절전·소켓·크레딧 소진 3종 사고 전부 레지스트리 재개로 무손실
  복구. 병렬 한계 노트북 4레인.
- **부검 → 7C 패딩 통제 (2026-08-01)**: 부검은 "TM의 이력(점수 궤적)
  이 제안 분포를 실패 패턴 밖으로 이동시켰다"고 해석했으나, 사전
  등록된 패딩 통제(TP = T + 동일 길이 무의미 산문)가 이를 **기각**
  — TP가 전 지표에서 TM쪽으로 이동했고 돌파도 4/5 (TM 2/5, T 0/5).
  P38a 0/3, P38b 위반. 새 해석(사후): 프롬프트 말미 블록의 **주의
  희석** — 집계·궤적 블록이 예산-조건 제안을 앵커링했고, 뒤에 어떤
  블록이든 붙으면 앵커가 풀림. **방법론 경고: LLM 루프의 "기억이
  돕는다" 주장은 패딩 통제 없이 성립 불가.**
- **7D 3원 비교 (2026-08-02)**: P39a 충족 — 온도 0.3은 다양성 붕괴
  (중복 97%, 돌파 0/5). P39b 2번째 기각 — 서명-이력도 중복을 못 줄임
  (0.870 > TP 0.783). P39c — TS(2/5) < TP(4/5): **이력 내용은 점수든
  서명이든 모방 압력으로 작동, 무의미 패딩만 못함.** 종합: 이 모델
  규모에서 제안 측에 필요한 건 정보가 아니라 자유도 — 선택은 제도가
  전담. (단일 모델·n=5 한정; 더 큰 모델의 이력 활용은 7E 후보.)
## Findings: Rookery 실험 1 — 코드 수정 A/B (2026-08-02, 1차)

등록: [rookery-exp1-design.md](rookery-exp1-design.md) (동결본).
원자료 `data/rookery1_*`. 비용 $0.03 (64호출).

- **천장 효과로 분별력 0 — R4 정직 조항 발동.** 양군 모두 16/16
  숨김 통과 (잠복형 3문제 포함), 대부분 1~2호출에 해결 — Haiku가
  이 난이도(단일 함수, 국소 버그)를 원샷으로 푼다. R1 동률(1.00),
  R2 동률(0.00), R3 판정 불가(첫 실패 표본 없음).
- 파이프라인 자체는 완전 작동 (정적 검사·격리 실행·중복 제거·회귀
  감지·champion 선택 — 목 파일럿과 본실험 양쪽 확인).
- **R4에 따라 후속 등록**: 난이도 축 상향 — 코퍼스 v2 (다중 함수
  모듈·상호작용 버그·상태 공유·사양 모서리, 목표 원샷 해결율
  30~60%). 제도의 가치는 모델이 한 번에 못 푸는 지점부터 나타난다는
  것이 6~7 시리즈 전체의 교훈과 일치 (작은 공간 → 무작위도 충분,
  쉬운 버그 → 단일 에이전트도 충분).

- 다음 후보: ① 코퍼스 v2 (R4 후속), ② 7E — Sonnet TP vs TS (후순위
  레인), ③ P37 추가 축 탐색 분석.

## Findings: 7C·7D 감사 + 두 레인 (2026-08-02, 2차)

- **감사**: 7C·7D 비교는 유효 (버전 0 해시 30런 동일, 예산 동일,
  임계값 0.80은 TP·TS·T-cold 실행 전 동결 — 단 T·TM 관측 후 등록,
  (0.7915, 0.8488) 전 구간 판정 불변 확인). 분포 지표 계산 코드
  부재 → `report7cd.py`로 복구, 브리프 2.6·2.7 전 셀 재현 통과
  (공표 중복률은 무효 제외 정의였음을 명문화).
- **Rookery §6.12 (부정 증거 레지스트리 제거)**: BS vs BSN 15런 —
  전 지표 실질 동등 (재방문률 0.157→0.187, 고유 파일·정답 파일·
  검증 통과율 동일, 공개+스모크 3→2건). **레지스트리가 탐색 공간을
  열었다는 증거 없음; §6.11 효과는 가설 단계 구조 귀속.** 재방문은
  전부 심볼-부재 계열이라 선택 단계 검증이 자동 제거 — 차단 장치가
  실제로 막은 것 없음. 등록 나무에 유의성 문턱 부재는 설계 결함으로
  기록 (§6.13).
- **7D-2 온도 게이트 (P40)**: 실행 불가 — Anthropic API 온도 상한
  1.0 (400 거부, 무과금·무데이터). 디코릴레이션 강화 방향 표집
  조작이 이 API에 없음. 대체 조작 선택은 보류 (5.7 기록).
- **preflight 절차 신설** (`genesis/preflight.py`): 등록 동결 전
  키·게이트·API 파라미터 실호출·워크트리 기계 검증 — P40 사고
  재발 방지, §6.14에 첫 적용.
- **Rookery §6.14 (Impact Analysis, B-IA vs B-pad)**: 1차 지표
  4개 전부 최소 효과 크기 미달 → 등록 분기 "동등 — selector-측
  IA 이월" 발동. 과제별 사전 예측 3개 전부 빗나감; 특히 불변
  예측한 running_minmax에서 유일한 full 2건 (유효 IA가 동결 정답
  함수를 정확 지목 — IA의 위치 필드+AST 게이트가 2차 위치 검증으로
  작동, 등록 분류가 좁았음을 기록). §6.15. 사용자 확정: full 2건
  판정 불반영, "IA=위치 재검증"은 사후 가설로만 보존.
- **Rookery §6.16 (selector-측 IA, B-public vs B-selector-IA)**:
  판정 유보 — 효과 크기가 아니라 **표적 사건 부재**: "공개+스모크
  통과 ∧ 실제 회귀" 후보가 30런에서 0건, selector가 선택을 바꾼
  사례 0건. 구조적 발견: 스모크 통합(6.6) 이후 이 코퍼스의 회귀
  후보는 공개 재현에서 이미 전부 실패 — t24 병목은 selector가
  아니라 proposer. selector-측 IA 재검정에는 "공개 통과 ∧ 광역
  회귀" 후보가 실존하는 과제 채굴이 선행돼야 함. §6.17. 다음 갈래
  후보: ① 그런 과제 채굴 후 §6.16 재검정, ② 사후 가설 "IA=위치
  재검증" 검정 (§6.16 종료로 해금), ③ 코퍼스 v2 (R4 후속).
- **Rookery §6.18 (위치 재검증, B-IA vs B-pad × 반복 10)**:
  **가설 확증 실패** — 유일 발동 지표(함수 적중률 0.577 vs 0.774)
  가 반대 방향(B-pad 우위, isotime 주도). running_minmax 지지 조건
  미발동. §6.14 회고와 방향 역전 — 문턱 미달 차이는 재현 안 된다는
  직접 실증, §6.15의 판정 불반영 원칙 정당화. 양군 full 3/30 동일
  (무의미 패딩으로도 full 발생). IA proposer 개입은 위치·품질 양쪽
  에서 편익 입증 실패로 종결. §6.19. 남은 갈래: 과제 채굴 (위치-
  난제형 + public-pass/hidden-fail형) = 계측기 제작이 선행 과제.
- **원칙 (사용자 확정 2026-08-02)**: "현재 단계에서 과제 채굴은
  데이터 준비가 아니라 **계측기 제작**이다. 특정 기제의 표적
  사건이 존재하지 않는 코퍼스에서는 그 기제의 효과를 기각할 수
  없다."
- **코퍼스 v2 채굴 완료 (2026-08-02, §8.1·8.2)**: 6저장소 스캔,
  79건 검증, 적격 31건. **B군(selector-사건형) 4/4 확보** —
  dateutil f42ee4c1·more-itertools be5793a5/e0ee0c0f·marshmallow
  99a2e482, 전부 부분-수정 미끼 기계 실증. **A군(위치-난제형)
  0/4 — 코퍼스 부족 기록**: 보정 파일럿(25호출)에서 5후보 전원
  파일 적중 5/5 천장 — 소형 저장소+의심 3개 예산이면 파일
  커버리지 포화, 파일-수준 위치 난제는 이 규모에서 성립 안 함.
  게이트: 새 A/B 본실험 등록 불가 유지 (A 미충족). B군 4과제로
  §6.16 재검정은 가능 — 등록은 사용자 지시 대기.
- **계측기 정지 사례 (§8.3 준비 중)**: 과제 자체검증이 사건 정의의
  거짓 양성을 적발(판별 테스트가 정답 커밋에서도 실패) → B군
  4/4→3/4 정정, 본실험 중단. 사용자 결정: 코퍼스를 늘리지 않고
  3과제×7반복으로 축소 재등록. **"실험은 코퍼스가 아니라 계측기에
  의해 중단되었다 … 성능 향상보다 계측 타당성을 우선한 사례이다."**
  목 파일럿이 이름 충돌 함정 2건을 추가 적발(클래스 중복 dunder).
- **Rookery §8.3 재검정 결과 (2026-08-02, §8.4)**: 표적 사건이
  실제 생성됨(0→20런) — §6.16의 "검정 불가" 해소. **② 발동**:
  selector-IA가 표적 후보의 31%를 champion에서 배제 (B-public 0%).
  **④ 유보**: 나쁜 champion 채택률은 개선 안 됨(0.5 vs 0.389,
  문턱 미달·역방향). 사후 분해로 원인 확정 — **회귀형 사건은
  4/4 배제 성공, 불완전형은 판별 테스트가 hidden이라 원리적으로
  매핑 불가**(9건 전부 매핑 통과). selector-측 IA는 회귀는 잡고
  불완전은 못 잡는다. 비용 +110% 테스트·+42% wall. 다음 등록
  사안: 채굴 사건 규칙이 회귀형/불완전형을 미분리 — B군 재정의
  시 회귀형은 1건뿐.
- **selector 트랙 종결 (사용자 확정 2026-08-02, §8.5)**: ① 회귀형
  에서는 작동 확인(4/4 배제·과잉 탈락 0) ② 최종 성과 개선 미입증
  ③ 불완전형은 판별 테스트가 hidden이라 **정보 경계**로 기록.
  B-regression 추가 채굴로 같은 기제를 반복 검증하지 않는다.
  회귀 보호는 제품 기본 계층으로 이관 (`regression_guard.py`,
  동결 규칙 5종 + 단위 테스트 10/10).
- **운영 인프라 (§10)**: §8.3 전멸 사고 대응으로 **공통 러너
  resume** 구현 — 원자적 런 단위 저장, `(experiment, arm, task,
  rep)` 고유 키, 완료 런 자동 스킵, 설정 불일치 시 재개 거부,
  중단 로그 `.attemptN` 회전 보존(본 로그와 비혼합). 자체 검증
  7/7 통과 (하드 킬 후 재개로 12런 중복 없음 확인). **40런 이상
  실험은 이 게이트 통과 후에만 시작.**
- **다음 연구 주제: 패치 불완전성 (§9 등록 완료, 실행 전)**.
  INC-event 기계 기준 4조건 동결(공개 통과 ∧ 스모크 통과 ∧ 기존
  테스트 전부 통과 ∧ 수정 커밋 테스트 ≥1 실패). 4과제 확보 전
  본실험 등록 금지, 기존 저항 3·B군 3과제 재사용 금지, 새 프롬프트
  기제 제안 보류. 채굴은 기존 매니페스트 재분류부터 (무지출).
- **§9.1 재분류 1차 (2026-08-02)**: 후보 9건 전수 검증 → **INC
  0/4, 코퍼스 부족 기록**. 19프로브 중 (a) 통과 3개인데 전부 (d)
  불충족(그 함수 하나가 곧 완전 수정), 나머지 16개는 여러 함수를
  동시 요구해 (a) 자체 실패. **함수 그레인 부분 적용은 "완전 수정"
  아니면 "전무" 두 상태만 만든다** — 불완전형 사건은 *독립 다표적*
  커밋 구조에서만 구성 가능하고 유일 실례(du_operators)는 소진됨.
  모델의 자발적 불완전형 생성(§8.4 9건)은 사실이나 **사전 구성은
  별개 문제**. 계측기 사고 2건째: 1차 분류의 0/9는 Windows pytest
  역슬래시 노드 ID 때문에 나온 가짜였고, 역검증으로 발견·수정·
  회귀 테스트 고정 후 재실행한 값이 위 결과.
- **§9.4 트랙 종결 (2026-08-03)**: 최종 bounded 스캔에서 7저장소
  신형 대역 **서명 부합 0건** → 유효 INC 2/4로 **불완전형 트랙
  종결**. 0건은 4저장소 깔때기 추적으로 **실제임을 확인**(사고
  3건의 교훈 적용). 구조적 원인: **신형 커밋은 거의 단일 함수
  수정, 다중 함수 수정은 구형이라 py3.12 미가동** — 이중 구속.
- **주 레인 전환**: 연구 → **Rookery Alpha 제품화**
  ([rookery-alpha-spec.md](rookery-alpha-spec.md) 동결). 합격 기준은
  진화가 아니라 **무인 신뢰성**(7일 무인·재실행 0·예산 초과 0·
  격리 위반 0·판정기 불일치 시 자동 정지 100%). Validator 위에
  **Auditor**(다른 불변식 5종) 신설, 위험도 기반 후보 예산(1/2/3),
  실패 로그는 5게이트 통과 후에만 과제화. 결과 인용 규약도 동결 —
  "기억 실패"는 **프롬프트 누적 이력 방식**에 한정.
- **§9.2 독립 다표적 표적 채굴 (2026-08-03)**: §9.1의 구조 결론을
  서명(변경 함수 ≥2 ∧ 변경 테스트 ≥2)으로 조작화 → 약 300후보 중
  63건 부합, 전수 INC 검증. **유효 INC 2/4** (dateutil 15fc1fa8c,
  marshmallow d057cb976) — 게이트 미충족, 코퍼스 부족 유지.
  서명의 예측력은 확인됨(0건 → 2건). **남은 병목은 서명이 아니라
  환경 호환성** — 63건 중 52건이 py3.12 미지원 탈락. 계측기 사고
  3건째: 분류기 소진 목록에 v3a 9건이 빠져 저항 과제
  (mi_running_minmax_stability)가 INC로 잡혔고, 검토에서 발견해
  3/4 → 2/4로 정정·회귀 테스트 고정.
- **병목 지도 (시리즈 현재 상태)**: 부정 증거 레지스트리 → 독립
  기여 없음 (§6.12) / selector IA → 표적 사건 부재로 검정 불가
  (§6.16) / proposer IA → 위치·품질 효과 미입증 (§6.14·§6.18) /
  단순 패딩·문구 지터 → 실코드 원인 고착 해소 실패 (§6.9) /
  **탐색→가설→기계 검증→분화 배정 구조 → 유일하게 살아남은 후보**
  (§6.11) / 다음 전제 → 이를 검정할 코퍼스 확보 (설계 §8).

## Findings: Rookery Alpha 구현·라이브 런 (2026-08-03 ~ 08-06)

사양: [rookery-alpha-spec.md](rookery-alpha-spec.md) (동결).
브리프: [rookery-alpha-status-brief.md](rookery-alpha-status-brief.md).
엔진: `genesis/rookery/engine/` — store(리스 복구)·budget(예약 원장)·
safety(허용 목록)·isolation(워크트리 격리)·auditor(별도 불변식 5종·
내구적 정지)·intake(5게이트)·risk·report·worker·pr(push-only)·
seeder(pytest 실패→과제)·service(systemd 진입점)·deploy 아티팩트.

- **Handler 4종 = 사양 1순위 작업 전부** (2026-08-06 완성): `fix`
  (테스트 기반 수정, fail→pass 오라클), `doc`(docstring 추가, AST
  동작보존 오라클), `test_add`(특성화 테스트, 변이 이빨 오라클),
  `data`(형식 변환, 보존 불변식 — 레코드 수·보존 컬럼·스키마 적합·
  스폿체크). 네 kind 모두 auditor가 **handler 자신과 다른 불변식**
  으로 역검증. data의 정직한 경계: 패턴에 맞는 오답은 스폿체크
  없이는 못 잡음 — §2.3 정보 경계의 제품관 재진술.
- **실 API 라이브 런 (무인 6시간, 2026-08-05 21:44 → 08-06 03:48)**:
  주입 버그 스트림에 대해 **143/143 수정 성공, 실패 0, 감사 정지 0,
  격리 이탈 0, 차단 명령 0**, 총 지출 $0.0627(≈88원, 일 1000원 캡
  내), 검토 대기 브랜치 143개, 실패 분류 가능률 100%. 지정 시간
  완주 후 정상 종료 — 시간당 처리량은 17→46→25→18→15→12→10으로
  감소(모듈이 자라며 pytest·git 비용 증가), 정확도는 불변.
- 실 API가 목이 못 잡던 결함 2건을 잡음 (커밋 e8d1c95·3ca0129):
  프롬프트 자리표시자 `<경로>` 반향 → 실경로 선입력, "assert 2==9"
  류 의도 누락 → 실패 테스트 소스를 프롬프트에 포함.
- 테스트: 엔진 294 통과/1 스킵(심볼릭 링크, Windows 권한), 전체
  스위트 521개.
- **2차 라이브 런 — 4 kind 전부 실 API 검증 (2026-08-06, 무인
  6시간 완주)**: 드라이버 v2(`tools/evolve_live.py`, 목 파일럿
  선통과)가 fix 스트림에 doc/test_add/data 회전 스트림을 추가.
  결과 **186/186 성공 — fix 139, doc 16, test_add 16, data 15,
  실패 0, 감사 정지 0**, 지출 $0.0934(≈131원), 검토 대기 브랜치
  186개, 정상 종료. 목으로만 검증돼 있던 3개 kind의 오라클(AST
  동작보존·변이 이빨·보존 불변식)이 실 모델 출력에서 전부 작동.
  원장: `data/rookery_live_20260806b_v2/engine.db`.
- **3차 라이브 런 (2026-08-06 밤 → 08-07 새벽, 무인 6시간 완주)**:
  187/188 성공 (fix 141 / doc 16 / test_add 15 / data 15), 지출
  $0.0949, 감사 정지 0. **시리즈 첫 작업 실패 1건(test-129,
  test_add)**: 모델의 테스트가 3회 모두 이빨 검증(변이 시 실패해야
  함)을 통과 못 해 validator가 기각, auditor 동의, 유출·정지 없음
  — 제도가 설계대로 실패를 봉쇄한 첫 실전 사례로 기록. 원장:
  `data/rookery_live_20260807_v3/`. 3run 누적 516/517 (99.8%).
- **루키 2.0 — 에이전트 루프 (2026-08-07)**: one-shot 제안자를
  "읽고→고치고→테스트 돌리고→다시 고치는" 도구 루프로 진화
  (`engine/agentic.py`). 모든 도구는 기존 격리·안전을 통과, 모든
  호출은 원장 경유, 채택은 기존 오라클·감사 그대로. 계층 라우팅
  (fast=Haiku / smart=Sonnet) 포함. 목 6종 통과(거짓 done 기각·
  테스트 파일 공격 차단·배회 상한·원장 완전성·라우팅) 후 **실 API
  스모크 양쪽 성공**: fast 4호출 17.6원, smart 5호출 38.1원 —
  2함수 버그를 스스로 읽고 고치고 검증받음. 다섯 번째 handler
  (`agent_fix`)로 등록. 같은 날 PixelLab이 art handler로 정식
  입사(11 테스트) — 엔진은 이제 AI 직원 2명·작업 6종의 회사.
  - **진화 2·3단계 (같은 날)**: 저장소 지도(프로젝트 기억 v1),
    실패 승급(미지정 tier 재시도는 fast→smart — E군 교훈의 최소
    구현), 대화 창구의 create_task 등록 경로(모델은 제안만, 등록은
    사장님 y/n 확인 필수). 8 테스트.
  - **진화 4단계 — 경험 기반 라우팅 (2026-08-07)**: 모든 agent
    과제의 결말(tier·채택 여부·시도 차수)을 append-only 이벤트로
    원장에 기록하고, 같은 종류의 일에서 fast의 1차 성공률이 측정
    가능하게 낮으면(표본 ≥8 ∧ 성공률 <0.5) 첫 시도부터 smart로
    직행 — 검증된 경험이 처음으로 엔진의 의사결정을 바꾼다.
    설계 원칙: 경험은 프롬프트(제안 측)가 아니라 **라우팅(선택 측)**
    에만 쓴다 — 7B~7D·§6.14·§6.18에서 제안 측 정보 주입은 일관
    되게 무효과였고 선택 측 제도만 살아남았다는 시리즈 결론의 제품
    반영. evidence-gating은 미로 세계 진입 비용 설계와 동일. 명시
    tier(운영자) > 재시도 승급 > 측정 이력 > 기본 fast. 종류별
    분리(타 종류 실패가 오염 못 함), smart 실패·재시도 실패는 fast
    통계에 불산입. 대화 창구 현황에 "에이전트 경험(성공/시도)"
    노출. 10 테스트 (가짜 API, 지출 0).
- **4차 라이브 런 (2026-08-07 밤 시작, 8시간 + 종료 후 강제 전원
  차단 — 사용자 지시)**: 드라이버 v3(`tools/evolve_live3.py`) —
  v2 스트림 + **agent_fix 스트림**(10주기마다 독립 소형 모듈에
  2함수 버그, tier 미지정 → 경험 라우팅이 원장에서 결정). 예산
  정지 시 런 종료 대신 주입 일시정지·일일 리셋 후 재개로 변경.
  목 파일럿에서 감사 오탐 1건 적발·수정: .gitignore 없는 저장소
  에서 테스트 실행이 만든 `__pycache__/test_*.pyc`가 변경 목록에
  올라 "테스트 파일 수정" 정지를 유발 — `_git_changed`가 컴파일
  캐시를 제외하도록 수정(+회귀 테스트), 라이브 저장소 시드에
  .gitignore 추가. 재파일럿: 5 kind 전부 성공, 정지 0, 경험
  fast 1/1 기록. 정직한 범위: 이 난이도에서 fast는 계속 성공할
  것이므로 라이브 실측 대상은 결말 기록과 음성 대조(fast가 이기는
  동안 라우팅이 fast에 머무름)다 — 실패→smart 분기는 단위 테스트
  로만 검증됨.
- **4차 런 판정 (원장 기준, 2026-08-08)**: 가동 구간 무결 —
  **145/145 전 kind 성공 (agent_fix 10 포함), 실패 0, 정지 0,
  경험 라우팅 fast 10/10 기록**, 지출 $0.0666. 단 23:58 시스템
  절전 진입(Kernel-Power 42)으로 8시간 중 약 3시간만 실행 —
  powercfg 대기 해제 상태에서도 잠들었다(덮개 유력). 대응:
  드라이버가 `SetThreadExecutionState`로 런 중 절전을 직접
  차단하도록 수정. 예약 강제 종료는 절전을 넘기지 못하고 소멸
  — 장기 런 + 예약 종료 조합은 절전 차단 없이는 성립 안 함.
- **남은 필수**: 서버 배포(사용자 실행 필요 — SSH 없음), 7일 무인
  soak(합격 판정 본체), PR 오픈 실경로(현재 push까지, PR은 사람).

## 1개월차 1주차 (2026-08-08) — A 닫힘, B 고정

- **A. 장벽 재집계 표 완성**: [barrier-recount.md](barrier-recount.md)
  + `data/barrier_recount.json` (30런, 기술 통계 전용, 결론 없음).
  v0 분모 명시: 직접 기록 7 + 무변화 후보 10 + partial 13 = 30,
  보간 없음. 문턱 A 0.72 / B 0.80은 값 확인 전 고정, 판정 불변
  구간 (0.7085, 0.7705) / (0.7915, 0.8488)을 데이터로 재검증해
  표에 동봉. 생성기 `tools/barrier_recount.py`.
- **B. 출처 계약 v0 동결**:
  [provenance-contract.md](provenance-contract.md) — 헤더 7필드,
  승격 레코드 8필드, 계약 8항 (5항 = 요약본 대체 착수 금지, 8항 =
  장부·출처는 제안기 프롬프트에 불주입 — P36·P38·P39b 기각 기억
  기능과의 경계). 골든 케이스 G1~G5를 손으로 먼저 작성
  (`tests/fixtures/provenance/`) — 2주차 코드는 이 정답 재현이
  실로그 적용의 전제.
- **제거 실험 사전 등록 동결**:
  [ablation-structure-design.md](ablation-structure-design.md) —
  §6.11 구조(탐색→가설→검증→분화) 귀속 검정, BS vs BF 2조건,
  미소진 적격 18사례 전수, 라운드 상한 5, **총호출 상한 1,440 ≤
  월 3,000의 60%**. 최소 효과 크기·중단 규칙 동결.
- **§9.2 환경 탈락분 1단계 분류 (복원 시도 없음, 호출 0)**:
  §9.2 스캔 저장본 43건 중 검증 완주 10 / skip 33 / ERR 0.
  skip 33건 진단 분포 — **py_incompat 20 (61%) / runs_ok 8 (24%)
  / runner_config 5 (15%)**, 의존성·시스템 라이브러리·네트워크·
  타임아웃 0. 예측(py3.12 고정이 최대 원인) 적중. 단 **runs_ok
  8건은 현 환경에서 정상 실행됨** — 탈락 원인이 환경이 아니라
  repro 구성 단계(부모 주입·판별 조건)라는 뜻으로, 환경 복원
  없이 재검증 가능한 별도 열. 원자료
  `data/env_failure_diagnosis.json`, 도구
  `tools/diag_env_failures.py`. 문서상 63건과 저장본 43건의 차이
  20건은 스캔이 기결과·소진 제외 후 저장된 세트라 명단 재구성
  불가 — 이전 세대 결과 29건에 대한 동일 진단은
  `tools/diag_env_failures_extra.py`로 준비돼 있음 (미실행).
- **보류 표시**: `data/corpus_v2` 매니페스트 3건(dateutil
  f42ee4c13 외)에 §9 시절 재검증으로 보이는 미커밋 변경 존재 —
  오늘 커밋에서 제외, 정체 확인 전 커밋 금지.

## 1개월차 2주차 (2026-08-08) — B 구현 + 제거 실험 착수

- **B 구현·골든 통과**: `genesis/provenance.py` — 계약 8항의 기계
  판정부(classify_document / classify_promotion / aggregate).
  골든 케이스 G1~G5 + 모서리 3종 **7/7 통과** (expected.json은
  1주차에 먼저 커밋된 손 계산 정답 — 사전 등록 재현). 실로그
  적용은 계획대로 3주차. stale률 분모 = fresh+stale, unknown은
  분모 제외·비율만 상시 산출.
- **제거 실험 등록 v1.1** (데이터 관측 전 수정): v1.0 "라운드
  상한 5"는 §6.11 B-search 정의(사례당 8호출 고정)와 어긋난
  오기 — 실행 단위를 §6.11에 정합화, "5"는 반복(rep)으로 정정.
  BF 정의 구체화: 가설 호출·가설 focus·부정 레지스트리 제거,
  후보 중복 제거·champion 선택·최종 검증 유지 (선택 제도는
  §6.11 이전 기반이라 제거 대상 아님). `run_arm`에 budget 인자
  추가 (BF=8, 기존 6 기본값 비파괴).
- **입회 검사**: 동결 18건 중 **16 입회 / 2 제외** (ff18e782b·
  e0ee0c0f4 — 광역 회귀가 정답 커밋에서도 실패, 사유 기록
  `data/ablation_admission.json`). 호출 상한 16×2×5×8 = **1,280**.
- **목 파일럿 통과** (지출 0): BS 가설→선별→패치, BF 제안→중복
  제거→champion, 최종 검증·resume 기록·호출 계측 전 경로 실행
  확인. 1차 파일럿에서 BS 패치 경로 미도달 발견 → 목 가설을
  실존 심볼로 보강 후 재파일럿으로 해소.
- **본실험 시작** (2026-08-08 13:45, 분리 프로세스, resume 러너):
  `python -m genesis.rookery.ablation --run`, BS/BF × 16과제 ×
  5rep = 160런. 절전 차단 포함. 원자료
  `data/rookery3a_{runlog,calls,report}_ablation11.*`. 집계는
  4주차 골든 선행 규칙에 따라 이 주에 하지 않는다.
- **계측기 정지 사례 (1차 시도 무효, 시리즈 4건째)**: 가동 13분
  채널 점검에서 가설 생성 0/24라운드 발견 → 즉시 정지. 원인:
  provider 초기화의 max_tokens 누락(기본 512 절단, §6.x는 4000).
  오염 런 격리 `data/ablation11_invalid_maxtok512/`(~130호출 정직
  계상), 원시 응답 로깅 사각지대 수리, 14:01 재시작 — 첫 라운드
  생성 5·선별 1로 채널 정상 확인. 상세: 등록서 계측기 사례 1.
- **제거 실험 중단 — API 크레딧 소진 (2026-08-08 오후)**: 재시작
  후 boltons rep0 2런(BS full·BF full) 기록 시점에 HTTP 400
  "credit balance too low". resume 러너라 **충전 후
  `python -m genesis.rookery.ablation --run` 재실행이면 2런을
  건너뛰고 이어진다**. 잔여 약 158런 ≈ 1,260호출. 충전은 사용자
  실행 필요.

## 2개월차 1주차 (2026-08-08) — 보드게임 원로그 판정, 규칙 동결

- **원로그 판정: 열린다 + 재실행 충실 16/16**
  (`tools/replay_fidelity.py`, `data/replay_fidelity.json`).
  실험 1은 결정론·0API라 시도별 스펙 전문이 저장에 없어도
  재실행으로 전체 보드 복원 가능 — 계약 5항 통과, 코드 레인
  대체 분기 불필요.
- **원로그 스키마 결함 발견·기록**: 클론 대조 C 20행이 실제 C와
  같은 (arm, seed, removal) 키로 판별 컬럼 없이 저장됨 (100행
  중 중복 키 20개). 1차 충실도 검사가 이 충돌로 4건 오판정 →
  중복 키는 "정확히 한 행과 일치"로 재정의하니 16/16, **재실행
  일치가 곧 클론 판별기**. 원본 DB 불변, 파생 색인만.
- **규칙 동결**: [ledger-boardgame-rules.md](ledger-boardgame-rules.md)
  — 조회 키 (state_signature, phase, action), 세 해상도
  (full=재실행 복원 보드 해시 / local=착수점 국소 / stat=버킷
  통계), disposition 4종(BLOCK≥3실패·rollback_target 필수 /
  PENALIZE 2 / CONDITIONAL 1 / RELEASE=국소 변화), c_k=8호출
  낙관 관례, failure_archetype 조회 키 불포함.
- **3개월차 진입 임계값 동결 (숫자 보기 전)**: T_exp = **2,560
  호출** (조건 2 × 20런 × 8라운드 × 8호출 — 축소 우선순위 기반영,
  런 수 불감). **U_calls < 2,560 → 조건 실험 취소, 재량 없음.**

## 진행도와 다음 할 일 (2026-08-21 마감 기준)

### 진행도 (08-22 저녁 갱신; 지난 측정: 제도 90 / 루키 75 / 비전 25 / 돈 10)

- **판별 제도: 92%** (+2) — 08-22 하루 3런의 스트레스 테스트를 버팀:
  계측 결함 12건을 전부 원장 부검→목 테스트→수리로 처리(추정기·절단·
  분류기·인프라 requeue·브랜치 충돌 등), 위생 규칙 실전 11회 발동
  무사고. 이전 기록: 실전 풀체인 첫 검증 (인테이크 결함 →
  에이전트 파손 → 감사 정지 → 사람 검토), 부검 사슬 4층, 채택
  커밋 위생 I6까지 합류. 남은 것: 7일 소크(사용자 "시작" 대기),
  Goodhart 계측, 규범 문서 제3 source_kind.
- **루키: 78%** (+3) — 공개 PR 5건(toolz 632·633·634, boltons 456·457),
  라우팅 v2, 스테이지 1 설계 + ① 인테이크 파이프라인(멱등) 구현.
  이전 기록: 3계층 능력 경계 실측(Haiku·Sonnet·Opus
  각 1승), 실전 채택 3건 전부 공개 제출. 남은 것: 코퍼스 확장,
  스테이지 1(서버 상주·자동 인테이크), PR 경로 반자동화.
- **비전(Genesis 학습 표준): 28%** (+3) — 원장이 자기 규칙의 무용을
  스스로 측정해 v2로 교체됨(경험이 선택을 바꾼 첫 누적 사례). 이전
  기록: 경험 라우팅·승급이
  실전에서 첫 작동. **(b) 원장 이득 재검증 완료 (08-22): 판정
  "원장 손해"** — 시딩 원장(smart 직행) 3/13·$13.43 vs 빈 원장
  4/13·$8.60 (docs/ledger-retest-live.md). 교훈: 두 계층이 대부분
  실패하는 대역에서 승률 문턱 라우팅은 실패의 가격만 올린다 →
  기대 비용/해결 기반 라우팅 재설계 안건. 남은 것: 재설계 후 재측정.
- **돈: 10%** (0) — 수익 경로 미착수. 게임 트랙은 병렬 축으로
  대기 (docs/game-design-v0.md).

### 다음 할 일 (우선순위 — 위임 규칙에 따라 위에서부터 착수)

1. **PR 반응 대응** — toolz #632/#633/#634, boltons #456/#457 메인테이너
   반응 확인(세션 시작마다). 리뷰 코멘트는 사람 검토 후 사장님
   명의로 대응. 머지/기각 각각이 (a) 트랙 관측치.
2. **인테이크 v1.2 + 코퍼스 확장** — run 2·3의 교훈(질문성·
   기능성 이슈 판별은 실행만으로 불가) 반영해 필터 개정, 새
   저장소·새 이슈 스캔으로 일감 보충. 목표: 버그형 10건+.
3. ~~라우팅 재설계~~ **완료 (08-22 오후)**: v2 기대 비용/해결
   (docs/routing-v2-design.md) 구현·목 테스트, 엔진 수리 3건(브랜치
   충돌 회피, 초과 플래그 과제 범위, smart 추정 0.30) 완료. 남은
   것: v2 재측정은 코퍼스 종류가 다양해진 뒤 (현 대역에선 정보
   가치 낮음 — 설계 문서 참조). A형 런 task_krw 3,600은 운영자 설정.
3b. **새 해결 2건 제출 완료 (08-22 16:58)**: toolz **PR #634**
   (https://github.com/pytoolz/toolz/pull/634), boltons **PR #457**
   (https://github.com/mahmoud/boltons/pull/457). 공개 제출 누적 5건
   (toolz 632·633·634, boltons 456·457). 1번 항목의 반응 확인 대상에
   추가. — 준비 기록:
   toolz `compose-annotations`(#496, 65a4134) · boltons
   `camel2under-acronyms`(#142, A 버전, ad3fd88): origin/master 기반
   체리픽 + 정식 회귀 테스트 + 전체 스위트(doctest 포함) 통과 +
   사장님 명의 커밋·AI 관여 트레일러. PR 제목·본문 초안
   data/pr_drafts/*.md. 남은 것: 포크(az51826295-sys) 푸시 → PR 오픈
   (사용자 승인/직접).
4. **Opus 편입 판정** — 확장 코퍼스 데이터로 라우팅 규칙에
   opus 승급(2차 실패 시) 추가 여부 (건당 비용 대비 해결 이득,
   현 표본 1은 부족).
5. **스테이지 1 인프라** — 설계·빌드 순서 등록 완료 (08-22,
   docs/rookery-stage1-infra-design.md): ① 인테이크 파이프라인 한
   명령(멱등, --mock) → ② 상주 서비스 다중 저장소화 → ③ 운영자
   표면(PR 후보 큐·초안 자동 생성) → ④ 48h 목 드라이런 게이트.
   **① 완료 (08-22 저녁)**: tools/intake_pipeline.py — scan→verify→
   동결→enqueue 한 명령, 멱등(레지스트리 data/intake_seen.json + 원장
   과제 id), --mock/--from-corpus, 테스트 3건 + 실코퍼스 2회 실행에서
   2회차 추가 0 확인. **② 완료 (08-22 밤)**: ServiceConfig 다중 모드
   (ROOKERY_REPOS/REPOS_ROOT/TAG/LOCAL_ONLY_PR/INTAKE_INTERVAL_S/
   EXIT_WHEN_IDLE), 저장소별 엔진·원장을 ①과 같은 배치로 열어 상주,
   외부 저장소는 LocalOnlyPrPreparer(pr_ready, pushed=False), 주기
   인테이크 = 파이프라인 호출, 유휴 종료. 테스트 3건(다중 배수·정지
   격리·설정) + 기존 서비스 테스트 통과. **③ 완료 (08-22 밤)**:
   genesis/rookery/engine/prqueue.py + tools/pr_queue.py — 채택 과제
   → PR 후보(초안 제목·본문, 포크 푸시 명령, 제목·본문 채운 compare
   링크), 상태 추적(new/pushed/submitted/dismissed, data/
   pr_queue_state.json), 저장소별 집계(summary). 오늘 원장 3태그에서
   후보 5건 생성 → 전부 기제출로 표시. 테스트 4건. **④ 진행 중**:
   48h 목 드라이런 08-22 18:06 시작 (docs/stage1-dryrun48.md, 판정 기준
   동결·판정 도구 tools/stage1_dryrun_judge.py). 08-24 18:06 자진 종료 후
   판정 → 통과 시 스테이지 1 인프라 완성(실 가동은 운영자 결정).
   **개입 금지** — 관찰만 (개입 = 시도 종료).

드라이런 대기 중 처리 (08-22 밤, 엔진 코드 불변): **출처 계약 v0.1 — 제3
source_kind `normative`** (판별 제도 백로그). 설계·규칙·계약 문서가 헤더를
가질 수 없어 unknown률을 부풀리던 문제 → 계약 §5 개정 → 골든 G6·G7 → 코드
(genesis/provenance.py 판정·집계 normative 분리) → `stamp_provenance.py
--normative` → 규범 문서 30건 스탬프. 스캔: 문서 42건 unknown 38 → 8
(남은 8은 부모를 대야 하는 파생 문서: capability-run1/2/4, ledger-retest-live,
*-brief 3, progress) → 그중 5건에 부모(런 보고 json)를 달아 unknown 3
(progress·구 브리프 2; unknown률 0.07). **Goodhart 계측 정의 초안**
docs/goodhart-metric-design.md (대리 vs 실제 세 비율 G-a 채택→제출,
G-b 제출→수용, G-c 통과→무결) → **같은 날 사용자 승인으로 동결·구현**:
tools/goodhart.py(원장+PR 큐 상태, G-b는 GitHub API; 14일 이동평균 대비
0.2p 하락 알람; data/goodhart/history.jsonl 날짜당 1행), PR 큐 `mark
--fixup`(손질 = 산출물 코드 수정만), 테스트 4건. 08-22 첫 측정: 채택 5 /
제출 5 / 손질 1(#456 스크래치) → **G-a 1.0, G-c 0.8**, G-b는 5건 모두 open
이라 미정. 일일 보고 편입은 드라이런 종료 후(엔진 report.py).
**운영 런북** docs/rookery-ops-runbook.md(실 가동 절차·일일 루틴·정지 해제·
예산·금지 사항) + 운영자 CLI tools/ops.py(status / resume --by 이름 /
clear-backoff; 테스트 1건). 드라이런 통과 직후 그대로 쓸 수 있게.
**실패 41시도 부검 → 에이전트 도구 v2 설계 등록** docs/agent-tools-v2-design.md:
read 스텝 50%, 같은 파일 반복 읽기 38/41, 대상 파일 전부 20,000자 절단 대상,
탐색용 스크래치 스크립트 19/41 — `read_file` 줄 범위 + `search` + `list_dir`
(파이썬 구현, 스니펫 실행 도구는 격리 충돌로 제외). 측정은 양팔 실패 9건으로
사전 등록(≈$12, 판정표 동결), 구현·실행은 드라이런 후 + 운영자 승인.
**루키 채팅 쓰기 경로 v1** (genesis/rookery/chat.py, `--tag`): 대화로 저장소
일감 등록 — `create_task(repo, issue, test_src)` → 재현 테스트가 HEAD에서
**실패해야** 수용(파이프라인과 같은 verify_fails·enqueue 경로) → 사장님 확인
→ 저장소별 원장. 테스트 없으면 인박스(data/chat_inbox.json)에만 기록(소비는
드라이런 후 파이프라인에 연결). 스테이지 1 현황 스냅샷(저장소별 큐·PR 큐
상태·Goodhart·인박스). 테스트 6건 + 기존 채팅 테스트 호환. 모델 권한 없음.
**돈 축 상품화 메모** docs/rookery-monetization-memo.md(초안, 결정 대기): 실측
재료(해결률 20~30%, 해결당 $2.15, PR 5/머지 0, G-c 0.8) → 선택지 A 수리 구독 /
B 제도 서비스 / C AI 직원 회사, 병목 4(머지 0·해결률·고객 저장소 경계·사람
시간), 권고: 증거 2개(머지 1건+, 도구 v2 후 해결률) 먼저 → A 무료 파일럿으로
가격 근거 측정. 질문 4개.
**도구 v2 선구현** genesis/rookery/engine/agent_tools.py(read_range·search·
list_dir·exec_tool, 격리 경유, 테스트 4건) — agentic.py 연결은 드라이런 후 두 줄.
**인박스 소비기** genesis/rookery/inbox.py(pending·to_candidates·record, 테스트
3건; 파이프라인 연결 두 곳은 드라이런 후). **실측 시드 추출**
tools/extract_ledger_seed.py → data/ledger_seed_v2.json(48결말, usd 포함: fast
1차 1/13 $0.16, smart 1차 3/13 $0.59, smart 2차 3/22 $0.56). 런처에 PYTHONUTF8.
**Rookery 엔진 지도** docs/rookery-architecture.md(일감의 일생·조각별 책임·도구·
데이터 배치·제도 색인). **고객 저장소 보안 경계 설계 초안**
docs/rookery-security-boundary-design.md(현재 경계의 사실: 서브프로세스는 OS
전체·네트워크 차단 없음; 파일럿 전 최소 3개, 유료 전 4개; 결정 질문 2).
**드라이런 후 연결 스크립트** tools/post_dryrun_wiring.py(도구 v2 연결·인박스
소비·Goodhart 일일 편입을 정확 치환으로 적용, --dry-run 앵커 검증 통과, 멱등)
— 08-24 판정 뒤 `python tools/post_dryrun_wiring.py` → 안내된 테스트 실행.
런북 §1 `--check` 경로 검증(게이트 변수 없으면 정확히 2문제, 있으면 통과).
외부 논의용 브리프 docs/stage1-day-brief.md(오늘 후반: 제도·인프라·부검·질문 5).
**사장님 답변 4개 반영**(메모 §6): 무료 OSS 파일럿 + 소액 유료 병렬, 원가 가격
폐기(앵커 = 시장, 진짜 질문 = 검토 30→10분), 좁은 직무 OK, 보안 경계는 비밀
있는 첫 고객이 방아쇠 — 지금은 **출처 표시**. 대체 게이트 3개($0): (i) 로그 집계
완료(고유 해결 5, $26.67 → $5.33/고유 해결; 수율 v1 24.6%/v2 9.4%), (ii) 메인테이너
반응 분류표 사전 등록(관측 09-04/05), (iii) 유료 의사 대화 5건(사장님).
tools/export_audit_log.py(채택 1건의 기계 기록 → 마크다운, 모델 원문 제외) —
제출 5건 소급 내보내기 data/audit/*.md (공개 위치는 사장님 결정). 숫자 정정:
"$2.15 + 실패분 $4~6" 이중 계산 → all-in 표로. 인테이크 v1.3 본문 신호 규칙은
소급 측정(정밀도 0.5·재현율 0.27)으로 기각 기록.
**tools/pr_prepare.py**(사장님 Q2 "검토 30→10분"): 채택 1건 → 깨끗한 base 위 PR
브랜치(체리픽·명의·트레일러) + 회귀 테스트 초안 + 전체 스위트, 실측 **8.9초**
(toolz#496, 푸시 없음). 런북 §2 갱신 — 단 이것은 **가설**(before 미측정; 판단
시간이 대부분일 수 있음) → tools/review_timer.py로 단계별 절대 시간만 기록.
**사장님 2차 지적 반영(08-22 밤)**: 표 이름 "API all-in"·사람 시간 "미측정" 행·외부
인용은 $5.33 하나; 게이트 (i) 재집계 = **재현 단계 성공률** 23/146 = 15.8% vs 후보
기준 해결 ≈6%(재현이 2.6배 흔함 → "재현을 판다" 재정의 로그상 성립; 재현 실패
대부분은 유도 테스트 무효 73/85 → 다음 관측 = 유도 품질); 반응 5건은 존재 판정만;
v1.3 기각에 n 명시(3/6·3/11, 잠정); PR 본문 구조(첫 줄 AI 명시·3~5줄·감사 로그
gist 링크·"손대지 않은 것") → prqueue 초안·pr_prepare 커밋 본문 교체; 대화 5건
질문 3개·상대 2+3; 순서 고정: 드라이런 판정 → 대화 5건 → 도구 v2.
**무효 73건 원인 분류(사장님 3차 지적, $0)**: 계측 결함 자가 발견(최상위 import
불능을 허구 API로 오분류→수정) 후 — 무효 86%는 **환경 85%(src 레이아웃 marshmallow·
dateutil·sortedcontainers import 불능) + 기능요청 11% + 테스트결함 4%, 유도 품질 0%**.
깨끗한 재현율(root 저장소): v1 40.5%·v2 31.6%(블렌디드 15.8%는 오염 → 폐기). 재정의
논거를 배수(2.6/2.9배)가 아니라 **비대칭**(재현 실패는 안 보내면 그만, 패치 실패는
리뷰 시간 소각)으로 재정립. 단위 섞인 유도식 폐기. 수리 안건 등록(워크트리 import
프리플라이트·src editable 설치·기능요청은 import 신호로 분리) — intake 파일이라
드라이런 후. tools/invalid_triage.py.
**PYTHONPATH=src 재분류 + 오라클·오염률 측정(사장님 4차, $0)**: 62/22건이 import만
되면 실행됨(env가 병목 확증). 순수 재현율은 fix 오라클로 확정 불가(열린 이슈엔
수정 커밋 없음) → 층화 표본 5+5(사전 등록 seed 20260822) 수동 분류: **실패 테스트
10건 중 진짜 버그 재현 3건**, 나머지 기능요청·깨진 테스트·데이터파일 부재.
AssertionError 대리도 기능요청에 오염 → 순수 버그 재현율 ~30%가 아니라 **10~25%
미확정**. 부수 발견: verify의 FAILED=accepted 게이트가 root에서도 과대계상, 흡수
범주(invalid)가 조용히 86%까지 커진 계측기 사고 5호(→selfcheck 흡수범주 경보 등록),
기능요청은 실행 신호(cannot import/hasattr False)로 분류가 v1.3 어휘보다 정확(등록),
배수는 분모 병기(v2 7.6·v1 2.3·합계 4.2배). 공급측 재정의: '실패 재현'이 아니라
'버그 재현', 기능요청 필터 후가 진짜 수.
**단일값 철회(사장님 5차)**: 146 분류는 사후값(사전 미등록). 대칭 게이트를 걸자 두
헐거운 게이트가 4배 어긋남(예외-단어 24% vs 심볼 ~100%) → 재현율은 사후 게이트에
민감(8.9~66.7%), 방어 가능한 단일 기계값 없음. 사전등록 유일 측정=10건 표본 3/10.
확정값은 기능요청 **16%** 하나(상품 문구). 'AI 생성 명시+실행신호 기능분리'가 v1.3
어휘 분류기의 정식 대안. **경고 기록**: 사장님 일 둘(gist, 대화 5건)이 사흘째 정지 —
공급측이 좋은 일을 계속 찾아내는 게 수요측 0을 가리는 흔한 방식(08-24 판정까지 순서는
고정이라 지금은 정상이나, 그 뒤엔 공급측 신규 작업보다 대화 5건이 먼저).
6. **7일 소크** — 사용자 "시작" 시 데스크톱에서 (CLAUDE.md 절차).
7. **게임 트랙** — 사용자 지시 대기.

미해결 5건(boltons 439·310·301·201, tinydb 629)은 후세대 모델
재도전 코퍼스로 보존 (docs/capability-run4.md).

## 세 번째 공개 제출 — Opus가 뚫은 첫 문제 (2026-08-21 밤)

- **mahmoud/boltons PR #456 오픈**: 능력 실험 4의 채택 산출물
  (URL 동등성의 쿼리 파라미터 순서 무시, #280). 스크래치 파일
  제거·회귀 테스트 4케이스·전체 스위트 473/473 후 제출. __eq__
  동작 변경이라 메인테이너 논의 가능성 있음 (이슈 요청 그대로).
  https://github.com/mahmoud/boltons/pull/456
- 제출 스코어: toolz #632(기능)·#633(버그), boltons #456(버그).
  세 저장소 아닌 두 저장소, 세 PR — 하루에.

## 두 번째 공개 제출 — 첫 버그 수정 PR (2026-08-21 밤)

- **pytoolz/toolz PR #633 오픈**: run 3의 첫 실전 버그 수정
  (tail(0) → 전체 반환, #626)을 깨끗한 master 체리픽 + 회귀
  테스트 5케이스 + 사람 검토로 제출.
  https://github.com/pytoolz/toolz/pull/633
- 루키 첫 영업일 마감 스코어: **기능 구현 1건(PR #632) + 버그
  수정 1건(PR #633) 제출**, 오채택 0, 계측기 수리 3건, 부검
  사슬 3층 완주 (절단 → 예산 추정 → 맨 능력).

## 첫 공개 제출 (2026-08-21)

- **pytoolz/toolz PR #632 오픈**: 능력 실험 1의 첫 채택 산출물
  (mapacc, #529)을 사람 검토·품질 보강(정식 테스트 추가, 전체
  스위트·doctest 로컬 검증, 사장님 명의 커밋 + AI 관여 트레일러
  공개) 후 사용자가 직접 제출. **루키의 작업이 처음으로 외부
  세계에 나간 날.** https://github.com/pytoolz/toolz/pull/632
  — 이후 결과(리뷰·머지·기각)는 그 자체가 (a) 트랙의 다음
  관측치다.

## 0단계 — 실전 투입 첫 런 (2026-08-20)

- **인테이크**: 7저장소 열린 이슈 136건 → 1단계(형태) 61건
  (44.9%) → 2단계(HEAD 실행 확인) 수용 15건 (11.0%). 실전 첫
  허점: 없는 기능의 유도 테스트도 실패한다 — 소망 6~7건 혼입,
  필터 v1.1(제목 표지)로 개정 (다운스트림 소비 전, 비용 0).
- **실전 런 (버그형 10건, 로컬 전용 — 푸시 없음)**:
  **해결 0 / 시도 9** (1건 잘림 제외), 지출 $1.07. fast 1차
  0/9 → **smart 승급 2차 실전 첫 발동 (4건+)** → 전원 오라클
  기각. **오채택 0** — 잘못된 패치가 채택된 사례가 없다는 것이
  이 런의 제도적 성과다. 에이전트는 과제당 8~12스텝 실작업.
- **판정 (0단계 정의 기준)**: "실제 버그 해결 0→N"은 미달성.
  대신 두 가지가 손에 들어옴 — ① **실전-주입 격차의 실측**:
  주입 버그 99.8% vs 실전 0% (현행 모델·2시도·에이전트 구조).
  시리즈 명제("가치는 모델이 못 푸는 지점부터")의 실전 확인이자,
  ② **천장 없는 검증된 난제 코퍼스 9건** — (b) 장부 재검정과
  능력 상향 실험의 재료. 계측기 결함 2건 적발·수리 (API 오류
  응답 KeyError, 러너 재시도 창 미대기).
- 관찰 (판정 아님): smart 2차 시도가 3~4스텝으로 짧게 끝남 —
  MAX_TOKENS(2000)·프롬프트 구조가 상위 모델에서 조기 done을
  유도할 가능성. 다음 능력 실험의 1순위 변인.

## 4개월차 1주차 (2026-08-09) — 라우팅 역산, 게이트 등록

- **위임 목록 = 역산 한 줄**: 원장 4개·662과제 집계 — 기본 경로
  실패는 test_add 이빨 기각 9건이 전부 (fix 524·doc 44·data 41·
  agent_fix 10 무실패). → **test_add 재시도만 smart 승급**
  (`engine/routing.py` 규칙표 + `_pick_client_factory`, 결정은
  `routed_smart` 원장 이벤트). 모델에게 라우팅을 묻는 호출 없음.
- **비가역 행동 사전 등록**: force push·브랜치 강제 삭제·hard
  reset·작업공간 밖 clean·PR merge — 승인 큐 전용, 실행 시점
  목록 대조만. 테스트가 결함 1건 적발 (lowercase 정규화가
  `-D`/`-d` 구분을 지움 — 원문 대조로 수정).
- **운영 규칙 동결**: [unattended-ops-rules.md](unattended-ops-rules.md)
  — 예산 상한 사람 설정 1개, 장부≠기억 경계 재명시, 7일 예산
  산술(~700호출), 승인 큐 모순은 사용자 결정 대기(권고안: 큐
  동결 + 적체는 관찰 지표).

## 3개월차 (2026-08-08~09) — 조건 실험: 천장-분별불가

- **1주차**: 사전 등록 동결 ([ledger-condexp-design.md](ledger-condexp-design.md))
  — 산술 우선(4조건 5,120 > 3,000 → 조건 1·2만 2,560, 런 수
  불감), 성공 = objective 0.78 (실험 1 judge와 동일 battery),
  조건 2 장부는 **선택 측만** (계약 8항). 집계기는 본실험 데이터
  생성 전에 골든 통과 (4/4).
- **계측기 사고 (시리즈 6건째)**: 1차 파일럿 성공 0/3 — 파싱
  99.5% 정상인데 objective>0이 1/192. 스키마 힌트가 실제 게이트와
  불일치 (보드 3~8 오기, scoring 개수·k 범위 누락 → 진단 60/60
  게이트 차단). 힌트를 check_constraints와 1:1 재작성, 무효
  파일럿 격리, 재파일럿 3/3 (champion 0.781~0.817). **파일럿이
  설계 목적대로 본실험 전에 적발.**
- **사전 예측 등록**: 재파일럿 전원 1라운드 성공 → 천장 위험을
  본실험 관측 전에 등록서에 기입 ("그 경우 '분별 불가(천장)'로
  기록, 문턱 상향은 새 등록") — ablation11의 판정식 누락 실수를
  반복하지 않은 첫 사례.
- **본실험·판정 (40/40런, 840호출)**: 성공률 0.80 동률, 성공당
  총호출 27.5 vs 25.0 (CI 대폭 겹침), 성공 90%가 1라운드,
  **장부 개입 기회 0 (BLOCK 0·오차단 0)**. → **판정: 분별 불가
  — 천장** (사전 등록 분기 발동). 시리즈 3번째 천장 사례: 제도의
  가치는 모델이 한 번에 못 푸는 지점부터 나타난다. 재등록 지침
  (문턱 ≥0.82 또는 라운드당 후보 1) 기록.
- **월말 결산**: 닫힌 항목 — ① "이 문턱·탐색 폭에서 장부 개입
  사건 미발생" (실측) ② 계측기 사고 적발·수리 1건 ③ 집계기
  골든. **장부 이득 여부는 미결로 남되, 판정식 누락이 아니라
  등록된 분기로 도달한 미결.** 호출 1,056/3,000 (35%). 신규
  가설 등록 0. stale 0.0 / unknown 0.9355 (원인 명확 — 무헤더
  규범 문서 증가).

## 2개월차 4주차 (2026-08-08) — 진입 판정, 장부 v0 완성, 월말 결산

- **진입 판정 (공식 대조, 재량 없음)**: 규칙 문서 5.1 —
  ① U_calls ≥ 2,560: 전 해상도 10~24배 상회 ✓ ② 재매칭 해상도
  ≥1: 셋 다 ✓ ③ 계획 T_exp 2,560 ≤ 3,000 ✓. **3개월차 조건
  실험 진입 확정.** 균형점 후보 = local (재매칭 0.417, 오차단
  0.155). 3개월차 등록서는 이 표를 인용해야 하며 등록 총호출이
  3,000을 넘으면 ③ 소급 위반.
- **장부 v0 완성**: verifier → confidence **기계 유도** (machine/
  replay=high, judge=medium, none=low — 서열, 숫자 아님; 손입력
  불가). **미검증 실패는 disposition 사다리에 불산입** — 계측
  없는 차단 금지. rollback_target 게이트는 기왕 구현. 테스트
  13종.
- **월말 점검 (2개월차)**: 닫힌 항목 3 — ① 원로그 판정(재실행
  충실 16/16 + 클론 판별) + 규칙·임계값 동결 ② 표 9,160행 +
  U_saved 집계(전 해상도 임계 통과) ③ 진입 판정 + 장부 v0.
  열린 가설 신규 0. 계측기 자기 적발 1건(시리즈 5건째, 불변식
  검사가 적발). stale률 0.0 유지, unknown률 0.9643 → 0.931 →
  0.9333 — 헤더 없는 신규 문서(규칙 문서 등 규범류)가 분모를
  늘리면 비율이 되오른다. 규범 문서는 원로그 부모가 없어 현
  계약 2종(raw/derived) 밖 — 제3종 신설 여부는 스키마 동결 해제
  절차의 안건으로 기록만 한다 (지금 필드 추가 금지 준수).
- **여유 트랙 — 코드 레인 원로그 위치 확인**: 실재·인벤토리
  포함 — `data/rookery3a_calls_*.jsonl` (ablation11 852호출 원문
  포함 §6.x 전 호출 로그), `data/rookery_live_*/engine.db`
  (라이브 런 4회 원장). 게이트 통과로 조건 실험이 확정됐으므로
  대체 분기용이 아니라 4개월차 병렬 트랙 재료다.

## 2개월차 2·3주차 (2026-08-08) — 표·장부 v0·U_saved 집계

- **장부 v0** (`genesis/ledger/state.py`): 공통 상위 스키마 —
  LookupKey(해상도·서명·국면·행동), disposition 4종, **BLOCK은
  rollback_target 없이는 성립 불가(승인 큐 강등)**, signature_equal
  = 완전 일치 인터페이스.
- **표 생성** (`genesis/ledger/boardgame.py`): 실제 80런 재실행
  → 9,160 시도 행, 서명 3해상도, 뒤 두 열(조회 키 일치?·규칙상
  차단?) 기계 산출. run_arm에 관찰 전용 수집기 추가 (재실행
  충실도 16/16 재검증). 클론 20행 제외 범위 동결.
- **계측기 자기 적발 5건째**: 1차 표의 full/stat 전역 재매칭 0이
  런내 재매칭(2081/4537)보다 작은 논리 모순 — machine_columns가
  local만 장부에 기록한 결함. 단위 테스트 보강(전역≥런내 불변식
  + 교차 해상도 기록) 후 재계산 경로(--recompute, 재실행 불요)로
  수정. 이번에도 "정상 실행 + 틀린 숫자"였고 **불변식 검사가
  잡았다.**
- **U_saved 집계** (골든 5행 손계산 선행, 3/3 재현 후 실표 적용):
  - 재매칭률: full 0.333 / local 0.417 / stat 0.821 — **재매칭 0인
    해상도 없음, 서명 정의 유효.**
  - **U_saved: full 3,049 / local 3,819 / stat 7,522** (9,160행)
  - **U_calls(낙관 상한, c_k=8): full 24,392 / local 30,552 /
    stat 60,176 — 셋 다 임계값 2,560을 10~24배 상회.**
  - 오차단률(BLOCK 명중 중 실제 성공행): **0.155** (1,624건 중
    251) — local 해상도의 재매칭 0.417 대비 균형점 후보.
  - unresolved 0 (재실행 완전 복원의 부산물).
- 주의 문구(동결 관례의 재확인): U_calls는 **낙관 상한**이다 —
  재매칭 전부가 한 라운드 절약이라는 가정. 임계 대조가 이 상한
  으로도 취소를 명하면 확정 취소지만, 통과는 "장부가 이길 수도
  있는 판"까지만 말한다. 이득 입증은 3개월차 조건 실험의 몫.

- **집계 골든 선행**: 교차 조건 지표 정의(후보 수준 5종, BF에
  가설 없음)를 실측 관측 전 동결, 손 계산 픽스처 → 집계기 재현
  3/3 통과 후에만 실로그 적용.
- **제거 실험 완주·판정**: 160/160런, 852호출(상한 1,280의 67%).
  **§6.11 구조 귀속 가설 기각 — 닫힌 항목.** 발동 지표 전부가
  역방향(BF 우위): 오파일 재방문 0.225 vs 0.009, 정답 파일 포함
  0.75 vs 0.95, 공개 통과 후보/런 0.375 vs 1.075, full 0.238 vs
  0.375. 동등이 아니라 **음의 기여**. 판정식에 "일관 역방향" 분기
  부재는 P10·P16 계열 4번째 판정식 오류로 기록. 기제 관찰(사후):
  가설 focus가 후보를 오파일에 결박 — 레지스트리는 가설을 막고
  가설은 후보를 가둔다. §6.12와 합쳐 **제안 측 구조 후보 전원
  탈락, 선택 측 제도만 생존** — 시리즈 결론 강화. 브리프:
  [ablation11-results-brief.md](ablation11-results-brief.md)
  (출처 헤더 부착). 원자료 `data/ablation11_verdict.json`.
- **출처 계약 정착 진행**: stamp 도구 신설(`tools/
  stamp_provenance.py`), 인벤토리 패턴 2건 보강(중위형
  `*_report_*` 등 — 발굴 규칙이지 스키마 아님). **fresh 2 /
  unknown 27, unknown률 0.9655 → 0.931.**

### 월말 점검 (1개월차)

- **닫힌 항목 3 + 부수 2** (목표: 월 1):
  ① A 장벽 재집계 표(기술 통계 확정) ② B 출처 계약 v0
  (골든→구현→실적용) ③ §6.11 구조 귀속 기각(보너스 목표였으나
  완주) + 부수: §9.2 탈락 1단계 분류(파레토 py_incompat 61%),
  4차 라이브 런 판정(145/145·경험 라우팅 fast 10/10 첫 기록).
- **열린 가설**: −1 (§6.11 기각), 신규 등록 0 (하지 않을 것 준수).
  관찰로만 보존: runs_ok 8건(환경 아닌 repro 구성 탈락), 가설-결박
  기제, 구조 가치의 코퍼스 의존성.
- **계측기**: 정지 1건(max_tokens 절단) 적발·수리, "가동 직후
  채널 점검" 절차화. stale률 0.0 / unknown률 0.931 (첫 추이).
- **호출 예산**: 본실험 852 + 무효 1차 ~130 + 프로브 소량 ≈
  990/3,000 (33%). 2개월차 진입 조건 점검은 보드게임 원로그
  스키마 판정(2개월차 1주차)과 함께.

## 1개월차 3주차 (2026-08-08) — B 실로그 적용, 첫 자기감시 관측

- **적용기** `genesis/provenance_scan.py`: 원로그(data/ 1차 기록)
  인벤토리 — 경로=source_id, sha1 12자리, as_of는 기록 자체의
  마지막 이벤트 시각(sqlite events/runs, jsonl ts; 없으면
  mtime~표시). 파생 문서는 md 상단
  `<!-- provenance: {...} -->` HTML 주석 헤더 (직렬화는 구현
  선택 — 계약 필드 집합 불변). 판정·집계는 골든 통과된
  genesis.provenance만 경유. 입출력 테스트 7종 추가 (왕복·깨진
  헤더·jsonl as_of·mtime 대리 표시).
- **자동 생성 첫 실전**: `tools/barrier_recount.py`가 출처 헤더를
  직접 찍음 — 부모 30개 레지스트리의 개별 해시, as_of=부모 확인
  시점, generator 명시.
- **첫 측정 (data/provenance_scan.json)**: 원로그 156개, 문서
  28건 — **fresh 1 / stale 0 / unknown 27, stale률 0.0 (분모 1),
  unknown률 0.9643**. 96%가 unknown인 것은 계약 1항의 정직한
  기준선이다 — legacy 문서에 헤더가 없으면 unknown이고, 이
  수치가 내려가는 속도가 곧 계약 정착의 진행 지표다.
- **보드게임 원로그 관찰 (여유 트랙, 2개월차 준비 — 판정 아님)**:
  `data/mission.db` runs 100행의 result_json 안에 **events
  132건/런**(round·agent·행동 종류·artifact·유틸리티)과
  proposals_meta 47건(부모 계보·objective) 실재 — 원로그는
  열린다 (계약 5항 통과 가능성 높음). 단 **시도별 게임 스펙
  전문은 final만 저장**돼 있어 "전체 보드" 해상도의
  state_signature 재구성 가능 여부는 2개월차 1주차의 판정 사항
  으로 남긴다 — 요약본 억지 착수 금지 조항이 지켜보는 지점.

## Known Issues

- The random agent almost never solves the maze within 100 energy; that is
  now by design — use `--agent greedy` for successful episodes.
- The naive model's coarse-state-key artifacts (reward bleed across
  contexts, door/button state blindness) are fixed by the similarity
  model, which is now the default. The naive model remains available via
  `--model naive` as a comparison baseline.
- The model knows *whether* a hazard is near (`hazard_near`) but not
  where it is or which way it is moving, so individual hit timing still
  looks random to predict() — only the planner exploits patrol geometry.
  Relative-position features would let prediction catch up.
- Greedy (non-adaptive) still ignores hazards entirely; only
  AdaptiveAgent plans around them.
- The overall trend verdict still mixes difficulties; per-agent trends
  exist, per-difficulty could follow the same pattern if needed.

## Next Tasks (임무세계)

1. ~~판정 노이즈 정량화~~ — 완료, Findings에 반영 (σ=0.055).
2. **실험 2 (사용자 방향 확정, 2026-07-30)**: 지형 경화·frontier C' 계획은
   폐기. 대신 **협력이 구조적으로 필요한 과제**로 전환 — 분산 단서 추리
   (hidden profile), A/B/C/D 4군 비교. 설계:
   [mission2-design.md](mission2-design.md). 핵심 질문: 자유 소통(C)이
   인간이 설계한 공유 절차(D)에 얼마나 미달/능가하는가.

## Findings: 죽음 실험 — 죽음은 학습에 기여하는가 (2026-08-06)

등록: [genesis-exp-death-design.md](genesis-exp-death-design.md)
(동결본, 파일럿 보정 포함). 3군 × 20 seed × 100ep, API 0원.
원자료 `data/death_report.json`, 판정 `--report`.

- **D1 충족 (20/20)**: 죽음 단독(B)은 해롭다 — 후기 해결률
  A 0.678 ≫ B 0.369. 백지 리셋은 축적을 파괴한다, 예측대로.
- **D2 충족 (17/20)**: 유산(C)은 죽음을 **부분** 구제 — 0.369 →
  0.482. 단 A(0.678)에는 크게 미달: 상속으로도 죽음의 비용은
  남는다.
- **D3 기각 (12/20, 기준 ≥13)**: "죽음+선별 상속 = 오염 필터"
  가설 미충족. 후기 예측오차 C 0.1615 vs A 0.1626 — 방향은
  가설대로였으나 효과 크기 ≈ 0. **등록 조항에 따라 "죽음의 학습
  기여"는 이 설계에서 근거 없음으로 기록한다.**
- **예상 밖 관찰 (사후·탐색, 판정 아님)**: 예측오차 최저는 **B**
  (0.1385)다. 백지 개체가 예측은 제일 정확하고 수행은 제일
  나쁘다 — **예측 정확도와 수행 성과의 해리**. 축적 경험은
  predict()를 오염시키면서도(장기 스터디 재확인) 계획(진입 비용·
  위험 회피)은 계속 돕는다. 축적의 가치는 예측이 아니라 계획에
  있었다. 이 해리가 다음 연구 후보(오염은 예측 경로만 타격하는가).
- 사망 규모: B 1,190회 / C 1,006회 (6,000ep 중) — 압력은 실재했다.
- 교훈: 죽음이 주는 것으로 기대했던 "강제 망각"의 이득은, 이
  세계에서는 망각할 오염보다 잃는 축적이 더 컸다. 선택적 망각을
  원하면 죽음 없이 필터만 쓰는 편이 낫다는 방증 — 등록서 §5의
  대조 arm(죽음 없는 ε-필터링)이 자연스러운 후속.

## Next Tasks (미로 세계 — 보류 중)

1. **Fix cross-world contamination** (from the long-horizon study):
   candidates — (a) local-structure features (what surrounds the agent)
   instead of absolute (x, y); (b) recency-weighted retrieval; (c)
   per-episode memory partitions with cross-episode fallback. Measure
   against the study's protocol (100 episodes, varying maps): success is
   average prediction error that falls, not rises, with accumulation.
2. Multi-goal / ordered-objective scenarios (press button before goal
   counts, timed doors) to push planning beyond a single chain.
3. Tests count is growing (101); consider splitting slow integration
   sweeps into an opt-in marker if suite time exceeds ~15s.

## 2026-08-24 저녁 — 연출가 AI(설계도 엔진) 4개 층 완성
- 방향 확정: pass/fail 심판을 넘어 "구성에 맞나"로 재구성해서 되묻는 연출가 AI (docs/director-ai-vision.md, 사장님 승인)
- 설계도 엔진 v0 (tools/blueprint_engine.py): ①분해 ②재구성해서 추천 ③설계도(두 층) ④채용+코인 견적
- 추천하고 고르게(--pick), 코인 과금(코인↔원 페그 투명, 단가 자리표시, 사람 시간 별도)
- LLM Proposer 층 (tools/proposer.py): 자유 문장 분해, 제안은 verdict=unverified로 격리(믿지 않음), promote_proposal로 사람 검증 후에만 등록. 목 기본(지출 0), 실 제공자는 GENESIS_SPEND 게이트
- 테스트 17개 통과. 커밋 f4a3f9c..781f76f
- 다음: promote UI/흐름, 아는 원자 늘리기, 실 Proposer 목 파일럿(지출 승인 시)

## 2026-08-25 — 판단자 강화(심판대 v1): 심판은 문장이 아니라 이빨이다

설계·판정 기준 동결: [judge-design.md](judge-design.md) (구현 전 등록).

- **부검**: 설계도 엔진의 "심판이 있나"는 세 군데 자기 신고뿐이었다 —
  손으로 적은 `verdict:"real"` 라벨, 실행되지 않는 한국어 `check` 문장,
  그리고 `check.strip()`만 보던 promote 게이트(`check="됨"`도 통과).
  판단자가 사실상 **라벨 조회기**였다.
- **강화 원리**(엔진의 fail→pass 오라클·변이 이빨과 같은 골격):
  통과 사례를 통과시키는 건 심판이 아니다. **자기 반례를 거절해야** 심판이다.
  real 원자는 실행 가능한 `judge` 명세(kind+params+positive+negatives)를
  등록하고, 심판대 `tools/judge_bench.py`가 그걸 **실제로 돌려** 판정한다
  (teeth / toothless / missing / human_gate / unknown_kind / error).
- **짚인형 방지**: 반례 정본은 positive에서 한 곳만 바꾼 변이(`mutate`).
  직접 작성 반례는 `straw_risk`로 감사에 남긴다. 이빨은 반례 수만큼만
  날카롭다는 것을 항상 같이 보고한다.
- **첫 감사(기준선)**: real 주장 9건 중 **이빨 있음 0건 — 커버리지 0%**.
  전부 "문장뿐"으로 적발됐다. 심판 명세를 붙인 뒤 **9/9, 반례 18건 전부
  거절, straw_risk 0**. 심판 없음/거짓 5건은 `human_gate`로 *왜* 기계가
  못 재는지 명시 선언(감추지 않는다).
- **심판 종류는 레지스트리**(이름 분기 금지): set_membership, numeric_delta,
  threshold_desc, hash_pairs, tag_cover, forbidden_absent, all_tests_pass,
  human_gate.
- **연결 ① 설계도**: 기계 체크리스트는 심판대 통과분만 담는다. 나머지는
  `human_gate`로 분리하고 **기계 심판 커버리지**를 설계도에 숫자로 박는다
  (비전 문서의 "분해가 많을수록 혼자 오래 굴러간다"를 처음으로 잰다).
- **연결 ② promote 게이트**: `verdict="real"` 승격은 심판대를 통과하는
  judge 명세를 요구한다. 무딘 심판은 등록 자체가 거부된다. real이 아닌
  원자는 human_gate 사유가 자동으로 남는다.
- **상시 게이트**: `python -X utf8 tools/judge_bench.py --audit --strict`(종료코드)
  + 테스트 `tests/test_judge_bench.py::test_registry_real_atoms_all_have_teeth`.
  **이제 심판 없는 원자는 real이 될 수 없다.**
- 테스트 36건 통과(신규 18). 모델 호출 0, 지출 0, 결정적.
- 다음: 심판 종류를 실제 산출물(파일·오디오·이미지)에 물리는 어댑터,
  커버리지가 낮은 요청에서 되묻기가 human_gate를 줄이는 방향으로 재구성하게 하기.

## 2026-08-25 22:22~22:35 — 심판대 어댑터: 심판을 진짜 파일에 물렸다

설계 등록 22:24 ([judge-design.md](judge-design.md) §7, 구현 전 동결).

- **남았던 구멍**: v1의 심판은 사람이 손으로 적은 샘플 dict만 채점했다.
  `{"bytes_before": 940000}`의 940000은 **아무도 잰 적 없는 숫자**였다.
- **세 이름공간**(값의 출처 = 경로 접두사): `spec.*`(설계도, 신뢰) /
  `measured.*`(어댑터가 산출물에서 직접 잰 값) / `claim.*`(후보의 자기신고,
  안 믿는다). Proposer/Validator 경계의 연장 — **제안을 격리했듯 보고도 격리**.
- **어댑터 레지스트리** `tools/artifact_adapter.py`: dir_files(크기·sha1),
  dir_bytes_pair(전후 총 바이트), text_file(실제 원고), image_probe(픽셀,
  Pillow 있을 때만 — 못 재면 정직하게 실패). 읽기 전용·결정적·지출 0.
- **새 심판 종류** `threshold_match`: 후보가 보고한 목록 == 측정에 규칙을
  적용한 목록. 누락도 과잉도 실패 — 선언을 측정으로 대조하는 정본.
- **두 번째 축(증거 등급)**: 이빨과 독립. 심판이 읽는 경로를 접두사로 갈라
  measured / claim_only / unbound로 판정. claim_only는 통과해도
  `pass_on_claim`이고 자율 근거가 아니다.
- **결합 검사**(Goodhart 방어): `measured.*`라고 **쓰기만** 한 것도 자기신고다.
  원자는 어떤 어댑터가 그 값을 채우는지 선언하고, provides와 대조해
  bound / no_tool / key_gap로 판정한다. `--bindings`.

**측정(22:27~22:28, 지출 0)**
- 심판대: real 9건 전부 이빨 유지(반례 18), **재료 = 측정 6 / 자기신고 3**
  → 자율 가능 67%. 자기신고 3건 = spec_fit_art_selection, music_selection,
  game_feature_coding(§7.6에서 예상한 그대로 — 그림·음악이 남았다).
- 결합: 측정 선언 6건 중 **실제로 잴 도구 있는 것 4건(67%)**. 도구 없음 2건
  = dangerous_permission_scan, phishing_link_check(안드로이드 권한·URL 수집기
  어댑터 미구현). 오결합 0.
- **설계도 커버리지가 내려갔다**: "휴대폰 백신 청소 앱"의 기계 심판 커버리지
  100% → **60%**(5건 중 3건). 이전 100%는 잴 도구도 없이 measured라고 쓴
  숫자였다. 내려간 게 정직해진 것이다.

**실물 증명(22:31)**: 진짜 디렉터리로 채점 — 940KB→12KB 청소는 `통과(측정)`,
같은 디렉터리를 전후로 낸 가짜 청소는 `거절`. 큰 파일 목록은 작은 파일까지
부풀린 보고를 `거절`, 정직한 보고만 `통과`.

- 테스트 51건 통과(신규 16, tests/test_artifact_adapter.py). 모델 호출 0.
- 다음: ① 자기신고 3건을 측정으로 끌어내리기(그림=픽셀 측정 태그, 게임=테스트를
  우리가 실행) ② 권한·URL 어댑터 ③ 되묻기가 커버리지 낮은 요청을 재구성하도록.

## 2026-08-25 22:35~22:45 — 선재 결함 1건 판정: 계측기가 맞고 테스트 문장이 낡았다

22:16 전체 스위트 732건 중 **유일한 실패** `tests/test_classify_inc.py::
test_v3a_tasks_are_banned_from_reuse`. 판단자/심판대 작업 이전 커밋
(283de31)에서도 동일하게 실패 — **선재 결함**임을 임시 worktree로 확인.

- **증상**: `assert not _is_spent_sha("dateutil", "15fc1fa8c000")`가 True.
- **판정: 계측기(소진 레지스트리)가 맞다.** 근거 세 겹 —
  ① `data/rookery3a_report_ablation11.json`(160행)에 `abl_dateutil_15fc1fa8c`
  실제 실행 기록이 있다(BF/BS 양 팔, `data/repos/abl_dateutil_15fc1fa8c_work`
  잔존). ② 그 과제는 §9.2에서 08-03에 "신선한 INC 2/4"였던 바로 그 커밋이고,
  08-08 ablation 11이 소진했다. ③ 레지스트리는 08-22(5c7053b)에 와서야
  `abl_<repo>_<sha9>` id를 해석하기 시작했다. **세계가 08-08에 변했고
  계측기가 08-22에 따라잡았는데, 08-03에 쓰인 이 테스트 문장만 남았다.**
  같은 커밋이 자매 테스트(`tests/test_spent.py::test_fresh_inc_tasks_are_not_spent`)
  는 갱신했으나 이 파일을 빠뜨렸다.
- **수리**: assert의 의도("소진 판정이 무조건 True로 퇴화하지 않는다")를
  보존한 채, 미소진 사례를 **ablation 11 입회에서 기각돼 한 번도 실행되지
  않은** 두 과제(marshmallow `ff18e782b`, more-itertools `e0ee0c0f4`)로
  교체 — 자매 테스트와 같은 쌍이다. 왜 `15fc1fa8c`가 소진인지는 주석에 남겼다.
  더해 **채굴된 적 없는 sha 한 건**을 추가했다: 이쪽은 앞의 쌍처럼 낡을 수
  없는 절반이라, 다음 실험이 저 두 과제를 소진해도 문장이 무너지지 않는다.
- **레지스트리는 손대지 않았다.** 5c7053b의 의도(실행된 과제는 전부 소진)와
  ablation 실행 기록이 일치하므로 과잉이 아니다. selfcheck 통과(소진 28건,
  stale 후보 22건 차단, unresolved 0).
- 전체 스위트 **732 통과 / 1 skip (30분 03초)** — 실패 0. 22:16 주행에서
  유일했던 실패가 사라졌고 새로 깨진 것은 없다.

## 2026-08-25 22:36~22:45 — 아이콘 레인 심판 J 구현 (설계 08-24 → 코드)

사장님이 프롬프트 세트 v1을 다시 건네줌 = [icon-lane-design.md](icon-lane-design.md)
의 그 레인. 문서 상태가 "설계만 — 코드 미구현"이었고, 방금 만든 어댑터 층이
정확히 이걸 위한 자리였다. **심판(J)만 지었다** — Proposer(외부 LLM)는 지출
게이트라 미연결. 문서의 결정 그대로 "우리 자산은 심판뿐".

- `genesis/icon_lane.py` — 순수 함수 측정기. SVG를 파싱해 격자 이탈 좌표·획 굵기·
  하드코딩 색·fill·여백·패스 수·명령 수·요소·바이트를 **직접 잰다**. path 미니
  파서(상대 명령 절대화, A 명령의 rx/ry·플래그는 좌표 아님 — 격자 오탐 방지).
- `tools/icon_judge.py` — 설계 §4 리포트 그대로(VERDICT/violations/passed, 필드
  고정). `--svg` 단건 / `--set-dir` 세트 / `--prompt-spec`(공개 스펙만).
- `data/icon_specs/icon-24-line-v1.yaml` — 문서 §1 그대로 public/hidden 분리.
- **hidden 규율 구현**: 위반이 hidden이면 `internal_quality_gate`로만 노출(사유
  미제공). novelty(구조 해시 중복)는 **프롬프트에 주지 않고 필터로만** 쓴다(§6).
  `public_prompt_spec()`은 hidden 값이 새지 않음을 테스트로 건다.
- 레지스트리 원자 `icon_spec_fit` 등록: 심판 종류 `spec_conformance`(규칙 목록을
  measured/spec 경로로 선언 — 이름 분기 없음), 어댑터 `svg_file`.

**측정(22:41~22:42, 지출 0, 모델 호출 0)**
- `icon_spec_fit`: 반례 **11건 전부 거절**(teeth), 재료 **measured** — 그림 계열
  최초의 자기신고 아닌 원자. 기존 spec_fit_art_selection(태그 자기신고)과 대비.
- 레지스트리 전체: real 10건 전부 이빨(반례 29), **측정 7 / 자기신고 3 → 자율 70%**
  (어댑터 작업 직후 67% → 70%).
- 실물: 스펙 맞는 SVG는 PASS, 격자 이탈·2.0 획·하드코딩 색·여백 1.0인 후보는
  4개 위반을 정확히 짚어 FAIL. 서식만 다른 중복 후보는 세트 검사에서
  `internal_quality_gate`로 거절(중복쌍 (0,2)), 획 굵기 통일 확인.
- **미측정 선언**: contrast·roundtrip·optical_weight는 색 문맥/래스터라이저가
  필요해 못 잰다. 잰 척하지 않고 리포트 말미에 "미측정(도구 없음)"으로 남긴다.

- 테스트 78건 통과(신규 27, tests/test_icon_lane.py).
- 남은 것: Proposer 연결(지출 승인 시 §3·§5 재시도 루프), 래스터라이저 붙이면
  contrast·roundtrip이 측정으로 승격. 수요 1항은 09-05 재채점 대상 그대로.

## 2026-08-25 22:46~22:58 — 자산 심판 v0 초안: 해부·측정기·미동결 게이트

사장님이 자산 심판 초안(그림·음악, reject-first)을 줌. **status: draft,
문턱 미동결, registered_at: null.** 원칙 ①(산출물 보기 전 등록) 때문에 내가
문턱을 정하면 안 되므로, **내 몫만** 했다.

- **초안 원문 편입**: [asset-judge-v0-draft.md](asset-judge-v0-draft.md) — 손대지 않고 보존.
- **해부·상속**: [asset-judge-v0-inheritance.md](asset-judge-v0-inheritance.md).
  초안 §10이 나에게 배정한 "아이콘 심판 규격 ID"에 답 →
  **`inherits_from: judge-bench-v1.1`**. 아이콘 심판은 세 겹이고, 상속 대상은
  자산 스펙(icon-24-line-v1)이 아니라 **심판 계약**(이빨·증거등급·어댑터 결합·
  3값·종류 레지스트리)이다. 체크리스트 5번(규격 차이 목록화)도 닫았다 —
  초안이 더 요구하는 칸 넷: 추출기(G) 층, 독립성 계약, 골든 케이스 3종,
  undefined 사유 분류(E1~E6).
- **권고 1건(결정 아님)**: G의 출력은 `claim.*`(후보 자기신고)도 `measured.*`도
  아니다 → **`observed.*` 넷째 등급 신설**, null 통제 통과 전까지 undefined.
  승인하시면 judge-bench-v1.2로 올린다.
- **측정기** `genesis/asset_probe.py`: 그림(Pillow) — 해상도·알파·경계 알파·
  불투명 여백·색 수·팔레트 이탈률·무결성. 음악(표준 라이브러리, WAV 16비트) —
  길이·샘플레이트·표본 피크·RMS·DC 오프셋·앞뒤 무음·최장 결손·이음새 점프.
  어댑터 `image_asset` / `wav_asset` 등록.
- **문턱 미동결 게이트(핵심)**: 규칙의 spec 값이 null이면 판정하지 않고
  `undefined`. 심판대도 `unfrozen`으로 따로 표시(이빨 없음과 다른 상태).
  **숫자를 보고 문턱을 정하는 경로를 코드가 막는다** — 초안 §6 never 2항.
  못 잰 값(None)으로 탈락시키지도 않는다(미측정 = undefined, 초안과 일치).
- **기계용 규칙 골격** `data/asset_specs/asset_judge_v0.rules.yaml`: 잴 수 있는
  항목만 규칙으로, 문턱은 전부 null. 심판대 검증 샘플(운영 문턱 아님)을 붙여
  규칙 묶음 자체가 반례 11건(그림 5·음악 6)을 거절함을 확인.

**정직한 재고 조사**: BPM·조성·LUFS·true peak(dBTP)·스펙트럼 이음새·화풍
임베딩·mp3/ogg는 **못 잰다**(numpy/librosa/래스터라이저 없음). 근사치에 그
이름을 붙이지 않았고, 규칙에도 넣지 않았다. 음악 심판을 초안대로 돌리려면
**의존성 결정이 선행**한다(사장님 몫).

**문턱 추천**(동결 아님, 고르시라고): THRESH_PAL 0.005 / THRESH_DUR ±0.5초 /
THRESH_SIL 0.10초 / 표본 피크 대체 시 -1.5 dBFS / 이음새 0.02. 나머지는 잴
도구가 없어 **추천하지 않는다**.

- 테스트 96건 통과(신규 18). 레지스트리 감사 그대로: real 10건 전부 이빨,
  측정 7 / 자기신고 3.
- 사장님 대기: registered_at·frozen_by 기입, THRESH 동결, 골든 케이스 표본
  확보(채택 확정 자산 10건+), 오디오 의존성 결정, observed 등급 승인.

## 2026-08-25 22:59~23:05 — 세트 층(그림): 일관성은 취향이 아니라 분산이다

초안 §3 layer_set.image 중 **문턱 없이 잴 수 있는 것**을 구현. 사장님 결정
없이 갈 수 있는 유일한 칸이라 먼저 붙였다.

- `genesis/asset_set.py` — 세트 측정기(순수 계산):
  · 색상은 **원형 통계**로 다룬다(채도 가중). 세트 분산 = `1 - R`.
  · 명도·채도는 자산별 가중 중앙값 → 세트 중앙값 이탈 자산 비율.
    단 '이탈의 폭(tolerance)'도 동결 대상이라, 없으면 비율을 **만들지 않는다**.
  · 획 두께 ≈ 2 × 불투명 면적 / 윤곽 길이. 꽉 찬 그림엔 획이 없으므로 None.
  · 이상치는 **임베딩이 아니라 특징 거리**(대용임을 명시). 탈락이 아니라
    격리 후보 **순위**만 낸다 — 초안이 "새 시도가 항상 이상치"라 한 그 이유.
- 어댑터 `image_set`(디렉터리 또는 경로 목록). 규칙 `image_set_rules` 4건 +
  심판대 검증 샘플(반례 4건 전부 거절).
- **적격성 E6 구현**: 표본 5개 미만이면 지표를 내지 않는다 → 문턱이 동결돼
  있어도 판정은 **undefined**(탈락 아님).
- **미정의는 거절이 아니다**: 심판대 반례 루프가 Unjudgeable을 '거절'로 세던
  구멍을 막았다. 미정의 반례는 이빨의 근거로 세지 않는다.

**실측(23:02, 지출 0)**: 같은 색·같은 두께 5개 세트 → 색상 분산 <0.01,
이탈 0%, 두께 CV <0.01 → 문턱 동결 시 통과. 빨강·초록·파랑·노랑·자홍에
두께 2~12px를 섞은 세트 → 거절. 노란 자산 하나를 파란 세트에 넣으면 격리
후보 1위로 뜬다. 표본 3개면 문턱이 있어도 undefined.

- 테스트 113건 통과(신규 17). 세트 문턱 7개는 전부 null(미동결) 유지.
- 남은 세트 항목: 임베딩 이상치(진짜 임베딩), THRESH_OUT_PCT 동결 후 격리 큐.

## 2026-08-25 23:22~23:30 — 실 Proposer 연결: 요청→원자→심판→레지스트리 한 바퀴

사장님 결정으로 지출 경로 개통(2번). 규율대로 목 파일럿 → 예산 원장 → 실 호출.

- **모델 ID 수리**: `claude-haiku-4-5-20251001` → `claude-haiku-4-5`(날짜 접미사는
  현행 표기가 아님). 단가표(USD/1M: haiku 1/5, sonnet5 3/15, opus5 5/25) 코드에 등록.
- **키·원장·상한**: 키는 환경변수 → ai-workforce/.env.local 순으로 찾고 절대
  출력하지 않는다. 호출마다 실제 usage로 `data/proposer_ledger.jsonl`에 기록
  (추정치 아님). 누적 상한 $1, 넘으면 호출 거부.
- **첫 실 호출(23:23:55, $0.002652 = 약 3.71원)**: "공포 분위기 픽셀 RPG" →
  제안 4건. 23:20 레지스트리 매칭으로는 **0건**이던 요청이다.
  · `pixel_art_style`, `rpg_game_mechanics`, `genre_combination_feasibility`(모델 주장 real)
  · `horror_atmosphere` — **모델이 스스로 no_judge로 신고**(사장님 재구성 규칙을 따라옴)
  · 전부 verdict=unverified로 격리 — 견적·체크리스트에 하나도 안 들어감(설계대로)
- **모델이 낸 check 3건은 전부 심판이 못 된다**: "저해상도 블록 기반인가"는 기준
  없음, "메커닉 2개 이상 포함"은 자기신고, "기존 게임 3개 이상 존재"는 **산출물이
  아니라 세상을 재는 질문**(통과해도 물건이 좋아지지 않음). 격리가 일한 지점.
- **승격 1건(promote 경로 첫 실사용)**: `pixel_art_style`을 사람이 정한 심판으로
  바꿔 등록 — 논리 해상도(격자 블록 역산)·불투명 색 수·알파 이진.
  측정기 `genesis/asset_probe.measure_pixel_art` + 어댑터 `pixel_art_asset`.
  심판대: **반례 5건 전부 거절**, 재료 measured, 결합 bound.
- **실물 판정(23:26)**: 같은 32×32 원본을 NEAREST 8배 확대 → 블록 8·논리 32×32·
  색 11·알파 이진 **통과**. BICUBIC 확대 → 블록 1·논리 256×256·색 60,378·
  알파 비이진 **거절**. 사람 눈엔 비슷한 두 장이 격자에서 갈린다.
- **한 바퀴 닫힘**: 같은 요청을 다시 돌리니 `intake: pixel_art_style`,
  체크리스트 1건, 커버리지 100%, 견적 30코인. 23:20에는 분해 0·커버리지 0%였다.

**레지스트리**: real 11건 전부 이빨(반례 34), 측정 8 / 자기신고 3 → 자율 73%.
결합: 측정 선언 8건 중 실제 측정 가능 6건(75%).
**전체 스위트(깨끗한 주행) 809 passed / 1 skipped / 0 failed, 17분 38초.**
테스트 121건 통과(신규 8).

다음: 남은 제안 3건은 심판을 못 세우면 등록하지 않는다(rpg_game_mechanics는
측정 경로가 필요, genre_combination_feasibility는 우리 원자가 아님).

## 2026-08-25 23:52~23:56 — worker 분리: 벤더는 감추고, AI라는 사실은 감추지 않는다

사장님 질문("챗지피티 고용했다 말고 스토리 작가 고용했다로 숨길 수 있나")에서
나온 결정. 선은 **어느 회사인가**와 **사람인가 AI인가** 사이에 긋는다.

- 레지스트리 `worker` → **`worker_role`**(표시용) + **`worker_impl`**(내부) 11건 분리.
  표시는 "스토리 생성 AI + 자체 선별", 내부는 "ChatGPT (스토리)".
- 견적의 사람용 출력은 역할만. 기계 출력(`--json`)과 원장에는 실명 유지 —
  비용 추적·라우팅 판정·출처 계약이 거기 걸려 있다.
- `promote_proposal`도 worker(표시)·worker_impl(내부)로 나눠 받는다.
- **누출 방지 테스트**: 고객이 보는 출력 전체를 훑어 ChatGPT/GPT/Claude/Haiku/
  Sonnet/Opus/Midjourney/Suno/Anthropic/OpenAI/Stable Diffusion이 **하나도**
  없는지 검사한다. 동시에 "AI"와 "자체 선별"은 **반드시 있어야** 한다 —
  사람인 척하는 방향으로 새는 것도 막는다.
- 기존 테스트 `test_estimate_hires_chatgpt_for_story`("ChatGPT가 보여야 한다")를
  정반대로 뒤집었다. 이번 변경의 요점이 그것이므로.

**왜 AI 표기는 남기나**: ① 한 번만 물어보면 들킨다 ② 유통 채널(스팀 등)이 AI
고지를 요구하는 방향이다 ③ 우리 상품이 파는 게 정직이다 — 오늘 하루 커버리지를
100%에서 60%로 내리고 자기신고 3건을 적발한 규율이, 표지에 거짓말을 적는 순간
전부 무의미해진다.

**직전 전체 스위트(23:36~23:52, 15분 22초)**: 829 passed / 1 failed.
실패 1건은 내 잘못 — 자기신고 예시로 music_selection을 쓰던 테스트가 그 원자를
측정으로 바꾸면서 낡았다(부분 실행 `-k` 필터가 그 파일을 안 잡아 놓쳤다).
합성 원자로 고치고, **레지스트리에 자기신고가 되돌아오면 걸리는 상시 감시**
테스트를 추가했다. 관련 테스트 154건 통과.

## 2026-08-26 00:31 — 자산 심판 문턱 동결 (부분 등록)

사장님 승인: "문턱 동결해줘, 추천값 그대로". 등록 기록을
`data/asset_specs/asset_judge_v0.rules.yaml` 머리에 박았다.

- `status: registered_partial`, `registered_at: 2026-08-26T00:31:49`,
  `frozen_by: 사장님(대화 승인)`, `inherits_from: judge-bench-v1.1`.
- **동결 6건**: THRESH_PAL 0.005 / EDGE_ALPHA_MAX 0.05(초안 값) /
  THRESH_DUR 0.5초 / THRESH_SIL 0.10초 / PEAK_DBFS_MAX −1.5 dBFS /
  THRESH_SEAM 0.02.
- **미동결 9건 유지**: DROPOUT_MAX_S·DC_OFFSET_MAX + 세트 문턱 7개.
  근거가 없어 추천하지 않은 것들이다(잴 도구가 없거나 취향이 기준).
  null인 동안 그 규칙을 읽는 판정은 undefined — 설계대로다.
- **원칙 ① 확인**: 이 값들은 08-25 22:50 해부 문서 §5의 추천 그대로이고,
  **후보 자산을 채점하며 조정한 적이 없다**(그 뒤 돌린 것은 전부 내가 만든
  합성 픽스처). 근거를 `frozen_basis`로 파일에 남겼다.
- **숫자를 손으로 다시 적는 경로를 없앴다**: `genesis/asset_specs.py`의
  `frozen_spec(profile)`이 등록본에서만 값을 꺼낸다. 미동결 칸은 None으로
  그대로 넘어가 undefined를 만든다.
- **감시 테스트 3건**: 동결값이 소리 없이 바뀌면 실패(재등록 없는 변경 금지),
  미동결 항목이 근거 없이 채워지면 실패, 프로필이 등록본과 갈라지면 실패.
- 실판정 확인(00:32): 규격 배경이 등록본 문턱(0.005)으로 통과.

**직전 전체 스위트(23:55~00:10, 14분 47초): 832 passed / 0 failed.**

## 2026-08-26 08:43~08:56 — 아이콘 레인 실전 1회전: 루프가 처음으로 한 줄로 꿰였다

08-26 계획 ①. 어제까지 심판만 있고 후보가 없었다. 오늘 생성(외부 LLM)→심판 J→
위반 리포트 주입 재생성→통과분 저장이 **실물로** 돌았다. 신규 `tools/icon_lane_run.py`
(프롬프트·루프·필터만 있고 채점 로직은 0줄 — 심판은 전부 icon_judge 호출).

| 시각 | 한 일 | 결과 |
|---|---|---|
| 08:43 | 심판대 감사(어제 상태 확인) | real 11/이빨 11/자율 100% 그대로 |
| ~08:50 | 루프 구현 + **목 파일럿** + 테스트 19건 | 지출 0에서 라운드·중복·리포트 주입 검증 |
| 08:51:30 | 실전 1회전(save·inventory·map·settings, 후보 6) | 25후보 중 **15 통과 / 10 거절**, $0.022143 |
| 08:52:35 | 곡선 개념(potion·dialogue) | 4후보 전부 통과, $0.005755 |
| 08:53:13 | 재시도 루프 탐침 1차 | **HTTP 400으로 중단** (2호출 $0.004892는 원장에 남음) |
| 08:53:45 | 탐침 2차(같은 명령) | r1 3후보 전부 탈락 → **리포트 주입** → r2 통과. $0.005612 |
| ~08:55 | 심판 강화(아래) | 반례 45 → **49건** |
| 08:55:53 | 강화 심판으로 재실행 | 16후보 중 14 통과, **세트 4/4**, $0.016455 |

**총 지출 $0.054857 (76.8원, 14호출).** 계획서의 "약 $0.05"를 조금 넘겼다 —
심판을 고친 뒤 재실행한 몫($0.0165)이 계획에 없던 것이다.

### 실전이 잡아낸 것 — 심판의 구멍 하나

첫 회전 통과분 4개를 **눈으로 보려고 열었더니** 전부 `linecap="round"`
`linejoin="round"`로 적혀 있었다. 그건 SVG 속성이 아니다(`stroke-linecap`이 맞다).
스펙 §1은 요구했는데 **등록된 심판에는 그 규칙이 없었다** — 프롬프트에는 있고
심판에는 없는 항목이었다. 통과 도장은 찍혔지만 실제로는 각진 선끝이 나온다.

- 원자 `icon_spec_fit`에 `stroke.linecap`·`stroke.linejoin` 규칙 2개 추가.
- 반례 4건 등록(butt / miter / **속성 이름 오타로 미지정** 2종). 45 → 49건.
- 강화 직후 첫 회전 통과분 4개를 다시 재니 **전부 FAIL**. 도장이 틀렸던 것을
  숫자로 남긴다(`out/icons/rpg-ui-v1` = 강화 전 통과분, 지금은 탈락 증거).
- 재실행분 `out/icons/rpg-ui-v1-strict` 4개는 강화 심판으로 4/4 통과.

이게 실전 1회전의 값이다: **후보를 안 만들면 심판의 구멍도 안 보인다.**

### 3값 정정 — 못 잰 것은 탈락이 아니다

`icon_judge.judge_svg`가 `all(r["ok"])`로 접혀 있어서 **미정의(ok=None)가 fail로**
떨어지고 있었다. 심판대 규율 4·5(문턱 미동결·미측정 = undefined)와 어긋난다.
PASS/FAIL/**UNDEFINED** 3값으로 고치고, 리포트에 `undecided:` 절을 새로 냈다
(고칠 것을 시키지 않고 사실만 적는다). 루프도 미정의 후보에겐 최소수정을
요구하지 않고 사유 없는 구조 변경으로 넘어간다.

### 굿하트 대응이 코드로 남았다

- **hidden 미주입**: 프롬프트는 spec 문서의 `public` 가지에서만 만들고,
  `_assert_no_hidden_leak()`이 생성 직전 프롬프트를 검사한다. 금지어를 손으로
  적은 목록이 아니라 **spec 문서에서 열쇠말을 뽑으므로** hidden이 늘면 검사도 는다.
- **중복 서명**: 알리지 않고 그 후보만 버린다(§6). 세트 안 중복 0.
- **리포트 덕인지 운인지**: 목이 리포트 없이는 계속 어기도록 만들어, 통과가
  주입 덕이라는 것을 테스트로 고정했다.

### 정직하게 남긴 것

- **재시도 루프의 실전 증거는 탐침 스펙에서 나왔다.** 등록 스펙(icon-24-line-v1)
  으로는 6개념 모두 1회차에 통과해서 재시도가 안 걸렸다. 일부러 좁힌 탐침 스펙
  (`data/icon_specs/icon-24-line-hard-probe.yaml`, 격자 1.0·여백 3·패스 2)으로
  1회차 전탈락을 만들어 r1→r2 수정을 확인했다. **탐침은 상품 스펙이 아니다.**
- **HTTP 400 한 건의 원인 미상.** 같은 명령을 그대로 다시 돌리니 통과했다.
  일회성으로 보이지만 원인을 모르므로 재시도 로직을 넣지 않았다 — 대신 응답
  본문을 삼키지 않고 오류에 실어 올리게 고쳤다.
- **"저장처럼 보이나"는 여전히 기계 심판 없음.** 사람 눈 게이트용
  `tools/icon_preview.py`(판정은 만들지 않고 icon_judge 판정을 옮겨 적는 한 장)
  를 만들어 사장님께 보냈다.
- **개념 6개는 내가 골랐다**(save·inventory·map·settings·potion·dialogue).
  파이프라인 시험용 기능 아이콘이고, 창작 방향이 아니다. 실제 세트 목록은
  사장님 몫이다.
- contrast·roundtrip·optical_weight_delta는 그대로 미측정.

## 2026-08-26 09:05~09:16 — 골든 v1 / observed 등급 / 오디오 확장 (사장님 결정 A·C·D)

계획서의 사장님 몫 넷 중 셋이 답을 받았다: A=오늘 만든 아이콘을 표본으로,
C=observed 승인, D=librosa. (B는 "계획대로"로 진행했다.)

### ② 골든 v1 — 판정 NO-GO (docs/icon-golden-v1-brief.md)

`tools/golden_bench.py` 신규. 표본은 **먼저 매니페스트에 고정**하고
(`data/goldens/icon-v1.json`, 사후 표집 금지) 돌린다.

| 통제 | n | 값 | 문턱 | 결과 |
|---|---|---|---|---|
| positive | 4 | 통과율 1.0000 | ≥0.90 | 문턱 OK, **표본 4 < 10** |
| negative | 40 | 탈락률 1.0000 | ≥0.90 | 통과 |
| null | 24 | 통과율 **0.1250** | ≤0.05 | **미달** |

- positive는 **우리 심판이 통과시킨 파일**이라 구조상 1.0이다(순환). 이 숫자는
  심판에 대해 아무 말도 안 한다 — 브리프에 그렇게 적었다.
- null 통과 3쌍은 전부 **진짜로 맞는 짝**이었다(정수 좌표라 격자 1.0도 만족 /
  `<path>`가 실제로 1개). 결정론적 적합 심판에서 무작위 재짝지음이 우연히
  맞을 수 있다는 뜻이고, 초안 §7이 null을 model_based 전용 관문이라 한 이유다.
- **숫자를 본 뒤에 통제 설계를 고치지 않았다.** 고치려면 재등록이 필요하므로
  G1·G2·G3 세 결정을 브리프에 남겼다.
- 부수 발견: `path.max_count`는 `<path>`만 센다. `rect`·`circle`은 무제한이다.

### ④ observed.* 등급 + 추출기 G (승인 C)

증거 이름공간이 넷이 됐다: `spec` / `measured` / **`observed`** / `claim`.

- `judge_bench.evidence_grade`: measured > observed > claim_only. observed는
  **자율 근거가 아니다**(자율 100%는 measured 11건 그대로).
- `reads_observed()`로 "등급은 measured인데 observed도 읽는" 경우를 드러낸다.
- **null 통제 관문**: `data/observed_controls.json`에 등록되지 않았거나 통제
  미통과인 observed 필드를 읽는 규칙은 fail이 아니라 **undefined**
  (`observed_gate` → Unjudgeable). 지금 등록된 필드는 **0건**이고, 손으로
  채우면 걸리는 테스트를 뒀다.
- `tools/extractor_g.py`: 3회 물어 **과반**이면 값, 갈리면 값 없음.
  선택지 밖의 답은 버린다(비슷한 말로 끼워 맞추지 않는다). 미결정은 키를
  아예 만들지 않는다 — None으로 채우면 하류가 "값이 있다"고 착각한다.
- 목만 돌렸다. 실 호출은 지출 승인 후.

### ⑤ 오디오 확장 (결정 D: librosa)

`librosa 1.0.0` + `soundfile 0.14.0` 설치. `genesis/audio_probe.py` 신규,
어댑터 `music_asset_ext` 등록(선언만 하고 못 재는 상태를 막는다).

- 새로 재는 것: **BPM**(비트 추적) / **조성**(크럼한슬-슈머클러 상관) /
  **참피크 dBTP**(4배 오버샘플, BS.1770 방식) / **비WAV 디코딩**(libsndfile).
- 실측 확인(09:14): A장3화음 + 0.5초 클릭 합성음 → `bpm 117.45`
  (클릭 120), `key A major`(2위 C# minor, 차 0.119), `true_peak -1.993 dBTP`.
- **조성은 1·2위 상관 차가 0.05 미만이면 값을 내지 않는다**(미결정).
  평평한 크로마를 넣으면 조성을 말하지 않는 것을 테스트로 고정했다.
- **LUFS는 여전히 미측정.** 게이트된 라우드니스는 librosa에 없다. RMS를 LUFS라
  부르지 않는다 — 이름은 있고 값은 None이며 이유가 붙는다(pyloudnorm을 깔면
  닫히지만, 사장님이 고른 것은 librosa라 임의로 늘리지 않았다).
- BPM 배수 오검출은 해결되지 않았다. 0.5x·1x·2x 후보를 같이 내고 판정은
  undefined 규칙 그대로다.

## 2026-08-26 09:26~09:33 — 선별 세션: 마지막 칸을 사람에게 넘겼다

사장님 지시: **"인간한테 중간에 결과물을 주고, 인간이 선택하는 대로 심판자 구성."**

지금까지 파이프라인의 마지막 칸은 *기계가 첫 통과분을 채택*이었다. 그게 오전
골든이 순환에 빠진 이유이기도 하다(positive가 우리 심판이 고른 것). 그 칸을 비웠다.

### 바뀐 것

- `icon_lane_run`: 통과 후보를 **전부** `candidates/`에 남긴다. `--defer-pick`이면
  대표 파일을 아예 쓰지 않는다(`picked_by: null`). 오전 회전에서 통과 14개 중
  6개만 남기고 버린 것이 이 구멍이었다.
- `tools/pick_session.py` 신규: `sheet`(번호 붙인 판) / `record`(선택 기록).
  **보여준 것 전부**를 남기고, 보여주지 않은 번호는 고를 수 없으며, 기존 기록을
  덮어쓰지 않는다. 안 고른 17개는 **사람이 보고 안 고른 반례**다.
- 선별 1회차(09:30): 21후보 중 `01_save=3 02_inventory=5 03_map=5 04_settings=5`.

### 사전 등록 → 실행 (docs/taste-judge-v0-design.md)

**선택을 보기 전에** 특징 10개·규칙 꼴(단일 특징 문턱)·분할(개념 단위 LOCO)·
수용 관문(적중률≥0.75 ∧ p<0.05 ∧ 개념≥8·후보≥40)을 얼렸다. 그리고 §5에
"이번 표본으로는 승격 불가"를 미리 적었다.

결과(09:31): **NO-PROMOTE**. LOCO 적중률 0.25, 순열 p=0.323, 표본 미달.
훈련에서 뽑힌 규칙은 `command_count >= 11.5` 계열(훈련 0.79~0.89)인데 남겨둔
개념에서 4번 중 1번만 맞혔다 — 과적합의 표준 그림이다. **관문을 낮추지 않았다.**
`taste_fit_icon`은 human_gate로 남는다.

### 덤: HTTP 400의 원인이 밝혀졌다 (오전 보고 정정)

09:26에 재현됐고 본문이 나왔다 — `temperature: range: 0..1`. **설계 §6의 3회차
temp 1.3은 이 API에서 부를 수 없다.** 08:53 탐침 1차의 400도 이것이었다
(그 라운드가 3회차였다). 설계를 조용히 고치지 않고, 제공자가 `max_temperature`로
깎되 **깎았다는 사실을 라운드 기록에 남기게** 했다
(`temperature_requested` / `temperature_capped`). 오전에 "원인 미상"이라고 적은
것을 여기서 정정한다.

### 오늘 실 지출 누계

icon_lane **$0.086991 (20호출, 121.8원)** — 오전 회전 $0.054857 + 선별 풀
$0.024801 + **temp 1.3으로 죽은 09:26 시도 $0.007333**(2호출은 성공해 원장에
남았고, 3회차에서 400으로 끊겼다). 죽은 시도의 비용을 빼고 적지 않는다.

## 2026-08-26 09:37~09:50 — 풍경 레인: 생성자만 다른 회사 것으로 갈아끼운다

사장님: **"풍경 같은 것도 해봐. 다른 AI 불러들여서, 챗지피티나."**
결정 셋: 생성자 = OpenAI 이미지 API(키는 사장님이 파일에 추가), 방향 = 픽셀 RPG
배경, 예산 = $0.40까지.

### 골격은 그대로, 매체와 생성자만 바뀐다

`tools/image_lane_run.py` 신규. 아이콘 레인이 증명한 순서를 그대로 쓴다:
생성(외부 AI) → 후처리(격자 정합) → 기계 심판 → **사람이 고름**.
**심판은 한 줄도 안 바뀌었다** — `pixel_art_style` 원자와
`asset_probe.measure_pixel_art`를 그대로 부른다. 이게 "우리 자산은 심판뿐,
생성기는 교체 가능"이라는 주장의 첫 실증이다.

숫자는 전부 사장님이 **08-07에 동결한 아트 기준**에서 왔다
(docs/game-design-v0.md §1b: 뷰포트 640×360, 에셋당 색 ≤24, 반입 오라클).
`data/image_specs/pixel-bg-v1.yaml`의 `frozen_basis`에 그 출처를 적었다.
내가 고른 값은 없다.

### 목 파일럿이 잡아낸 것 — **후처리 뒤의 반입 오라클은 거의 공허하다**

목이 낸 '가짜 도트'(연속 그라데이션, 색 65,536)를 재보니:

| | block | logical | colors | 판정 |
|---|---|---|---|---|
| 원본 | 1 | 640×360 | 65,536 | **FAIL** |
| pixelize 후 | 1 | 640×360 | 22 | **PASS** |

우리가 격자·색 수·알파를 맞춰 만든 파일이니 당연히 통과한다. 즉 후처리본에 대한
이 심판은 **거의 아무것도 거르지 못한다**. 그래서 원본과 후처리본을 **둘 다 재고
따로 적는다**(`raw_verdict` / `verdict`). 생성기가 진짜 도트를 냈는지는 원본만
말한다. 후처리본의 진짜 관문은 (a) 사람 선별과 (b) 아직 **미동결**인 마스터
팔레트다(§1b: "스타일 확정 화면에서 추출해 동결" — 그 화면이 아직 없다).

이건 "④의 경계는 이미지가 아니라 **주관적** 이미지"라는 아이콘 문서의 주장이
풍경에서 다시 확인된 것이기도 하다.

### 선별 세션은 매체를 가리지 않는다

`pick_session`이 PNG도 읽는다(데이터 URI로 박고 `image-rendering: pixelated`로
도트를 뭉개지 않는다). 아이콘이든 풍경이든 고르는 절차는 하나다.

### 지출·상태

실 호출 0. `OPENAI_API_KEY`가 아직 없어 유료 경로가 잠겨 있다 — 목 파일럿만
돌렸다(테스트 15건 통과). 키가 들어오면 그대로 실행한다. 단가표에 없는
모델·품질 조합은 **부르지 않고 거부**하고, 예산 검사는 호출 **전에** 한다.

## 2026-08-26 09:52~10:02 — 픽셀랩 자산 반입: 26장 중 원본 통과 **2장**

사장님: "픽셀랩 자산으로 먼저 돌려봐." OpenAI 키가 아직 없어 풍경 실호출이
잠긴 동안, **우리가 부르지도 않은 생성기**(PixelLab, 08-07 오디션)의 산출물로
같은 골격을 돌렸다. 지출 0. 신규 `tools/asset_intake.py` +
`data/image_specs/pixel-sprite-v1.yaml`(숫자는 전부 08-07 동결 아트 기준).

### 심판이 남의 자산에도 그대로 물었다

| 그룹 | 부류 | 원본 통과 | 걸린 이유 |
|---|---|---|---|
| 고양이 5 | character | **1/5** | 64×64(≤32 초과) 3장, 색 25개(≤24) 1장 |
| 타일 16 | tile | **1/16** | 크기는 16×16 정확, **색 25~38** |
| 상인 4 | character | **0/4** | 48×48 |
| 아이콘 1 | icon | **0/1** | 64×64(≤16) |

**심판 코드는 한 줄도 안 바뀌었다** — `pixel_art_style` 원자를 그대로 불렀다.
생성기 교체 가능성의 두 번째 실증이다(첫 번째는 OpenAI용 코드 경로).
`tileset_12`는 25색, **기준을 1색 넘겨** 떨어졌다.

### 후처리를 걸면 26/26 — 오전에 본 그림과 같다

선언된 후처리(pixelize, 비율 유지 축소 + 24색 양자화) 뒤 전부 통과.
**원본 통과 2 · 우리가 고쳐서 통과 24**를 따로 세어 기록한다(`raw_verdict`).
고친 것이 통과하는 건 당연하므로, 남는 진짜 관문은 사람 선별이다.

### 선별 1회차(사장님, 10:00) — 기록은 됐지만 **심판 재료로는 0**

`01_cat=2,3`(둘 다) / `02_tileset=전부`(16장) / merchant·icon 미판정.
고른 것 18 / 반례 3 / 미판정 5 / 보여준 것 26.

취향 시험대 판정: **NOT-MEASURED**. 이유를 셋 다 적는다.
1. **PNG는 사전 등록된 특징이 없다.** 특징 10개는 SVG용으로 얼린 것이다.
   그림용 특징을 지금 만들면 그게 곧 사후 기준이 된다 → 숫자를 만들지 않는다.
2. **다중 선택은 top-1로 못 잰다**(01_cat=2,3).
3. **"전부"는 반례가 0이다.** 선별의 정보는 고른 것과 안 고른 것의 **대비**에서
   나온다. 전부 고르면 대비가 없다 — 반입 결정으로는 유효하지만 심판을 못 짓는다.

### 이 과정에서 고친 기록 버그

미판정 그룹(참고용 merchant·icon)의 후보가 **`rejected`로 들어가고 있었다**.
사장님이 보고 거절한 것과, 애초에 고르는 자리가 아니었던 것이 섞이면 반례가
거짓말이 된다. `undecided_items`로 분리했다(테스트 2건 추가). 이번 세션에서
5장이 거짓 반례가 될 뻔했다.

## 2026-08-26 오전~낮 — 저녁 큐 착수 (계획서 B0~B6, 지출 0)

사장님 "시작"(10:38). 오늘 아침 계획서 `docs/plan-2026-08-26-evening.md`의
백그라운드 큐를 순서대로 돌렸다. **실 API 호출 0건, 지출 $0.**

### B0 — 루프 속도: 23분 42초 → **11분 57초**

`pytest-xdist` 설치 후 `-n 4`(코어 4개). 925 passed / 1 skipped.
계획서가 예상한 8분에는 못 미쳤고, `--durations=20`이 이유를 보여줬다.

| 가장 느린 테스트 | 시간 |
|---|---|
| `test_mine.py::test_known_positive_qualifies` | 184초 |
| `test_mission6.py::test_evolution_mechanics_and_audit[K]` | 159초 |
| `test_service_multi.py::test_mock_mode_runs_without_api_or_spend` | 90초 |
| `test_loop.py::test_resume_continues_not_restarts` | 86초 |

전체 CPU 시간이 약 24분이므로 4워커의 이론 바닥은 6분인데 12분이 나왔다 —
일이 고르게 안 나뉜다. `--dist worksteal`로 재측정: **13분 5초로 오히려 느렸다**
(951 tests). 기본 `-n 4`(dist=load)로 확정.

남은 길은 하나이고 **사장님 결정 사항**이다: 상위 4건이 전부 연구 레인
(mission6·loop·mine — 08-25에 주력 아님으로 정리한 쪽)이다. 주력 레인만 도는
상시 게이트를 따로 두면 3분대가 되지만, 그건 "전체를 안 돌리게 되는" 바로 그
위험을 제도화하는 것이라 임의로 하지 않는다.

### B1 — 래스터라이저: 미측정 3칸 중 2칸을 열었다

사전 등록 `docs/icon-raster-rules-design.md`(정의를 숫자보다 먼저 얼렸다).

- **도구 경로**: `cairosvg`(Cairo DLL)를 피해 `svglib`+`reportlab`으로 갔더니
  **reportlab 5.x가 래스터 백엔드를 떼어내 `rlPyCairo`를 요구**했다 — 같은
  함정을 한 겹 뒤에서 다시 만났다. 확정 경로는
  **SVG → svglib → reportlab PDF → `pypdfium2`**(휠 하나, 시스템 DLL 없음).
- `genesis/svg_raster.py` + 어댑터 `svg_raster` + 심판 규칙 2건:
  - `roundtrip.max_pixel_diff` (hidden, 문턱 0.02 동결값): **우리 파서가 다시
    써낸 SVG**와 원본을 각각 96px로 그려 픽셀 차이를 잰다. 결합 검사의 그림
    판이다 — 파서가 렌더러와 다른 그림을 보고 있으면 `measured.*` 전체가
    그 자리에서 거짓이 된다. 통과분 실측 0.0.
  - `set_consistency.optical_weight_delta` (문턱 0.15 동결값).
- **`contrast`는 영구 미측정으로 선언**했다. 래스터라이저 문제가 아니었다 —
  팔레트가 `currentColor`뿐이라 **아이콘 파일에 색이 없고**, 대비는 자산이
  아니라 **사용처**의 성질이다. 내가 전경색을 정하면 4.5는 자산과 무관하게
  자동 통과/자동 탈락한다. 그건 심판이 아니라 상수다.
- 구현 중 실측으로 잡은 내 결함 하나: 회색조 렌더는 **색의 밝기까지** 담아서
  같은 X자가 검정 0.0905 / 빨강 0.0636으로 갈렸다. 시각 무게가 그림이 아니라
  색을 재고 있었다 → 렌더 전에 색을 하나로 정규화하도록 고쳤다.
- 문턱 0.15에 대한 실측 기록: 획 굵기를 2.7배(1.5→4)로 키워도 폭이 0.118로
  문턱 아래다(4배쯤 돼야 넘는다). 다만 공개 스펙이 굵기를 1.5로 못박으므로
  이 규칙이 실제로 지키는 축은 **밀도**이고 거기서는 이빨이 있다(점 하나
  0.0055 vs 가로줄 6개 0.3300 → 폭 0.325). 조일지는 사장님 결정으로 남긴다.

### B2 — 그림(PNG) 취향 특징 사전 등록

`docs/taste-judge-image-v0-design.md` + `genesis/image_taste_features.py`.
오전에 PNG가 NOT-MEASURED로 막힌 세 이유를 전부 설계에서 처리했다.

1. 특징 10개 동결(색 수·불투명 비율·bbox 채움·채도·명도·명암 폭·경계 밀도·
   좌우 대칭·최빈색 비중·외곽 비율). 정규화 = 정수배 확대본은 논리 격자로
   내려서 잰다(확대본과 원본이 다른 값을 내면 그림이 아니라 저장 방식을 재는
   셈이다 — 테스트로 고정).
2. 다중 선택은 top-1로 못 재므로 **쌍 비교 적중률**로 바꿨다(동점은 실패로 셈).
3. "전부 채택" 그룹은 유효 쌍이 0이라 **세지 않되 개수를 표기**한다.
   `undecided_items`는 후보로 세지 않는다.

관문: 유효 그룹 ≥8, 후보 ≥40, 유효 쌍 ≥60, 적중률 ≥0.75, 순열 p<0.05.
지금 표본(pixellab-v1)은 유효 그룹 **1개**라 NOT-MEASURED가 그대로다.

### B3 — 골든 G1~G3 결정 메모

`docs/golden-null-control-memo.md`. 셋 다 지출 0. 요지만:

- **G1**: positive를 6개 더 생성해 10건을 채우는 건 순환을 10건으로 키우는
  것뿐이다. 사유를 "표본 부족"이 아니라 **"positive 출처가 심판 자신이라
  측정 불가"**로 정정하고, 채우는 건 심판 바깥 출처 SVG가 생길 때.
  오전 PixelLab 26건은 그 형태이지만 **PNG라 아이콘 골든엔 못 쓴다**
  (옮겨 쓰면 순환 대신 출처 위조).
- **G2**: 아이콘 심판에 `model_based` 필드가 0건이므로 null은 미달이 아니라
  **해당 없음**. 0.125는 그대로 남기고, 아까운 (c)는 `spec_sensitivity`라는
  다른 이름·다른 문턱으로 사전 등록해 별도로 잰다.
- **G3**: `shape.max_count` 신설(문턱 먼저 동결 → 반례 등록 → 03_map이 떨어져도
  정상).

### B5 — 마스터 팔레트 추출기

`tools/palette_extract.py`. 뽑기만 하고 `status: proposed / frozen: false`로
못박았다. 스펙 파일에 색을 쓰지 않고, 상위 N을 넘긴 색도 버리지 않고 개수와
픽셀 비중을 같이 적는다(자를지는 보는 사람이 정한다).

### B6 — observed null 통제 하네스

`tools/observed_null.py`. 등록 절차가 이제 코드다.

- 자산과 라벨을 **어긋나게** 짝지어도 맞아떨어지면 그 필드는 자산을 보고 있는
  게 아니다 → 일치율 ≤ 0.05일 때만 등록.
- **목 실행은 등록 거부**(절차 시험일 뿐 증거가 아니다). 문턱은 등록부에서만
  읽고 명령줄로 못 낮춘다.
- **라벨이 쏠린 표본은 fail이 아니라 undefined**다. 우연 바닥을 먼저 계산해서
  문턱을 넘으면 "표본을 고르게 모으라"고 말한다 — 아이콘 골든 null 0.125가
  정확히 그 함정이었다(§G2). 같은 함정을 두 번 밟지 않게 코드로 막았다.

### 정직하게 남기는 것

- B1~B6은 전부 **측정기 늘리기**다. 오늘 가장 중요한 숫자는 여전히 취향
  시험대의 NO-PROMOTE이고, 그건 사장님 선별(P1) 없이는 안 움직인다.
  아이콘 48후보(개념 8·후보 48, 선지출 $0.046)는 계속 대기 중이다.
- `contrast`는 이제 "도구가 없어서"가 아니라 **"정의가 불가능해서"** 미측정이다.
  둘은 다른 상태이고, 리포트도 그렇게 구분한다.

## 2026-08-26 낮 — 사장님 결정 2~4 실행 (지출 0)

"2부터 4까지 다해"(11:31). 앞선 큐에서 사장님 결정으로 남겨둔 세 건.

### 2. 골든 G1~G3 — 관문이 하나에서 둘로

**계약을 먼저 커밋하고**(be31142, `docs/golden-decisions-20260826.md`) 그 다음에
숫자를 냈다(9bd22f2). 재주행 결과는 `docs/icon-golden-v1-brief.md` §6.

| 통제 | n | 값 | 결과 |
|---|---|---|---|
| positive | 4 | 1.0000 | **측정 불가**(출처=self, 순환) |
| negative | 40 | 1.0000 | 통과 |
| null | 24 | 0.1250 | **해당 없음**(model_based 0건) |
| **spec_sensitivity** | 20 | **1.0000** | **통과** ★ 새 관문 |

전에는 세 통제 중 심판에 대해 실제로 말하는 것이 negative 하나였다(positive는
순환, null은 이 심판에 적용되지 않는 관문). 이제 둘이다. `spec_sensitivity`는
자산이 **정의상 어기는** 스펙을 잰 값에서 구성해(획+0.5, path 상한−1, 명령
상한−1, 여백 하한+1, 바이트 상한−1) 판정이 FAIL로 뒤집히는지 본다. 20/20 —
**심판이 스펙을 실제로 읽는다.** 통과 도장만 찍는 심판은 0이 나온다(반례 테스트로
고정). 문턱 0.90은 값을 계산하기 전에 얼렸고, negative와 같은 자리의 숫자다.

판정은 여전히 **NO-GO**다. 집계 대상 둘 다 통과했지만 positive가 측정 불가이고,
**못 잰 관문을 통과로 접지 않는다**. positive를 열려면 심판 바깥 출처의 SVG가
필요하다.

G3 `shape.max_count=6`도 등록(반례 49→50, 자율 100% 유지). 예고했던 `03_map`
탈락은 **없었다** — 도형 3개로 상한 안이다. 브리프 §4가 잡은 것은 규칙의 구멍
(rect·circle을 아예 안 셈)이었지 그 자산의 위반이 아니었다.

곁들여 렌더 메모이즈: 골든 테스트 55.4초 → **4.9초**. 같은 자산을 스펙만 바꿔
여러 번 채점하는데 그림은 스펙과 무관하다.

### 3. `contrast` — 자산에서 화면 층으로 (권고 b 채택)

스펙의 `hidden.contrast`를 새 구획 `screen_layer`로 옮겼다(`owner: ui-theme`,
`status: deferred`). 아이콘 심판은 이제 이 항목을 미측정 목록에 **올리지 않는다**.

    미측정(도구 없음): 없음
    화면 층으로 이관(자산 심판 아님): contrast

"못 쟀다"(도구 부재)와 "여기서 잴 것이 아니다"(층이 다름)는 다른 상태이고,
섞으면 계기판이 거짓말을 한다. 프롬프트 금지어에서는 빼지 않았다 — 지금
관문이 아니어도 이름을 흘리면 나중에 그 지표만 겨냥한 출력이 온다(굿하트는
층을 가리지 않는다). 누출 검사가 `screen_layer`까지 훑도록 넓혔다.

### 4. 스위트 — 게이트는 줄이지 않고, 안쪽 반복만 빠르게

`docs/test-loop-policy.md`로 동결.

| | 명령 | 시간(같은 조건 연속 측정) | 건수 |
|---|---|---|---|
| 상시 게이트 | `pytest -n 4` | 8분 18초 | 982 |
| 안쪽 반복 | `pytest -n 4 -m "not slow"` | **5분 6초** | 968 |

아낀 시간은 3분 12초(38%)이지 몇 배가 아니다 — 느린 14건을 빼도 남는 968건이
5분을 먹는다. 이 스위트의 무게는 괴물 몇 마리가 아니라 **부피**에도 있다.
그리고 측정 자체가 ±30%쯤 흔들린다(같은 테스트가 184초 → 109초). 한 번의
측정으로 "빨라졌다"고 말하지 않기 위해 그 표를 정책 문서에 남겼다.

`-m "not slow"`는 **기본값이 아니다**. `addopts`에 넣지 않았고, 넣지 못하게
막는 테스트를 뒀다(`test_default_run_does_not_deselect_slow_tests`). 느림의
정의는 잰 값이다 — `data/slow_tests.json`은 `tools/slow_tests.py`가 pytest
durations 로그에서만 만들고, 표식은 `conftest.py`가 자동으로 붙인다. 사람이
"느릴 것 같다"고 붙이기 시작하면 부분집합이 측정이 아니라 인상이 된다.

느린 테스트를 **지우지는 않았다**. 상위 4건은 전부 연구 레인이고 주력은
아니지만, 그 결과가 현재 설계의 근거다. 느리다는 이유로 증거를 지우지 않는다.

## 2026-08-26 12:1x — 스펙 민감도를 모든 레인으로 (지출 0, 사람 손 0)

사장님: "고르는 거 그만하고 자동으로 계속할 수 있는 거 해." 선별(P1)은 정의상
사람 손이 필요하니 접고, 사람 없이 굴러가는 쪽 — **심판** — 을 밀었다.

오늘 골든에서 처음 세운 관문 `spec_sensitivity`가 아이콘 레인 하나에만
있었다. 이걸 레지스트리 전체로 일반화했다(설계 `docs/spec-sensitivity-v1-design.md`
를 **먼저** 커밋: 0a890f2).

### 이빨과 무엇이 다른가

| | 비트는 것 | 묻는 것 |
|---|---|---|
| 이빨(반례) | `measured.*` (후보 쪽) | 스펙을 어긴 후보를 떨어뜨리나 |
| 스펙 민감도 | `spec.*` (설계도 쪽) | **설계도가 바뀌면 판정이 따라 바뀌나** |

이게 연출가 라인의 심장과 같은 질문이다. 우리 판정은 "절대적으로 좋은가"가
아니라 "**사장님이 정한 설계도에 맞나**"이므로, 설계도가 바뀌었는데 판정이
그대로인 심판은 정의상 심판이 아니다.

### 결과 (`tools/spec_sensitivity.py`, 기록 `data/spec_sensitivity_20260826.json`)

| 원자 | 구성 | 뒤집힘률 |
|---|---|---|
| spec_fit_art_selection | 5 | 1.00 |
| icon_spec_fit | 12 | 1.00 |
| music_selection | 6 | 1.00 |
| game_feature_coding | 3 | 1.00 |
| pixel_art_style | 4 | 1.00 |

**채점 5건 전부 통과, 구성 30개, 문턱 1.0.** 다섯 레인의 심판이 전부 설계도를
실제로 읽는다.

정직하게 남기는 것: **미정의 6건**. `set_membership`·`numeric_delta`·
`threshold_match`·`hash_pairs`·`forbidden_absent` 종류는 규칙 목록이 아니라
종류별 params를 쓰므로 아직 구성 규칙이 없다. "우리 레인 전부 통과"라고
말하지 않으려고 통과로도 미달로도 세지 않았다.

문턱을 아이콘 골든의 0.90이 아니라 **1.0**으로 얼린 이유: 거기는 자산 4장 ×
구성 5개의 표집이고 여기는 표본 하나에 대한 결정적 구성이라 잡음이 없다.
한 규칙이라도 안 뒤집히면 그 규칙이 스펙을 안 읽는다는 뜻이고, 비율로 덮을
일이 아니다.

이 검사 자체의 이빨도 테스트로 박았다 — 통과 도장만 찍는 심판을 넣으면
뒤집힘률 0.00으로 미달이 나온다. 미정의는 뒤집힘으로 세지 않는다(그렇게 세면
"미측정 = undefined" 규율이 거꾸로 뒤집힌다).

### 이어서 — 미정의 6건 중 5건을 열었다 (부록 A)

방금 "미정의"로 남긴 6건의 params를 열어보니 **넷은 설계도 쪽이 있었다**.
부록 A를 뒤집힘 결과 **보기 전에** 등록하고(6637fbc) 구성기를 종류별로 붙였다.

| 종류 | 설계도 입력 | 구성 |
|---|---|---|
| `set_membership` | `params.rule` | 규칙에서 적중 제거 / 규칙에 미적중 추가 |
| `numeric_delta` | `params.min_delta` | 임계를 실제 차이 초과로 |
| `threshold_match` | `params.min_value` | 임계를 올려 적중 제외 / 내려 미적중 포함 |
| `forbidden_absent` | `params.forbidden` | 금지 목록에 **본문에 있는 낱말** 추가 |
| `hash_pairs` | **없다** | — |

| 원자 | 구성 | 뒤집힘률 |
|---|---|---|
| dangerous_permission_scan | 2 | 1.00 |
| phishing_link_check | 1 | 1.00 |
| cache_cleanup | 1 | 1.00 |
| large_file_finder | 2 | 1.00 |
| spec_fit_story_selection | 1 | 1.00 |

**채점 5건 → 10건, 전부 1.00, 구성 30개 → 37개. 미정의 6건 → 1건.**

남은 하나 `duplicate_file_finder`(hash_pairs)는 **설계도가 관여하지 않는
심판**이다 — `measured.hashes`와 `claim.pairs`의 자기일관성만 본다. 억지로
설계도를 붙여 통과로 만들 수 있었지만 안 했다. 사유를 "구성 규칙 없음"이
아니라 "설계도 입력이 없는 심판"으로 정확히 적었다. 결함이 아니라 성질이다.

표본 요건은 종류마다 다르게 얼렸다: `spec_conformance`는 최소 3개(규칙이 여럿인
심판에서 한둘만 보는 것을 막는다), 부록 종류는 **최소 1개**다 — 이쪽 구성은
그 심판이 가진 설계도 입력을 **전수로** 덮으므로 표집이 아니라 전수 검사다.
`phishing_link_check`처럼 적중이 1건뿐이라 "적중 제거"가 공허한 샘플을 만드는
경우는 구성 불가로 적고 세지 않는다.

### 그리고 설계도 엔진에 물렸다 (부록 B)

민감도를 재고 표에 적어두는 것으로 끝내면 계기판일 뿐이다. **설계도가 고객에게
하는 약속**에 연결했다(계약 8ead30a, 새 숫자 없음).

`tools/blueprint_engine.py`의 기계 체크리스트 자격이 두 축에서 셋으로 늘었다:

1. 이빨 — 자기 반례를 거절하는가
2. 재료가 측정값이고 잴 어댑터가 있는가
3. **그 심판이 설계도를 읽는가** ← 오늘 추가

설계도를 바꿔도 판정이 그대로인 심판을 체크리스트에 넣으면 "사장님 설계도대로
기계가 채점합니다"가 거짓이 된다. 이제 그런 심판은 `human_gate`로 내려간다
(반례 테스트로 고정: 특정 원자의 민감도를 fail로 만들면 체크리스트에서 빠진다).

설계도 입력이 **없는** 심판(중복 파일 찾기 = 자기일관성 검사)은 빼지 않았다.
이빨도 측정 재료도 갖췄고 기계가 채점하는 것도 맞다. 대신 고객 화면에 정확히
적는다:

```
  (b) 기계 체크리스트 (커버리지 60%, 그중 설계도를 읽는 심판 67%)
      - cache_cleanup ...
          설계도 읽음: 구성 1개 전부 판정이 따라 바뀜
      - duplicate_file_finder ...
          ※ 설계도가 아니라 자기일관성으로 채점됨
```

약속을 부풀리지 않는 방법은 항목을 빼는 게 아니라 **무엇으로 채점하는지 밝히는
것**이다. 비전 층에 `spec_sensitive_coverage`가 새로 나간다 — `machine_coverage`가
"혼자 굴러가는 비율"이라면 이건 "**사장님 설계도를 따라** 굴러가는 비율"이다.

## 2026-08-26 13:2x~13:5x — LUFS: 미측정 칸 하나를 계측기로 채웠다 (지출 0)

08-25 결산의 "정직하게 남긴 것"에 있던 **LUFS 미측정**을 지웠다. 의존성 결정(D)을
기다리는 대신 **ITU-R BS.1770-4를 직접 구현**했다(`genesis/loudness.py`,
설계 `docs/lufs-v0-design.md`를 먼저 커밋: 3521705).

직접 구현한 이유: 그 표준은 필터 계수와 게이팅 절차가 전부 적혀 있어 추정이
아니라 **옮겨 적는 계산**이고, 우리가 구현하면 정답을 **외부 기준으로 검증**할
수 있다. 새 의존성도 없어 표준 라이브러리만으로 돈다(= librosa 없는 기계에서도
WAV는 잰다).

### 검증 — 남의 구현이 아니라 표준으로

| 기준 | 결과 |
|---|---|
| BS.1770-4의 48 kHz 계수표 | 아날로그 원형에서 계산한 값이 **자릿수까지 일치** |
| EBU Tech 3341 시험 1 (스테레오 1 kHz −23 dBFS → −23.0 LUFS) | **−22.993** |
| 게이팅 이빨 (소리 3초 + 무음 6초) | −23.216 (게이트 없으면 −27.8) |

### 사전 등록한 기대값이 틀렸다 — 그대로 남겼다

설계 §3에 "스테레오 전체진폭 사인 = −0.691 LUFS"라고 적었는데 실제로는 **+0.007**
이 나왔다. 원인은 구현이 아니라 **내 산수**였다: K-가중은 1 kHz에서 이득이 0 dB이
아니라 **+0.6977 dB**이고, 표준의 상수항 −0.691은 바로 그것을 상쇄하는 값이다.

문턱을 결과에 맞춰 옮기는 것과 구분하려고 §3-A에 정정을 **덧붙이고 원래 표는
지우지 않았다.** 기대값을 고친 근거는 결과가 아니라 외부 표준 둘(계수표 일치,
EBU 시험 1)이다.

### 물린 자리

- `asset_probe.measure_wav` → `integrated_lufs` + `lufs_reason`(값이 없으면 사유)
- `audio_probe.measure_audio` → 비WAV 디코딩 경로도 같은 구현을 쓴다
- 어댑터 `wav_asset`이 `integrated_lufs`를 내보낸다
- 채널을 **모노로 접지 않는다** — 표준의 채널 합은 채널별 제곱의 합이라 미리
  평균 내면 스테레오가 3 dB 낮게 나온다(테스트로 고정)

### 여전히 안 한 것

**문턱을 정하지 않았다.** 목표 LUFS(예: −14)는 사장님이 동결할 값이고, 그전까지
음악 심판에 LUFS 규칙은 추가되지 않는다. 이 칸의 상태는 이제 "미측정"이 아니라
**"측정됨·미판정"** 이다 — 자산 심판 초안에도 그렇게 적었다.

### 작업 중 사고 하나

패치 스크립트가 잘못된 인자로 파일을 열면서 `genesis/asset_probe.py`가 0바이트로
잘렸다. 커밋된 상태에서 즉시 복구(`git checkout --`)했고 내용 손실은 없다.
이후 편집은 스크립트 대신 편집 도구로 했다.

## 2026-08-26 14:1x~14:4x — 루프 이음새: 규칙만 있고 도구가 없던 칸 (지출 0)

자산 심판 초안의 `audio.mechanical.loop_seam`은 *"루프 지정 시, 끝→시작 이음새의
스펙트럼 불연속 ≤ THRESH_SEAM"* 이라고 적혀 있었지만 **재는 도구가 없었다.**
설계를 먼저 커밋(aae6f5a)하고 구현했다.

### LUFS와 다른 점: 외부 정본이 없다

BS.1770은 정본이 있고 EBU 시험 시료로 대조할 수 있었다. 루프 이음새는 게임
오디오 관행일 뿐 표준이 없다. 그래서 **합성 시료로 이빨을 증명**하도록 사전
등록했다 — 잘라 붙인 루프가 완벽한 루프의 **최소 2배**.

| 시료 | seam_spectral | 판정 |
|---|---|---|
| 완벽한 루프(500 Hz × 2초) | 1.41 | 이음새가 곡 안의 다른 자리와 비슷 |
| 잘라 붙인 루프(뒤 절반 3 kHz) | **10.77** | 완벽 루프의 **7.7배** — 이빨 확인 |
| 끊긴 루프(마지막 표본만 튐) | 31.35 | seam_step 1.0 |

**비율로 내는 이유**: 절대 거리는 곡마다 다르다(조용한 곡은 작고 시끄러운 곡은
크다). 곡 자신의 내부 창들끼리의 평균 거리로 나누면 "이 곡 기준으로 이음새가
얼마나 튀나"가 된다. 진폭을 4배로 키워도 비율이 그대로인 것을 테스트로 고정했다.

### 우리가 오늘 세운 정책에 우리가 걸렸다

처음 구현은 직접 DFT(O(n²))라 **측정 하나에 4.5초**였다. 오늘 오전에
"검증 루프가 느려지면 사람이 안 돌린다"고 정책을 세워놓고 그 정책을 어길 코드를
쓴 셈이다. 반복형 쿨리-투키 FFT로 바꿔 **14.0초 → 0.42초**(33배)가 됐고,
값이 안 변했다는 것을 직접 계산과 대조해 고정했다(오차 4e-14).

### 물린 자리와 안 한 것

`asset_probe.measure_wav` → `seam_spectral` + `seam_reason`, 어댑터 `wav_asset`
노출. **THRESH_SEAM은 정하지 않았다.** 그리고 루프가 아닌 곡에는 애초에
적용하지 않는다(초안의 "미적용" 조항 그대로) — 이 칸도 `미구축 → 측정됨·미판정`
이다.

## 2026-08-26 14:4x~15:0x — 참피크를 의존성 밖으로 (지출 0)

`true_peak_dbtp`는 이미 재고 있었지만 **librosa가 깔린 기계에서만** 나왔다.
표준 라이브러리 층(`asset_probe`)은 표본 피크만 냈고, 이름도 정직하게 나눠
놨었다. 이 작업은 새 능력이 아니라 **같은 값을 어디서든** 내게 하는 것이다
(설계 0334a04 먼저 커밋).

| 검증 | 결과 |
|---|---|
| 해석적: 진폭 0.5 사인 | **−6.021 dBTP** (기대 −6.02) |
| 이빨: 표본 사이에 숨은 봉우리 | 표본 피크 −3.01 → 참피크 **+0.10** (차 3.11 dB) |
| 0 dBFS 997 Hz | +0.052 dBTP (디지털은 안 넘었는데 참피크는 넘는다) |
| 기존 librosa 경로와 대조 | **±0.3 dB 이내 일치** |

두 번째 줄이 이 계산의 존재 이유다. 표본 피크와 같은 값이 나오면 오버샘플이
일을 안 한 것이므로, 그때는 숫자를 낮추지 않고 구현을 고치기로 사전 등록해
뒀었다. 3.11 dB 차이가 났다.

### numpy는 선택이지 조건이 아니다

순수 파이썬 경로는 오디오 1초에 4~5초가 걸린다. numpy가 있으면 벡터 연산으로
**200배** 빠른 경로를 쓰되, 두 경로가 **2e-16 이내로 같은 값**을 낸다는 것을
테스트로 고정했다. 빠른 경로가 없다고 판정이 달라지면 그건 기계마다 다른
심판이 된다.

### 남은 것

이름은 계속 나눠 쓴다: `sample_peak_dbfs`(우리가 가진 점들의 최대) vs
`true_peak_dbtp`(점 사이를 복원했을 때의 최대). 문턱(−1.0 dBTP)은 초안에 있지만
**동결은 별건**이므로 이 문서로 등록하지 않았다.

### 그리고 구현을 하나로 합쳤다

`audio_probe`(librosa 층)도 이제 같은 구현을 부른다. 한 필드에 구현이 둘이면
경로에 따라 값이 갈리고, 그때 "어느 게 맞나"에 답할 수가 없다. **값을 내는
곳은 하나, 대조는 테스트에** 남긴다 — 그 테스트도 `audio_probe`를 부르지 않고
librosa 리샘플러를 직접 불러 진짜 대조를 만든다(통일 직후 그 테스트가
자기 자신을 비교하고 있는 것을 발견해서 고쳤다).

## 2026-08-26 15:0x~15:2x — 오디오 세트 층: 다섯 중 셋 (지출 0)

그림 세트 층은 08-25에 섰는데 **음악 세트 층은 규칙 문장 다섯만 있고 도구가
하나도 없었다**. 오늘 만든 LUFS·이음새가 그대로 재료가 되는 자리라 채웠다
(설계 15807ef 먼저 커밋).

| 지표 | 이빨 검증 |
|---|---|
| `loudness_spread` | 같은 세트 0.0 / 한 곡을 −10 dB 낮추면 **10.0** |
| `transition_seam` | 같은 주파수 전환 1.43 vs 다른 주파수 11.84 = **8.27배** |
| `duplication` | 같은 곡 두 번 → 거리 **0.0**, 다음으로 닮은 쌍 0.336 |

낱개 층(`measure_wav`)의 LUFS를 세트 층이 그대로 받아 쓴다 — 같은 값을 두 번
계산하지 않는다. 어댑터 `audio_set`으로 폴더째 물렸고, 깨진 파일이 섞이면
값을 지어내지 않고 거절한다.

### 비워둔 둘이 이 층의 절반이다

- **`tempo_dispersion`**: BPM 배수 오검출(150↔75)이 구조적으로 남아 있다.
  같은 템포가 다른 값으로 잡히면 변동계수가 곡이 아니라 **계측기의 흔들림**을
  잰다. 오염된 입력으로 만든 분산은 분산이 아니라서 값을 내지 않았다.
- **`key_conflict`**: 초안이 이미 "규칙표 별첨 필요"라고 적었다. 없는 표를
  지어내지 않는다.

둘 다 사유와 함께 `None`으로 남고, **그 칸이 조용히 채워지지 않았는지를
테스트가 지킨다.**

### 정직 조항 하나 더

거리를 0~1 유사도로 바꾸지 않았다. 그 변환은 임의의 함수를 하나 더 얹는
일이고, 그러면 "0.8이면 중복인가"라는 질문이 계측기 안으로 숨어든다. 거리를
그대로 내고 문턱은 사장님이 정한다.

### 이어서 — 세트 층이 WAV 밖으로 (부록 A)

세트 층은 16비트 PCM WAV만 읽고 있었다. 게임 자산은 ogg/flac/mp3로 들어오는 게
보통이고 `soundfile`이 깔린 기계에서는 이미 열 수 있었으니, **읽을 수 있는데
안 읽고 있던** 상태였다(계약 3907c04 먼저 커밋).

`genesis/audio_io.py` 로더 하나로 모았다:

| 경로 | 대상 | 이유 |
|---|---|---|
| `stdlib` | 16비트 PCM WAV | **의존성 없이** 도는 경로. 지우면 다른 기계에서 값이 안 나온다 |
| `soundfile` | 24비트·부동소수 WAV, flac/ogg/mp3 … | 없으면 값이 아니라 사유 |

혼합 세트 실측: WAV 3 + FLAC 1 + OGG 1 → 지표 전부 나오고, **어느 파일을 어느
경로로 읽었는지**(`backends`)를 같이 낸다. 값만 보고 원인을 못 찾는 일이 없게.
24비트 WAV는 표준 라이브러리가 실패하면 자동으로 soundfile로 넘어간다.

**mp3 정직 조항**: 인코더가 앞뒤에 무음을 덧붙이므로 디코드하면 원본에 없던
여백이 생긴다. 우리 계측기의 오차가 아니라 포맷의 성질이고, **보정하지 않는다** —
보정하면 모르는 인코더 관례를 추측하는 셈이다. 문서에 사실로 남겼다.

## 2026-08-26 15:4x~16:0x — 분해기에 숫자를 붙였더니 오작동이 하나 나왔다 (지출 0)

설계도 엔진의 `intake`는 자기 한계를 *"별칭 substring 매칭이라 거칠다"* 고
적어놨는데, **얼마나 거친지는 아무도 재본 적이 없었다.**

### 순환을 피하려고 잰 것만 쟀다

요청 문장을 내가 지어내고 정답을 내가 붙이면 **내 엔진을 내가 채점**하는 것이고,
오늘 아침 골든 positive에서 본 순환과 같은 모양이다. 그래서 정답의 출처가
**레지스트리에 선언된 별칭**인 것만 쟀다(설계 972d782 먼저 커밋).

| 관문 | 결과 |
|---|---|
| 별칭 재현율(맨 별칭) 79개 | **1.0000** |
| 별칭 재현율(운반 문장) | **1.0000** |
| 다중 언급 153쌍 | **1.0000** |

**계약은 지켜지고 있었다.** 기대값을 비율이 아니라 1.0으로 얼린 이유도 이것이다 —
등록된 별칭이 안 걸리는 것은 성능이 아니라 계약 위반이다.

### 그런데 충돌 후보 8건 중 하나는 판단이 필요 없었다

```
요청: "픽토그램 세트 만들어줘"
분해: ram_booster, icon_spec_fit          ← "램" ⊂ "픽토그램"
되묻기: "RAM 부스터는 거짓/플라시보입니다"
추천: cache_cleanup, large_file_finder, duplicate_file_finder, icon_spec_fit
```

아이콘을 달라는 사람에게 **RAM 이야기와 저장공간 청소 셋**을 내놨다. 추천 4/5가
요청과 무관하다. 이건 취향 문제가 아니다 — 원자 자신의 정의가 "픽토그램"과
아무 관계가 없다.

**고침(부록 A로 먼저 동결, 8395103)**: 겹친 자리에서는 긴 별칭이 이긴다
(longest-match-wins). 문장마다 옳고 그름을 내가 판단하는 게 아니라 **구간 포함**
이라는 기계적 사실로만 거른다.

고친 뒤: `픽토그램 세트 만들어줘` → **icon_spec_fit 하나**. 그리고 **벤치 세
관문은 그대로 1.0** — 이게 고침을 유지하는 등록 조건이었다(깨지면 되돌린다고
미리 적어뒀다). 오작동 하나를 없애려고 계약을 깨지 않았다.

### 남은 7건은 후보로 남는다

`정리 ⊂ 메모리 정리`처럼 겹침이 실제 요청에서 어떻게 갈리는지는 문맥 문제다.
`data/intake_bench_20260826.json`에 미판정으로 기록했고, 성능 숫자에 넣지 않았다.

**이 벤치로 결론짓지 않은 것**: "LLM Proposer가 필요한가". 이건 substring
매칭이 **자기 계약을 지키는지**만 잰다. 자유 문장 이해력은 여기서 재지 않는다.

## 2026-08-26 16:0x~16:2x — 우리 계기판이 거짓 경보를 내고 있었다 (지출 0)

오늘 설계 문서를 9건 썼는데 **출처 헤더를 두 건만 찍었다.** 계약
(`docs/provenance-contract.md`)은 있었지만 **그것을 강제하는 검사가 없어서**
내 부주의가 조용히 지나갔다. 규율은 문서가 아니라 코드가 지킨다.

### 상시 검사부터 만들었다

`tests/test_provenance_coverage.py`: `docs/*-design.md`(이 저장소의 사전 등록
문서 이름 규칙)는 전부 출처 헤더를 가져야 한다. 새 설계 문서를 만들면
**자동으로 이 검사에 들어온다** — 오늘 같은 누락이 다시 조용히 지나가지 못한다.

### 그러다 계기판 자체의 결함을 찾았다

헤더를 찍고 나서도 세 문서가 `unknown`으로 남았다. 사유는 "부모가 없다":

```
docs/icon-golden-v1-brief.md         부모: data/goldens/icon-v1.result.json → 없음
docs/taste-judge-image-v0-design.md  부모: data/picks/pixellab-v1.json     → 없음
```

**두 파일 다 디스크에 있다.** 원로그 목록(`RAW_PATTERNS`)이 `*.jsonl`·
`*_report.json` 같은 이름 규칙만 훑고, 우리가 실제로 인용하는 **판정 기록**
(`data/goldens/`, `data/picks/`)은 아예 안 보고 있었다. 출처를 제대로 적은
문서가 오히려 강등됐다 — **근거를 못 찾는 계기판은 계기판이 아니다.**

수정(계약 §6에 먼저 적음): 이름 규칙에 더해 `goldens`·`picks`·`observed`
디렉터리를 통째로 원로그로 본다. 고른 기준은 취향이 아니라 **문서가 인용하는
기록이 사는 곳**이다. `data/repos/`처럼 큰 디렉터리는 넣지 않는다.

| | 전 | 후 |
|---|---|---|
| unknown | 17건 (22.1%) | **4건 (5.2%)** |
| 확인 가능한 파생 문서 | 11 | **14** |
| stale | 0 | 0 (아래 참조) |

### 거짓 경보가 걷히니 진짜 신호가 하나 나왔다

수정 직후 `stale`이 **1건** 떴다: `golden-null-control-memo.md`의 부모
`icon-v1.result.json`이 바뀌었다. 옳은 신호다 — 그 메모는 골든 재주행 **전에**
쓴 권고문이고, 그 권고를 적용한 재주행이 결과 파일을 갱신했다. 메모에 그
경위(무엇이 이 권고를 대체했는지)를 적고 다시 확인 도장을 찍었다.

남은 `unknown` 4건은 헤더가 없는 문서들이다: `progress.md`(서술 기록),
`plan-2026-08-26-evening.md`, 그리고 예전 브리프 둘. 이건 내가 오늘 만든 것이
아니고 분류에 판단이 필요해서 **손대지 않고 남겨 둔다.**

## 2026-08-26 16:2x~16:4x — 오늘 만든 것을 결정 시트로 (지출 0)

오늘 계측기를 여섯 개 만들었는데 **전부 "측정됨·미판정"** 이다. 문턱이 사장님
몫이라 그런데, 그 상태로 두면 "뭘 정해야 뭐가 풀리는지"가 문서 여기저기 흩어진다.
`tools/threshold_sheet.py`가 그걸 한 장으로 모은다.

**두 종류를 구분하는 게 핵심이다.**

| | 뜻 | 정하면 |
|---|---|---|
| [1] 미동결 문턱 **9건** | 이름은 있는데 값이 null | 계측기가 있어야 살아난다 |
| [2] 자리 없는 계측기 **6건** | 값은 나오는데 문턱 이름조차 없다 | **정하는 즉시 살아난다** |

[2]가 오늘 만든 것들이다: `integrated_lufs`, `true_peak_dbtp`, `seam_spectral`,
`loudness_spread`, `max_transition_seam`, `duplication.min_distance`.

### 이 도구가 하지 않는 것이 이 도구의 전부다

값을 **제안하지 않는다.** 시트가 "이 정도면 −14 LUFS가 좋겠습니다"라고 말하기
시작하면 문턱이 사장님 손을 떠나 계측기 안으로 숨어든다. 그래서 테스트가
"어떤 칸에도 숫자가 없다"를 고정한다.

### 스캔의 한계를 값에 섞지 않았다

미동결 문턱 4건이 처음엔 "읽는 규칙 없음"으로 나왔는데, 실제로는 프로필 밖
(도구 인자·격리 큐)에서 쓰이는 것들이었다. **내 스캔이 못 본 것**을 "죽은 문턱"
이라 부르면 시트가 거짓말을 한다 — `프로필 / 프로필 밖 / 아무 데서도 안 읽힘`
셋으로 나눠 적었다. 실제로 아무 데서도 안 읽히는 것은 2건
(`VALUE_TOLERANCE`, `SATURATION_TOLERANCE`)이다.

## 2026-08-26 16:4x~17:0x — 선별 2회차: 관문을 처음 채웠고, 우리 절차가 걸렸다

사장님 선별(16:4x): `01=3, 02=1, 03=5, 04=6, 05=보류, 06=1, 07=4, 08=2`.
**05_equipment는 보류**로 기록했다 — 거절과 미판정을 섞으면 반례가 거짓말이
된다(오전에 고친 바로 그 지점). 고른 것 7 / 반례 36 / 미판정 5 / 보여준 것 48.

누적(pick-v1 + pick-v2) = **개념 11 / 후보 64**. 취향 시험대 §5에 적어둔
"다음 회차 조건"(개념 ≥8, 후보 ≥40)을 **처음으로 채웠다.**

| 관문 | 값 | 기준 |
|---|---|---|
| 표본 | 개념 11, 후보 64 | **처음으로 OK** |
| LOCO top-1 적중률 | **0.0** | ≥0.75 미달 |
| 순열 p | 1.0 | <0.05 미달 |

### 표본을 세 배로 늘렸더니 더 나빠졌다 → 원인을 먼저 쟀다

1회차 0.25 → 2회차 0.0. 진단(`data/picks/taste-v2-diagnosis.json`):

- 훈련 정확도가 전부 **0.81~0.84**인데, 이건 한 자리에 채택본 1·비채택본 5~6인
  표본에서 **"전부 거절"이 얻는 점수(≈0.83)와 같다.** 11개 폴드 중 **5개는
  규칙이 훈련에서 아무것도 통과시키지 않았다.**
- 게다가 우리 점수는 `값 − 문턱`이라 **문턱이 순위를 못 바꾼다.** 같은 특징·방향
  이면 문턱이 무엇이든 top-1은 같다. 즉 훈련이 실제로 고르는 건 특징과 방향인데,
  그걸 퇴화한 목적함수가 고르고 있었다.
- 채택본의 순위는 중앙값 **5위/6후보** — 무작위보다 체계적으로 나쁘다.

### 결론과, 하지 않은 것

**NO-PROMOTE 확정, human_gate 유지.** 관문을 낮추지 않았다.

그러나 이건 "사장님 취향에 규칙이 없다"가 아니라 **우리가 얼린 훈련 목적함수가
고르기를 표현하지 못한다**는 뜻이다. 1회차의 0.25도 이제 운으로 본다.

**절차를 지금 바꾸지 않았다.** 결과를 본 뒤 목적함수를 바꾸는 것은 원칙 ① 위반이다.
재등록 후보(같은 특징·같은 규칙 꼴, 훈련 기준만 "분류 정확도 → top-1 적중률")를
설계 §8에 적어두고 **사장님 승인 전에는 계산해 보지도 않았다** — 먼저 계산하고
나중에 등록하면 그게 사후 기준이다.

곁들여: `taste_bench`가 `--picks`를 여러 번 받도록 넓혔다(누적 = 개념 이어 붙이기,
세션 이름을 앞에 붙여 같은 이름이 합쳐지지 않게). 판정 절차는 손대지 않았다.

## 2026-08-26 17:2x~17:5x — 인-스펙 변이: 심판이 과보수인지 처음으로 쟀다

외부 AI 토론에서 나온 아이디어를 채택했다: **순환은 파일의 출처가 아니라 라벨의
생성 경로로 깬다.** negative 40건이 "스펙 밖으로 민 것은 떨어져야 한다"라면,
그 쌍대인 **"합법 영역 안에서만 움직인 것은 통과해야 한다"** 가 비어 있었다.
합법성이 **연산자로 증명**되므로 파일이 우리 안에서 나왔어도 순환이 아니다.

설계를 먼저 커밋(e8767fa)하고 구현했다. 연산자 여섯: 평행이동(±0.5·±1.0 × x·y),
좌우 미러, 90° 회전, path 순서 뒤집기, `line→path` 등가 치환, **절대좌표 재표기**.

### 결과 — n=41, 통과율 **1.0000**, 탈락 0

| 통제 | n | 값 | 판정 |
|---|---|---|---|
| positive | 4 | 1.0000 | 측정 불가(순환) |
| negative | 40 | 1.0000 | 통과 |
| null | 24 | 0.1250 | 해당 없음 |
| spec_sensitivity | 20 | 1.0000 | 통과 |
| **inspec (신규)** | **41** | **1.0000** | **통과** |

건너뛴 11건(원호 6·line 없음 4·path 2개 미만 1)은 사유와 함께 기록했다.
골든 전체는 **여전히 NO-GO** — positive가 측정 불가인 한 그렇다고 미리 등록해
뒀고, 이 통제가 그걸 바꾸지 않는다.

### 첫 구현이 3건밖에 못 만들었다 — 문턱이 아니라 구현을 고쳤다

처음엔 변이가 **3건**만 나왔다(등록 최소 20 미달). 우리 아이콘이 `h`/`v`·상대
좌표를 쓰는데 내 구현이 안 다뤘기 때문이다. **문턱(1.0, 최소 20)은 그대로 두고
구현을 완성**했다 — 절대좌표 변환을 넣고, 그 변환 자체를 여섯 번째 연산자
("재표기": 같은 그림, 다른 인코딩)로 등록했다. 이건 문턱을 결과에 맞춘 게
아니라 못 만들던 표본을 만들 수 있게 한 것이다.

### 검증을 판정에 기대지 않았다

"심판이 통과시켰다"로 연산자를 검증하면 그것도 순환이다. 그래서 테스트는
**연산자가 보존한다고 주장한 것을 실제로 보존하는지**를 따로 본다:
격자·여백·획·팔레트·도형 수 보존, 그리고 가장 강한 것 — **재표기본과 원본을
실제로 그려서 픽셀 차이 ≤ 0.001**, 미러는 잉크 양이 같고 그림은 달라야 한다.

### 이 통제가 재지 **않는** 것

"사람이 좋다고 할 것을 통과시키나"는 여전히 못 잰다. 이건 **통과분의 궤도 위**
에서만 움직이는 변이라 커버리지가 좁고, positive를 대체하지 않는다. 외부 AI가
정확히 이 한계를 지적했고, 다음 단계(합법 영역 직접 샘플링)도 그쪽에서 왔다.

## 2026-08-26 17:3x~17:5x — 합법 영역 직접 샘플링: 심판에 암묵 조건이 없다

인-스펙 변이(41/41)는 **통과분의 궤도 위**만 덮는다. "합법이지만 우리가 절대
안 만드는 모양"은 아직 몰랐다. 그래서 변이가 아니라 **스펙에서 직접 생성**했다
(설계 a8870f1 먼저 커밋).

생성 규칙은 구성으로 합법을 보장한다: 좌표는 여백 안(2.0~22.0) 0.5 배수에서만,
path 1~6개, 명령 총합 ≤60, 속성은 스펙 값을 그대로 박음, 씨앗 고정.
**예쁘지 않다. 그런데 합법이다.**

### 결과 — 200건 **전부 통과 (1.0000)**

심판에 **스펙에 없는 암묵 조건이 없다**는 직접 증거다. 못생긴 무작위 도형이
떨어졌다면 심판이 스펙에 없는 미감을 몰래 쓰고 있다는 뜻이었을 것이다.

### 커버리지를 같이 냈다 — "200건 통과"만으로는 뜻을 모른다

| 축 | 덮은 범위 |
|---|---|
| path 수 | 1~6 전부 (26~45건씩) |
| 명령 수 | 0~29 (5단위 버킷 6개) |
| 명령 종류 | M 200 · L 163 · Q 171 · C 164 |
| 바이트 | 191 ~ 655 |
| 여백 | 2.0 ~ 5.0 (하한에 실제로 닿았다) |

**안 건드린 축 4종을 이름으로 남겼다**: circle·rect·line·polyline 요소,
Z·A·H/V·상대 좌표 명령, 금지 요소, 팔레트 위반(뒤 둘은 negative 통제가 덮는다).
안 건드린 축은 **안 잰 것**이고, 안 적으면 커버리지를 부풀리게 된다.

### 골든 현황 — 통제 다섯 중 넷 통과, 여전히 NO-GO

| 통제 | n | 값 | 판정 |
|---|---|---|---|
| positive | 4 | 1.0000 | **측정 불가**(순환) |
| negative | 40 | 1.0000 | 통과 |
| null | 24 | 0.1250 | 해당 없음 |
| spec_sensitivity | 20 | 1.0000 | 통과 |
| inspec | 41 | 1.0000 | 통과 |
| **legal (신규)** | **200** | **1.0000** | **통과** |

positive 하나 때문에 NO-GO다. 그리고 그 positive는 **두 질문이 한 칸에 붙어
있어서** 구조적으로 순환한다 — (i) 심판이 스펙과 같은가, (ii) 스펙이 사람이
원하는 것과 같은가. 오늘 통제 셋(sensitivity·inspec·legal)이 **(i)를 사람 없이
닫았다.** (ii)는 애초에 골든의 문제가 아니라 취향 라인(Q3)의 문제다.

**골든표에서 positive를 (i)로 재정의하고 (ii)를 빼는 것**은 판정을 뒤집는
계약 변경이라 사장님 결정으로 남긴다.

### 곁들여 — 실행이 무엇을 시켰는지 남기게 했다

구멍 하나를 막았다. 실행 기록에 모델·온도·온도 상한 조정까지 있으면서 **정작
프롬프트와 스펙이 없었다.** 그래서 "회차 사이에 프롬프트가 바뀌었나"(통과율
0.81 → 0.98의 원인)가 사후에 답이 안 됐다. 이제 `prompt_fingerprint`가
spec_id + 공개 스펙 해시 + 프롬프트 네 종의 해시를 남긴다. 개념 이름을 뺀
골격을 해시하므로 개념이 달라도 지문은 같고, 스펙을 바꾸면 지문이 바뀐다.

## 2026-08-26 17:4x — 골든이 처음으로 **GO** (결정 G4)

사장님 승인으로 `positive_control`을 골든에서 뺐다(등록 4f0d905 먼저 커밋).

그 칸에는 두 질문이 붙어 있었다 — (i) 심판이 스펙과 같은가, (ii) 스펙이 사람
뜻과 같은가. 한 칸에 넣으면 구조적으로 순환한다. **영원히 못 푸는 질문을
관문에 넣어두고 NO-GO를 유지하는 것은 정직이 아니라 마비다.**

| 통제 | n | 값 | 판정 |
|---|---|---|---|
| positive | 4 | 1.0000 | **범위 밖**(취향 라인으로) |
| negative | 40 | 1.0000 | 통과 |
| null | 24 | 0.1250 | 해당 없음 |
| spec_sensitivity | 20 | 1.0000 | 통과 |
| inspec | 41 | 1.0000 | 통과 |
| legal | 200 | 1.0000 | 통과 |
| **판정** | | | **GO** |

"측정 불가"가 아니라 **"여기서 잴 것이 아니다"** 로 적었다 — 오늘 `contrast`를
화면 층으로 옮길 때와 같은 구분이고, 오늘 두 번째다.

### GO를 좁게 읽는다

이건 **"심판이 스펙을 정확히 집행한다"**이지 **"스펙이 좋다"**가 아니다.
취향 라인은 여전히 NO-PROMOTE이고, 골든이 GO가 됐다고 그 사실은 하나도 안
바뀐다. 표본 4건도 안 지웠다 — negative·inspec 변이의 원본으로 계속 쓰인다.

### 관문이 느슨해진 게 아니라는 것을 테스트로 박았다

심판을 "전부 통과" 도장으로 바꾸면 negative가 무너지고 판정이 즉시 NO-GO로
돌아간다. positive를 범위 밖으로 뺀 것이 관문을 헐겁게 만든 게 아니다.

## 2026-08-26 18:5x — 정정: 스위트가 느려진 원인을 내가 잘못 지목했다

커밋 `fce5ece`의 메시지에 *"오늘 만든 legal 통제 때문에 스위트가 8분 28초 →
14분 55초가 됐다"* 고 적었다. **확인 없이 단정했고, 근거가 없다.**

측정 게이트가 31분 동안 6%에서 기어가길래 시스템을 봤더니 **CPU 100%,
최상위 소비자가 Claude 앱 프로세스 둘**(CPU 시간 2901초·2797초)이었다.
파이썬 워커는 상위 8위 안에도 없었다. 같은 테스트 파일이 12시 2.82초 →
18:47 5.06초로 1.8배 느려져 있었다.

**15시 이후의 게이트 시간은 전부 오염된 측정이다.** 측정 게이트는 중단했다 —
경합 상태에서 다시 재봐야 의미가 없다.

| | |
|---|---|
| 참 | `test_golden_bench` 144초 → 52초 (같은 기계 상태에서 앞뒤로 잰 값) |
| 모름 | 전체 스위트가 실제로 느려졌는지, 느려졌다면 얼마나 |
| 유효 | `legal_n` 수정 — 관문은 그대로 두고 테스트만 빠르게 (줄여 부르면 미달 강등) |

`docs/test-loop-policy.md` §6에 규칙을 추가했다: **시간을 재기 전에 기계 부하를
확인하고 그 값을 측정과 함께 남긴다.**

교훈은 도구가 아니라 **추론**에 있다. 느려진 것을 보고 **가장 최근에 내가 만든
것**을 원인으로 지목했다 — 그게 제일 그럴듯해 보여서지, 재봤기 때문이 아니다.
오늘 하루 종일 "숫자를 보기 전에 판정식을 얼린다"를 지켰으면서, 정작 원인
지목에는 같은 규율을 안 썼다.

## 2026-08-26 20:45~21:01 — 오염되지 않은 스위트 시간 (계획 §2 내 몫 ①)

18:5x에 "15시 이후 게이트 시간은 전부 오염된 측정"이라고 적고 중단했던 것을
다시 쟀다. §6 규칙대로 **재기 전에 기계 부하를 먼저 봤다.**

| | 값 |
|---|---|
| 시작 전 CPU | **28%** (최상위 소비자 claude 앱, CPU 시간 56s/45s/29s — 18:47엔 2901s였다) |
| 파이썬 워커 | 없음 |
| 명령 | `pytest -n 4 --durations=0 -q` 단독 |
| 결과 | **1160 passed, 1 skipped, 15분 43초**(943.84초) |

**정직하게**: 완전한 단독 주행은 아니다. 주행 중에 내가 git·짧은 파이썬 읽기
명령을 열댓 번 돌렸다(각 1초 미만). 18:47의 오염(코어 4개를 앱이 다 먹던 상태)
과는 급이 다르지만 "깨끗한 측정"이라고 부르지는 않는다.

### 그래서 스위트는 실제로 느려졌나

| 회차 | 건수 | 시간 |
|---|---|---|
| 08-26 11:51 | 982 | 8분 18초 |
| 08-26 20:45 | **1160** | **15분 43초** |

건수 +18%에 시간 +89%다. §3에 적어둔 ±30% 변동폭으로는 안 덮인다. 다만 위
단서(내 잔 명령) 때문에 **"두 배 가까이 느려졌다"고 단정하지 않는다.** 다음
기회에 아무 명령도 없이 한 번 더 재고, 그때 판정한다.

느린 테스트 등록부(`data/slow_tests.json`)는 이 주행으로 갱신했다: **14건 → 31건**
(문턱 20초). 상위 둘은 `test_mine.py::test_known_positive_qualifies` 211.7초,
`test_loop.py::test_resume_continues_not_restarts` 202.9초다.

## 2026-08-26 21:02 — 다양성 축: **undefined**, 그리고 구조해시가 자로 짧다는 것

사전 등록: `docs/diversity-q1-v0-design.md`(등록 커밋 먼저). 지출 0.
도구 `tools/diversity_curve.py`, 기록 `data/diversity_q1_v0.json`.

| 층위 | 서명 | 중복 | 새것 비율 ū | 95% 구간 |
|---|---|---|---|---|
| T1 | `structure_hash` | **0** | 1.000 | — (분해능 없음) |
| T2 | 요소구성+path/shape 수 | 11 | 0.651 | [0.513, 0.799] |
| T3 | 요소구성 | 11 | 0.651 | [0.513, 0.799] |

표본: 개념 9, 통과후보 56 (개념당 6 미만인 3개념은 사유와 함께 제외).
**판정 = undefined**(구간이 0.50과 0.80 사이를 가로지른다). 한계비용은
새 것 하나당 통과후보 1.54개, 생성후보 1.63개.

### 이 표에서 실제로 배운 것 둘

1. **T1은 이 표본에서 아무것도 못 가른다.** 56개 후보의 구조해시가 전부
   달랐다. 사전 등록에 "모든 서명이 유일하면 flat이 아니라 **분해능 없음**"을
   박아두지 않았다면, 이 칸은 `ū=1.0`으로 읽혀 **"생성기 교체 불필요"라는
   가짜 결론**이 됐을 것이다. 테스트가 그 길을 막는다.
2. **T2와 T3가 완전히 같았다** — `path_count`·`shape_count`를 더해도 요소구성
   이상으로 갈라지지 않았다. 즉 지금 우리가 가진 거친 자는 사실상 하나다.

### 그리고 0.799

T2의 95% 상한이 **0.799**이고 flat 관문은 0.80이다. 0.001 차이로 미달이다.
**관문을 낮추지 않는다** — 숫자를 보고 문턱을 옮기면 그 순간 사전 등록이
장식이 된다. 답을 내려면 표본이 더 필요하다: 개념 1~2개 × 후보 60개(약
$0.06~0.12, 사장님 승인 사항)면 한 개념 안에서 곡선 기울기를 직접 본다.

## 2026-08-26 21:03 — 순응 비용: **encoding_only** (내용을 버리지 않는다)

사전 등록: `docs/conformance-cost-q2-v0-design.md`(+ 숫자 보기 전 §6 개정).
도구 `tools/conformance_cost.py`, 기록 `data/conformance_q2_v0.json`. 지출 0.

스펙이 규제하는 축(`color_count`·`opaque_ratio`)을 빼고 나머지 **8특징**으로
원본↔후처리본 거리를 재고, **같은 그룹의 다른 자산끼리의 거리**로 나눴다.

| | 값 |
|---|---|
| median r | **0.096** |
| 95% 구간 | [0.025, 0.135] |
| 표본 | 자산 25, 그룹 3 (관문 충족) |
| **판정** | **encoding_only** (상한 0.135 ≤ 0.25) |

즉 우리 후처리는 그림을 **다른 자산으로 바꿔치기하는 것의 10분의 1** 만큼만
움직인다. "규격에 맞추느라 내용을 버린다"는 우려는 이 표본에서는 성립하지 않는다.

### 제약별 구속도 (원본 26건 재채점)

| 제약 | 위반율 | 통과분 여유 p50 |
|---|---|---|
| `color_count` | **0.615** (16/26) | 9.5 |
| `logical_width` / `logical_height` | 0.308 (8/26) | **0.0** |
| `alpha_binary` | 0.000 | — (이진) |
| `file_integrity` | 0.000 | — (이진) |

색 수가 가장 세게 구속하고, 크기는 **여유가 정확히 0**이다(통과한 것은 전부
상한에 딱 붙어 있다 — 픽셀아트라 당연하다). `alpha_binary`·`file_integrity`는
이 생성기의 26건에서 한 번도 안 걸렸다. 이진 제약이라 "사문"으로 판정하지는
않는다(여유를 잴 수 없으므로).

### 정직하게 남기는 것 셋

1. **개정을 안 했으면 거짓 표가 나왔다.** 반입 기록의 `violations`는 후처리
   *후* 값이라 26건 중 24건이 비어 있다. 그대로 셌으면 "아무 제약도 구속하지
   않는다"가 나왔다. 원본 재채점으로 바꾼 것을 숫자 보기 전에 문서에 적었다.
2. **비율을 못 만든 자산 하나가 하필 제일 많이 변한 것이다.** `04_icon`은
   그룹에 원본이 하나뿐이라 자가 없어 제외됐는데(설계대로 미정의), 그 자산의
   순응 거리는 4.56으로 다른 그룹의 자 자체(1.26~1.94)보다 크다. `encoding_only`
   를 넓게 읽으면 안 되는 이유가 이 한 줄이다.
3. **내 계측기 결함 하나를 고쳤다** — 크기 제약의 여유를 재는 가지가 규칙
   이름(`logical_width`)과 안 맞아 전부 비어 있었다. 문턱이 아니라 배선이라
   고치고 다시 돌렸다.

## 2026-08-26 21:05 — 두 번째 판정기: 505표본 **전건 일치**, 경계 7축 **정확**

사전 등록: `docs/dual-implementation-v0-design.md`(+ §4 범위 명시). 지출 0.
구현 B `genesis/icon_judge_b.py`, 대조기 `tools/dual_check.py`,
기록 `data/dual_check_v0.json`.

골든이 오늘 GO가 됐지만 그 GO는 **구현 하나**가 스펙을 집행한다는 뜻이었다.
통제 넷(negative·sensitivity·inspec·legal)은 전부 같은 판정기를 불렀다.
그래서 남은 물음은 **"구현이 스펙 문서와 같은가"** 였다.

### 대조 (public 규칙만)

| 출처 | 표본 | 일치 |
|---|---|---|
| 생성물(pick-v1·v2 후보) | 69 | 69 |
| 합법 무작위 표본 | 200 | 200 |
| 인-스펙 변이 | 48 | 48 |
| 음성 변이(한 곳만 어긴 것) | 188 | 188 |
| **합계** | **505** (위반본 188) | **일치율 1.0000 → agree** |

### 경계 스위프 — 코드가 뒤집히는 지점 = 문서에 적힌 숫자

| 제약 | 문서 | 관측 | |
|---|---|---|---|
| `padding.min` | 2 | 2 | exact |
| `path.max_count` | 6 | 6 | exact |
| `shape.max_count` | 6 | 6 | exact |
| `path.max_total_commands` | 60 | 60 | exact |
| `stroke.width` | 1.5 | {1.5}만 통과 | exact |
| `grid.snap` | 0.5 | 0·0.5·1.0만 통과 | exact |
| `size.max_bytes` | 2048 | 2048 | exact |

**우리가 파는 스펙 문서의 숫자가 코드의 실제 문턱과 같다.** 이건 골든이 답하지
못하던 칸이다 — 통제 넷은 전부 통과하면서도 문서가 거짓일 수 있었다.

### 이 결과를 부풀리지 않기 위해 (설계 §2를 다시 적는다)

- **독립 재현이 아니다.** B도 내가 썼고 나는 A를 이미 읽었다. 이건 차등 시험이다.
- B는 A의 파서를 부르지 않는다(테스트가 import를 AST로 검사해 강제).
  그래도 **원호(A)의 불룩함을 무시하는 근사는 둘이 공유**한다 — 그 축의
  불일치는 이 대조로 못 잡는다.
- 대조가 살아 있다는 증거를 테스트로 남겼다: 전부 PASS 도장을 찍는 **가짜 A**를
  넣으면 일치율이 1.0 아래로 떨어지고, 문서값 하나만 바꾼 **가짜 스펙**에서는
  스위프가 `mismatch`를 낸다. 이게 없으면 "항상 일치"가 성공인지 대조가 죽은
  것인지 구분되지 않는다.
- B는 **모르는 제약을 통과시키지 않는다** — 스펙에 새 열쇠가 생기면 B는
  `undefined`를 낸다(테스트로 강제). 조용히 통과하면 대조가 서서히 무의미해진다.

### 시각 정정 (21:07)

위 세 절의 머리에 처음 적은 시각(21:0x·21:1x·21:4x)이 **실제보다 앞서 있었다.**
`stamp_provenance`가 파일에 찍어둔 실제 시각과 `date`로 맞춰 고쳤다(설계 문서
셋의 "작성" 줄도 같이). 오늘 스위트 지연 원인을 확인 없이 지목했던 것과 같은
종류의 실수다 — 재보지 않고 적었다. 시각도 측정값이다.

## 2026-08-26 21:12 — 인-스펙 변이 v0.1: 원호를 다루기 시작했다 (계획 §2 내 몫 ⑤)

사전 등록: `docs/inspec-metamorphic-v0-design.md` §7(구현 **전**에 커밋).
v0은 "원호(A)가 있으면 미러·회전을 안 한다"였다. 이유는 sweep 플래그를 안
뒤집으면 기하가 깨지기 때문이지 원리적 불가가 아니었다.

등록한 규칙(등거리 변환이라 `rx`·`ry`는 불변):

| 연산 | φ | large-arc | sweep |
|---|---|---|---|
| 미러 `x→24−x` | (180−φ) mod 180 | 불변 | **반전** |
| 90° 회전 `(x,y)→(y,24−x)` | (φ−90) mod 180 | 불변 | 불변 |

**수용 검사는 우리 파서가 아니라 렌더러가 한다**: 변환본을 그린 커버리지와,
원본 커버리지에 같은 변환을 픽셀로 준 것의 평균 차 ≤ 0.02(스펙의
`roundtrip.max_pixel_diff`와 같은 숫자를 재사용 — 새 문턱을 만들지 않았다).

### 결과

| | 전 | 후 |
|---|---|---|
| 골든 `inspec_control` | 41건 | **47건** (통과율 1.0000 유지, 골든 GO 유지) |
| 못 만든 변이 | — | 5건 (사유와 함께 기록, 조용히 빼지 않는다) |

### 이빨과, 이 확장이 드러낸 것

- **가짜 미러 검사**: sweep을 일부러 안 뒤집은 구현은 픽셀 검사를 통과하지
  못한다(테스트로 강제). 이게 없으면 "통과했다"가 검사가 죽은 것인지 구분 안 된다.
- **기존 테스트 하나가 틀린 가정을 갖고 있었다.** `test_mirror_keeps_the_ink_
  and_moves_it`이 "미러하면 그림이 달라져야 한다"고 단정했는데, 원호를 다루기
  시작하자 **좌우 대칭인 아이콘**(`01_save.svg` — 둥근 사각 테두리)이 처음으로
  들어왔다. 그 자산의 미러는 자기 자신이고, 픽셀 차 0.0이 **맞는 답**이다.
  테스트를 느슨하게 푸는 대신 **대칭임을 직접 확인**하는 가지를 넣었다.
  덧붙여 이건 sweep 처리가 옳다는 방증이기도 하다 — 플래그가 틀렸으면 대칭
  자산도 자기 자신으로 안 돌아온다.

## 2026-08-26 21:24 — 조용한 주행이 앞의 측정을 정정한다

커밋 전 상시 게이트를 **주행 중 아무 명령도 넣지 않고** 돌렸다.

| 주행 | 건수 | 시간 | 상태 |
|---|---|---|---|
| 20:45 | 1160 | 15분 43초 | 내가 짧은 명령을 열댓 번 섞어 넣음 |
| **21:12** | **1190** | **12분 01초** | **조용함**(시작 전 CPU 29%) |

테스트가 30건 늘었는데 3분 42초 빨라졌다. 즉 20:45 주행의 시간에도 **내 잔
명령이 섞여 있었다** — 18:47의 오염(코어를 앱이 다 먹던 상태)보다는 훨씬 가볍지만
0은 아니었다. 오늘 두 번째로 같은 교훈이다: **측정 중에는 측정만 한다.**

느린 테스트 등록부도 이 주행으로 다시 만들었다: **31건 → 18건**. 등록부가
"그 주행의 스냅샷"이라는 §3의 말이 그대로 보인다 — 경합 상태에서 20초를 넘던
13건이 조용한 주행에서는 문턱 아래로 내려갔다.

**게이트 녹색**(1190 passed / 1 skipped)이므로 푸시한다.

## 2026-08-26 21:1x~21:17 — 사장님 승인분 사전 등록 셋 (실행 전)

사장님 "전부 승인". 실행 전에 판정식부터 얼렸다.

| 문서 | 무엇 | 지출 상한 |
|---|---|---|
| `docs/prompt-ablation-v0-design.md` | 프롬프트에서 **공개 스펙만 뺀 팔**과 대조 — 통과율 0.98의 정체 | $0.10 |
| `docs/diversity-run-v1-design.md` | 개념 2 × **10회 독립 호출 × 6후보** — 호출 사이 다양성 | $0.20 |
| `docs/taste-retest-v0-design.md` | 순서 섞은 5자리 재선택 — **취향 관문의 천장** | $0 (사장님 15분) |

세 가지 설계 판단을 기록한다:

1. **60개를 한 번에 요구하지 않는다.** 한 응답 안에서 모델은 스스로 안 겹치려
   하므로 그 다양성은 우리가 실제로 쓰는 방식의 다양성이 아니다. 생산 설정
   그대로 6개씩 10번 부르고, `u_within`(호출 안)과 `u_across`(호출 사이)를
   **따로 판정**한다. 후자가 낮으면 "다시 불러도 같은 걸 준다"가 답이다.
2. **프롬프트 통제는 두 팔 다 새로 뽑는다.** pick-v2 기록을 `with_spec` 팔로
   재활용하면 회차·시각이 달라 비교가 오염된다.
3. **test–retest는 오늘 밤에 하지 않는다.** 기억이 남으면 천장이 부풀고, 그
   값으로 관문 0.75를 유지하면 틀린 관문을 근거까지 갖춘 채 들고 가게 된다.
   권고 08-29 이후. 판정식(정확 이항 구간, 상한 < 0.75면 "관문 달성 불가")은
   사장님이 다시 고르시기 **전에** 얼려 뒀다.

문턱 동결 6건은 **내가 대신 정하지 않는다** — 레퍼런스 자산이 없으면 임의값이고,
그건 우리 규칙이 금지하는 바로 그것이다. 레퍼런스가 생기면 `threshold_sheet.py`
한 장을 들고 사장님께 여쭙는다.

## 2026-08-26 21:31 — 프롬프트 제거 통제: 판정 **undefined**, 그런데 딴 게 나왔다

사전 등록 `docs/prompt-ablation-v0-design.md`(+ §2-1). 실지출 **$0.048458**
(상한 $0.10), 8호출 60.2초. 목 파일럿 먼저 통과. 기록 `data/prompt_ablation_v0.json`.

| 팔 | 통과 | 통과율 | 위반 분포 |
|---|---|---|---|
| `with_spec` | 10/26 | **0.3846** | grid.snap 13, linecap 13, linejoin 13, padding 2 |
| `no_spec` | **0/26** | **0.0000** | **stroke.width 26**, fill 9, grid 8, linecap 4, padding 4 |

`d = +0.3846`, 95% 구간 **[+0.1923, +0.5769]**. 등록된 관문은 "하한 > 0.20이면
spec_helps"였고 하한이 **0.1923**이다. **0.0077 차이로 미달 → undefined.**

오늘 두 번째로 구간이 문턱을 아슬아슬하게 못 넘었다(다양성 0.799 vs 0.80).
**둘 다 문턱을 안 옮겼다.** 옮기는 순간 사전 등록은 장식이 된다.

### 판정보다 큰 것: 스펙 텍스트보다 **예시**가 강하다

이번 `with_spec` 팔의 통과율은 **0.385**다. 같은 프롬프트 계열의 pick-v2는
**0.98**이었다. 차이는 하나 — 이번엔 **세트 예시(이미 통과한 아이콘 SVG)를
두 팔 모두에서 뺐다.** 그래야 "글로 준 스펙 vs 본보기로 준 스펙"이 안 섞이기
때문이고, 이 비교 불가를 **실행 전에** 문서에 적어 뒀다(§2-1).

그 결과가 숫자로 나왔다: **0.98 → 0.385.** 스펙을 글로 다 주고도 통과율이
반토막 아래다. 위반 분포가 그 정체를 가리킨다 — `with_spec`이 깨지는 곳은
`grid.snap`·`linecap`·`linejoin`으로, **스펙 문장에 분명히 적혀 있는 항목들**이다.
반면 `no_spec`은 `stroke-width`를 **26/26 전부** 틀렸다. 즉 스펙 텍스트는
"굵기 같은 단일 값"은 가르치지만 "격자·끝모양 일관성"은 못 가르치고, 그건
**예시가 가르치고 있었다.**

제품 관점에서 이건 판정보다 중요하다: 우리 파이프라인의 순응은 상당 부분
**프롬프트가 아니라 이미 통과한 자산의 되먹임**에서 나온다. 세트의 첫 아이콘이
가장 어렵다는 뜻이기도 하다.

### 정직하게 남기는 것 셋

1. **개념 간 편차가 크다**: `with_spec`은 map 5/7·settings 5/6인데 save 0/7·
   inventory 0/6이다. 내가 등록한 부트스트랩은 **후보 단위**라 이 군집을 무시한다
   — 개념 단위로 다시 잡으면 구간이 **더 넓어진다**. 판정이 이미 undefined이므로
   방향은 바뀌지 않지만(더 보수적이 될 뿐), 다음 등록에서는 개념 단위로 잡아야
   한다.
2. **이 0.385를 "우리 통과율"이라고 부르면 안 된다.** 예시도 재시도도 끈
   한 라운드짜리 값이다. 생산 설정의 값은 여전히 pick-v2의 0.98이다.
3. **표본을 더 붙여 구간을 좁히는 것은 지금 하지 않는다.** 결과를 보고 표본을
   늘리는 것(optional stopping)은 판정을 부풀린다. 하려면 **새 등록으로 독립
   반복**해야 하고, 그건 추가 지출(약 $0.10)이라 사장님 승인 사항이다.

## 2026-08-26 21:35 — 다양성 60후보 세션: **undefined**, 그리고 내 실행 설계 오류

사전 등록 `docs/diversity-run-v1-design.md`(+ §2-1). 실지출 **$0.121145**
(상한 $0.20), 20호출 152.4초. 기록 `data/diversity_run_v1.json`.

| 층위 | 통과후보 | 중복 | 호출 안 u_within | 호출 사이 u_across |
|---|---|---|---|---|
| T1 (구조해시) | 20 | 0 | 1.000 — **분해능 없음** | 1.000 — 분해능 없음 |
| T2 = T3 (거친 자) | 20 | 6 | 0.767 [0.433, 1.000] | 0.792 [0.375, 1.000] |

판정 층위는 T2, 두 통계 모두 **undefined**(u_within은 표본 관문 미달,
u_across는 구간이 0.50~0.80을 가로지름).

### 왜 표본이 20밖에 안 됐나 — 내 잘못이다

호출 20번에서 후보 **132개**가 나왔는데 통과가 **20개**였다(통과율 0.15).
설계 §2에는 **"생산 설정 그대로"** 라고 써 놓고, 구현에서 프롬프트에
**세트 예시를 빼고** 돌렸다. 바로 앞 실험(프롬프트 제거 통제)에서 예시를 빼는
코드를 쓰고 그대로 가져다 쓴 것이다. 그런데 오늘 그 실험이 증명한 바가
**"예시가 통과율의 대부분을 만든다"(0.98 → 0.385)** 였다. 알고도 같은 실수를 했다.

결과: 돈은 132후보어치를 쓰고 쓸 수 있는 표본은 20개였다.

통과가 **호출 단위로 뭉친다**는 것도 보인다 — save는 (3,3,0,0,0,0,0,6,0,0),
inventory는 (0,0,6,0,0,0,0,2,0,0). 한 호출 안에서 6개가 전부 통과하거나 전부
탈락한다. 즉 실패는 후보의 개성이 아니라 **그 호출이 잡은 습관**(끝모양·격자
같은 일괄 속성)이다. 이건 다음 판에서 쓸 만한 관찰이다.

### 두 번째 잘못: 지출로 얻은 자료를 버렸다

1회차 기록에는 호출별 **개수만** 남고 후보 SVG도 서명도 안 남았다. 그래서
"통과분 말고 전체 후보로 다양성을 보면 어떤가"를 보려면 **돈을 다시 써야 하는
상태**였다. 선별 세션(`pick_session`)은 후보를 전부 남기는데 이 도구는 안 남겼다.

### 고친 것 (지출 0)

1. `--examples` — 생산 설정처럼 세트 예시를 프롬프트에 넣는다. 기본값은 끔이고,
   **재실행 때 켠다.**
2. 기록에 **후보 전건**(SVG·판정·세 층위 서명)을 남긴다.
3. 테스트 둘로 못 박았다: 예시가 실제로 프롬프트에 들어가는지, 기록이 개수가
   아니라 후보를 남기는지.

### 다음 수는 사장님 승인 사항

**교정 재실행**(예시 켜고 개념 2 × 호출 10) 약 **$0.12**. 지금 판정은
"다양성은 모른다"이고, 그 이유의 절반이 내 실행 오류라 이 값으로 결론을 내면
안 된다. 승인 없이는 돌리지 않는다.

## 2026-08-26 23:10 — 선별: `05_equipment` = **3번** (사장님)

1회차에서 **미판정**으로 남겨 두셨던 자리다(거절이 아니었다). 오늘 밤 번호 판을
띄워 받았다: **3번(투구 실루엣)**. 기록은 `data/picks/pick-v2-equipment.json`에
**따로** 남겼다 — 오전 세션(`pick-v2.json`)과 시각·맥락이 다르므로 한 파일에
합치면 "언제 무엇을 보고 골랐나"가 거짓말이 된다.

- 고른 것 1 / **안 고른 것 4**(반례로 남는다) / 이 판에서 미판정 43
- 취향 개념 수: **11 → 12**

## 2026-08-26 21:56~23:1x — 재실행이 첫 호출에서 끊겼다 (지출 $0)

교정 재실행을 걸자마자 `RemoteDisconnected`로 프로세스가 죽었다. 원장 확인:
**그 시각 이후 호출 0건, 지출 $0.** 첫 호출의 응답을 받기 전에 끊긴 것이다.

여기서 두 가지가 드러났다.

1. **재시도가 없다.** 연결 한 번 끊기면 20호출짜리 실행이 통째로 날아간다.
2. **중간 저장이 없다.** 15번째에서 끊겼다면 이미 **지출한** 자료를 잃었을 것이다.

### 고친 것과, 재시도 범위를 좁게 잡은 이유

- `AnthropicIconProposer._post`: **응답을 못 받은 것이 확실한 경우**(ConnectionError)와
  **과금되지 않는 HTTP 429·529**만 재시도(최대 3회, 2초·5초 백오프). 재시도 횟수는
  실행 기록에 남는다.
- **읽기 시간초과는 재시도하지 않는다.** 서버가 이미 처리했을 수 있고, 그러면
  장부에 못 적는 지출이 생긴다. **끊긴 연결보다 장부에 없는 지출이 나쁘다.**
- `diversity_run`: 호출 하나가 끝날 때마다 원자료를 체크포인트 파일로 떨군다.
- 테스트 둘: 끊김은 재시도되고 시간초과는 안 되는지, 끊겨도 앞선 호출이 남는지.

## 2026-08-26 23:12 — 교정 재실행: **호출 안 0.936 vs 호출 사이 0.512**

사전 등록 `docs/diversity-run-v1-design.md`(§2-1 추정량). 실지출 **$0.128655**,
20호출 134.6초, 재시도 0회. 기록 `data/diversity_run_v1_run2.json`
(이번엔 후보 전건이 들어 있다).

| 층위 | 통과후보 | 중복 | 호출 안 u_within | 호출 사이 u_across |
|---|---|---|---|---|
| T1 구조해시 | 120 | 0 | — 분해능 없음 | — 분해능 없음 |
| T2 = T3 | 120 | 56 | **0.936** [0.871, 0.986] → **flat** | **0.512** [0.369, 0.656] → undefined |

판정 층위 T2. 등록된 판정으로는 `u_across`가 **undefined**(구간이 0.50~0.80을
가로지름)이다. 문턱은 안 옮겼다.

### 그런데 이 두 숫자의 **차이**가 이번 실행의 답이다

구간이 겹치지도 않는다(0.871~0.986 vs 0.369~0.656). 뜻은 이렇다:

- **한 응답 안에서** 모델은 자기를 거의 반복하지 않는다(0.936).
- **다시 부르면** 새 구조는 절반뿐이다(0.512).

설계 §2에서 "60개를 한 번에 요구하지 않는다"고 정한 이유가 숫자로 확인됐다.
한 번에 60개를 받았으면 **0.94를 보고 "다양성 충분, 생성기 교체 불필요"라고
결론 냈을 것이다.** 실제로 우리가 쓰는 방식(다시 부르기)에서는 절반이 재탕이다.

### 곡선이 개념마다 다르다 — 다음 등록이 고칠 것

`save`의 새것 비율: 1.00 → 0.67 → 0.50 → 0.50 → 0.50 → 0.29 → **0.00 → 0.00** → 0.17
(서로 다른 구조 26개에서 바닥. 7~8회차에 고갈)
`inventory`: 0.83 → 0.50 → 0.80 → 1.00 → 0.33 → 0.80 → 0.83 → 0.17 → 0.33
(38개까지 계속 늘어남. 10회로는 안 끝남)

즉 **어떤 개념은 고갈되고 어떤 개념은 안 된다.** 두 개념을 평균 내는 지금 추정량은
이 차이를 뭉갠다. 다음 판에서는 개념별로 판정하거나 곡선을 적합해야 한다 —
평균 하나로는 "생성기를 바꿀 가치"가 안 나온다.

### 사고로 얻은 대조 (사전 등록 아님 — 확정 판정으로 쓰지 않는다)

같은 개념·모델·온도에서 **예시만** 다른 두 회차가 생겼다:

| 회차 | 예시 | 후보 | 통과 | 통과율 |
|---|---|---|---|---|
| 1회차(내 실수) | 없음 | 132 | 20 | **0.15** |
| 2회차(교정) | 있음 | 121 | 120 | **0.99** |

방향과 크기가 크고, 오늘 프롬프트 통제(`with_spec` 0.385 / `no_spec` 0.0)와
같은 곳을 가리킨다: **순응을 만드는 것은 스펙 문장이 아니라 이미 통과한 자산이다.**
다만 이건 **사고의 부산물**이지 사전 등록된 비교가 아니다. 확정 판정을 원하면
등록하고 재현해야 한다.

# 2026-08-26 야간 (사장님 취침, 포괄 승인) — `docs/night-2026-08-26.md`

## 23:29 — 예시 용량-반응: **examples_carry_compliance** (밤의 첫 확정 판정)

사전 등록 `docs/example-dose-v0-design.md`. 실지출 **$0.170474**, 27호출 184.9초,
재시도 0. 기록 `data/example_dose_v0.json`. 부트스트랩은 **개념 단위**(오늘 낮에
후보 단위로 잡아 구간이 좁게 나온 실수를 고친 것).

| 팔 | 예시 | 통과 | 통과율 | 위반 상위 |
|---|---|---|---|---|
| `ex0` | 0개 (세트의 첫 아이콘) | 1/56 | **0.018** | linecap 50, linejoin 50, grid 22 |
| `ex1` | 1개 (둘째) | 46/55 | **0.836** | shape수 5, fill 4, grid 3 |
| `ex3` | 3개 (넷째 이후) | 50/55 | **0.909** | grid 3, shape수 1, padding 1 |

`D = rate(ex3) − rate(ex0) = +0.891`, 95% 구간 **[+0.815, +0.964]** →
관문 0.20을 크게 넘어 **examples_carry_compliance**. 표본 관문도 충족
(개념 9, 팔당 55~56).

### 하나면 충분하다 (판정 아님, 기술 통계)

- `d01 = +0.819` [+0.667, +0.945] — **첫 예시 하나가 거의 전부를 한다.**
- `d13 = +0.073` [−0.074, +0.241] — 둘째·셋째 예시는 구간이 0을 물고 있다.

### 스펙 문장이 못 가르치는 것이 무엇인지가 드러났다

`ex0`의 실패는 **획 끝모양·이음새**에 몰려 있다(각각 50/56). 스펙 문장에
`stroke-linecap: round`라고 **분명히 적혀 있는데도** 모델이 안 지킨다. 그런데
예시 하나를 보여주면 그 항목이 거의 사라진다(50 → 0). 격자도 22 → 3.

오늘 낮 프롬프트 통제에서 본 것과 맞물린다: 스펙 텍스트는 `stroke-width` 같은
**단일 값**은 가르치고, **모양의 습관**(끝모양·이음새·격자)은 못 가르친다.
그건 예시가 가르친다.

### 제품으로 옮기면

**세트에서 어려운 것은 첫 아이콘 하나뿐이다.** 첫 장은 통과율 0.018이고 둘째부터
0.84다. 그러므로 새 세트의 비용은 "N장 × 단가"가 아니라 **"첫 장 + (N−1)장의
싼 값"** 이다. 설계도 견적(코인)에 이 구조가 들어가야 한다.

거꾸로, 이건 우리 심판이 **자체 생성물에 대해 물러진** 이유이기도 하다 — 통과분을
예시로 되먹이면 통과율이 0.98로 올라간다. 그 0.98은 심판이 느슨해서가 아니라
**되먹임 때문**이다.

## 23:29 — 이중 구현 열거형 전수: **exact** (지출 0)

`docs/dual-implementation-v0-design.md` §5의 나머지 절반. 수치 축은 낮에 했고
열거형은 미뤄 뒀던 것을 채웠다.

| 제약 | 문서 | 통과한 값 | |
|---|---|---|---|
| `stroke.linecap` | round | round만 | exact |
| `stroke.linejoin` | round | round만 | exact |
| `fill` | none | none만 | exact |
| `palette` | currentColor | currentColor만 | exact |
| 요소 14종 | 허용 7 / 금지 7 | **14/14 기대대로** | exact |

`polygon`이 허용 목록에 없어 FAIL이 나오는 것까지 기대와 같다(스펙이 그렇게
적혀 있다 — polyline은 허용, polygon은 아니다).

## 23:33 — 인-스펙 변이 v0.2: 요소 표기 바꾸기 (지출 0)

사전 등록 `docs/inspec-metamorphic-v0-design.md` §8(구현 **전** 커밋).
`circle`·`rect`·`line`·`polyline`을 **같은 그림의 `path`로** 바꾸는 연산을 넣었다.
그림은 한 점도 안 움직이고 요소 이름만 바뀐다 — 심판이 이걸 떨어뜨리면 그림이
아니라 **표기를 재고 있다**는 뜻이다.

기존 변이는 전부 좌표를 건드려서, 자산이 `path` 위주면 나머지 요소가 사실상
안 밟혔다(08-27 계획 ⑤의 남은 절반).

| | 전 | 후 |
|---|---|---|
| 골든 `inspec_control` | 47 | **49** (통과율 1.0 유지, GO 유지) |
| 못 만든 변이 | 5 | 7 (path뿐인 자산은 바꿀 도형이 없다 — 사유와 함께) |

렌더 검증: 실제 자산에서 픽셀 차 **0.0 ~ 3.6e-05**. 이빨로 "모서리 하나 빠뜨린
가짜 rect 변환"을 넣어 검사가 반응하는지도 확인했다.

**기존 테스트 하나가 또 가정을 들고 있었다** — "변이는 path 수를 보존한다"였는데,
표기를 바꾸는 연산은 정의상 path·명령 수가 바뀐다(`line→path 치환`이 이미 그랬다).
테스트를 느슨하게 푸는 대신 **설계 §8에 무엇이 보존되고 무엇이 바뀌는지 표로
명시**하고 그 둘만 면제했다.

## 23:38 — 개념 6개 고갈표, 그리고 **자를 고친 일**

`data/diversity_run_v1_run3.json`(map·settings, $0.128), `..._run4.json`
(quest·equipment, $0.129) 추가 실행. 개념 6개가 됐다.

### 먼저: 퇴화한 판정을 하나 버렸다

첫 계산에서 사다리가 **T1(구조해시)** 을 골랐고 여섯 개념 전부 `flat`,
세트 판정 `generator_fine`이 나왔다. **채택하지 않았다.**

초안의 분해능 기준이 `중복 > 0`이었는데, 후보 약 350건에서 T1 중복이 **1건**
나온 것으로 "이 자는 가른다"가 됐다. 실제 T1의 새것 비율은 여섯 중 다섯에서
정확히 **1.000 [1.000, 1.000]** — 천장에 붙어 아무것도 못 가르는 자다.

새 기준(§6, 파라미터 0개): **새것 비율 구간이 1.0을 물면 그 층위는 분해능이 없다.**
1.0은 그 통계의 정의상 천장이므로 새 숫자를 고른 것이 아니다. 판정 문턱
(0.80/0.50)은 손대지 않았다. 퇴화 결과는 `data/diversity_by_concept_v0.legacy.json`
에 남겼다.

### 고친 자로 본 여섯 개념 (T2)

| 개념 | 새것 비율 | 95% 구간 | 판정 | 구조 관측/Chao1 |
|---|---|---|---|---|
| save | 0.402 | [0.212, 0.606] | undefined | 26 / 41 |
| inventory | 0.622 | [0.441, 0.796] | undefined | 38 / 57 |
| map | 0.522 | [0.411, 0.611] | undefined | 32 / 176 |
| settings | 0.532 | [0.354, 0.698] | undefined | 22 / 37 |
| quest | 0.413 | [0.241, 0.616] | undefined | 27 / 63 |
| equipment | 0.388 | [0.222, 0.575] | undefined | 26 / 40 |

여섯 개념이 **전부 개별 undefined**이고, 점추정은 0.39~0.62로 놀랍도록 모여 있다.
세트 판정도 undefined(판정된 개념 0).

## 23:42 — 검정력: **더 불러도 안 서는 개념이 있다** (지출 0)

`tools/diversity_power.py` — 관측된 호출별 값을 재표본해 "호출을 늘리면 판정이
설 확률"을 시뮬레이션했다. 계획 도구이고 문턱은 건드리지 않는다.

| 개념 | 관측 | 10회 | 30회 | 80회 |
|---|---|---|---|---|
| equipment | 0.39 | 26% | 61% | **95%** |
| save | 0.40 | 24% | 50% | **83%** |
| quest | 0.41 | 26% | 39% | 74% |
| map | 0.52 | 1% | 0% | **1%** |
| settings | 0.53 | 2% | 1% | **1%** |
| inventory | 0.62 | 2% | 0% | **0%** |

**표본을 아무리 늘려도 안 서는 개념이 셋이다.** 참값이 문턱 사이(0.50~0.80)에
있으면 구간이 아무리 좁아져도 어느 쪽 문턱도 못 넘는다. 돈 문제가 아니라
**판정식의 구조**다.

### 그래서 Q1은 이렇게 닫는다

"생성기를 바꿀 가치가 있나"는 이 판정식으로는 **영원히 안 나온다.** 대신 우리가
실제로 잰 것은 이것이다:

> **다시 부를 때 새 구조가 나올 확률 ≈ 0.5.** 즉 **새 아이콘 하나당 생성 후보
> 약 2개**, 후보당 $0.001 → **새것 하나에 약 $0.002.**

이 값이 비싼가는 통계가 아니라 **사장님이 정할 사업 문턱**이다. 기계는 여기까지
잴 수 있고, 나머지 한 칸은 사람 몫이다. 아침에 이 한 줄로 여쭙는다.

## 23:44 — 같은 설정이 0.385와 0.018을 냈다: 뭉침의 크기를 재다

21:31 프롬프트 통제의 `with_spec`(스펙 있음·예시 없음)은 10/26 = **0.385**였고,
23:29 용량-반응의 `ex0`(**같은 설정**)은 1/56 = **0.018**이었다.

버그가 아니라 **호출 단위 뭉침**이다. 한 호출의 후보 6개는 통과·탈락이 같이 간다
(그 호출이 끝모양·격자 같은 습관을 통째로 잡는다). 유효 표본은 후보가 아니라
호출이고, 그러면 2/4 대 0/9다 — 전혀 극단적이지 않다.

즉 v0의 후보 단위 부트스트랩은 정밀도를 **약 6배 부풀렸다.** v0 판정이
`undefined`였던 건 운이 좋았던 것이지 정확했던 게 아니다. `prompt_ablation`을
**호출 단위**로 고치고(v1 §6), 두 단위의 구간을 나란히 기록하게 했다.
테스트로 "후보 단위가 더 좁다"를 못 박았다 — 다시 이 실수로 돌아가면 걸린다.

## 23:48 — 프롬프트 통제 v1(호출 단위): **spec_helps** — 밤의 두 번째 확정 판정

사전 등록 `docs/prompt-ablation-v0-design.md` §6(v1). 실지출 **$0.21109**,
36호출 243초. 기록 `data/prompt_ablation_v1.json`.

| 팔 | 통과 | 통과율 | 위반 상위 |
|---|---|---|---|
| `with_spec` (스펙 있음·예시 없음) | 57/116 | 0.491 | grid 41, linecap 31, linejoin 31 |
| `no_spec` | 1/112 | 0.009 | **stroke.width 103**, fill 30, grid 20 |

`d = +0.487`, **호출 단위** 95% 구간 **[+0.296, +0.680]** → 하한이 관문 0.20을
넘어 **spec_helps**. 표본 관문 충족(팔당 18호출, 개념 9).

낮의 v0(하한 0.1923으로 0.0077 미달)이 이제 반복으로 뒤집혔다. **문턱을 옮겨서가
아니라 표본 단위를 고치고 호출을 4→18로 늘려서다.**

### 뭉침의 크기를 숫자로

`with_spec`의 호출별 통과율:
`0.0, 1.0, 0.29, 1.0, 1.0, 1.0, 0.57, 0.0, 0.0, 0.0, 0.5, 0.29, 0.0, 0.86, 0.83, 1.0, 0.57, 0.0`

**0.0이 6번, 1.0이 5번.** 한 호출은 통째로 붙거나 통째로 떨어진다. 같은 자료에
두 단위를 대면:

| 단위 | 구간 | 폭 |
|---|---|---|
| 후보(v0 방식) | [+0.388, +0.569] | 0.18 |
| **호출(v1)** | [+0.296, +0.680] | **0.38** |

후보로 세면 구간이 **2.1배 좁아 보인다.** 판정이 같은 쪽으로 나왔어도 그건
운이고, 낮에는 그 부풀림이 0.0077 차이를 만들었다.

### 회차 간 변동이 크다 — 점추정 하나를 믿으면 안 된다

**같은 설정**(스펙 있음·예시 없음)의 통과율이 오늘만 세 번 이렇게 나왔다:

| 시각 | 호출 | 통과율 |
|---|---|---|
| 21:31 | 4 | 0.385 |
| 23:29 | 9 | **0.018** |
| 23:48 | 18 | **0.491** |

세 회차를 합치면 31호출 68/198 = 0.34다. **한 회차의 점추정으로 제품 이야기를
하면 안 된다** — 오늘 밤 우리가 쓸 수 있는 문장은 호출 단위 구간을 낀 것뿐이다.

### 두 확정 판정을 나란히 놓으면

| 무엇이 순응을 만드나 | 판정 | 크기 |
|---|---|---|
| **예시**(0개 → 3개) | `examples_carry_compliance` | D = +0.89 [0.82, 0.96] |
| **스펙 문장**(없음 → 있음, 예시 0 상태에서) | `spec_helps` | d = +0.49 [0.30, 0.68] |

둘 다 효과가 있고 **예시가 더 크다.** 그리고 무엇을 가르치는지가 다르다:
스펙 문장은 `stroke-width` 같은 **단일 값**(no_spec에서 103/112 위반), 예시는
**모양의 습관**(끝모양·이음새·격자). 둘을 다 줘도 격자·끝모양에서 여전히 절반이
떨어진다 — 그게 다음에 손댈 자리다.

## 23:5x — 설계도 엔진 계약 둘 (지출 0), 그리고 **돈 나가는 구멍** 하나

### 되묻기: "대체 없음"을 선언으로 바꿨다

`art_mood_fit`·`music_mood_fit`은 심판 없음인데 `reconstruct_to`가 없어서,
되묻기가 `→ 재구성: (대체 없음)`이라고만 적고 있었다. **못 한 것인지 안 한
것인지 구분이 안 된다.** 두 원자에 `no_reconstruction` 사유를 선언하고(둘 다
"규격 부분은 이미 분리돼 있고 남은 분위기는 사람 눈 게이트"), 되묻기가 그 문장을
그대로 보여주게 했다. 사유 없는 원자가 들어오면 **"사유가 선언되지 않았다
(레지스트리 결함)"** 라고 말한다 — 테스트가 그 이빨을 지킨다.

### 견적: 빈 선택이 "전부"로 접히고 있었다

계약 시험 `test_picking_more_never_costs_less`를 쓰자마자 걸렸다:

```
estimate(recon, pick=[])  → 320코인   # 아무것도 안 골랐는데 전부 값
estimate(recon, pick=[한 개]) → 30코인
```

원인은 `picks = set(pick) if pick else None` — **빈 목록이 "안 고름"과 같이
접혔다.** 돈이 나가는 자리에서 조용한 기본값이다. `None`(안 고르심)과
`[]`(아무것도 안 고르심)을 갈랐고, 후자는 0코인 + `picked_none: true`다.

### 그 밖에 못 박은 계약

- **실종 금지**: `keep = checklist ⊎ human_gate`. 어느 쪽에도 없으면 약속이
  조용히 부풀거나 준다.
- 체크리스트 자격 넷(이빨·측정 재료·어댑터·설계도 읽기)을 행마다 재확인.
- 커버리지 두 값이 자기가 주장하는 비율과 실제로 같은지.
- 코인 단조성, 원 페그 노출(가격 숨김 금지), `selected ⊆ recommended`.

## 2026-08-27 00:0x — **지출 상한에 걸렸다** ($1.00 누적)

후처리 스냅 실험을 실호출로 돌리려 했더니 지갑이 거부했다:

```
RuntimeError: 누적 지출 $1.0762 >= 상한 $1.00 - 거부
```

`tools/proposer.py`의 `SPEND_CAP_USD = 1.00`은 이 도구의 **누적** 상한이다.
오늘 하루에 $1.0735를 써서 넘겼다.

**상한을 올리지 않았다.** 사장님이 야간 포괄 승인을 주셨지만, 이건 코드에 박아둔
상시 안전장치이고 그 값을 바꾸는 것은 실험 하나 승인과 다른 종류의 결정이다.
아침에 여쭙는다(§아침 브리핑). 그때까지 **유료 경로는 전부 멈춘다.**

## 2026-08-27 00:0x — 스냅: 지출 0으로 낼 수 있는 절반만 냈다

사전 등록 `docs/snap-fix-v0-design.md`. 구현 `genesis/snap_fix.py`,
실험 `tools/snap_experiment.py`. 목 파일럿에서 기계는 확인됐다
(원본 통과 0.000 → 스냅 0.667, 금지 요소는 그대로 탈락 = 설계대로).

실호출이 막혔으므로 **이미 저장된 통과분 69건**(pick-v1·v2)으로 돌렸다:

| | 값 |
|---|---|
| 그림 손상 | median r = **0.000** [0.000, 0.000] → `encoding_only` |
| 통과율 판정 | **undefined (corpus_is_all_passing)** |

즉 **이미 규격에 맞는 아이콘을 스냅해도 그림이 안 변한다**(스냅이 무해하다는
증거). 하지만 **스냅이 탈락분을 살리는지는 이 표본으로 알 수 없다** —
원본이 전부 통과인 표본에서 "스냅 후 100% 통과"는 스냅의 증거가 아니라 표본이
통과분이라는 사실의 되풀이다. 코드가 그 판정을 **거부하도록** 못 박았다
(`corpus_is_all_passing`), 테스트도 붙였다.

남은 절반(탈락분에서 통과율이 얼마나 오르나)은 **상한을 올려주시면** 9호출
약 $0.06으로 끝난다.

## 2026-08-27 00:2x — 성급한 결론을 순열검정이 뒤집었다 (지출 0)

세트 시각 무게 폭을 확인하다가 두 숫자를 보고 사장님께 **"세트로 보면 사장님
선택이 기계보다 낫다"** 고 말했다. 재보니 **틀렸다.**

| | 폭 | 무작위 세트 중 백분위 |
|---|---|---|
| 기계 첫 통과분(각 개념 `c01`) | 0.1696 | **0.92** (거의 최악) |
| 사장님이 고른 8개 | 0.1357 | **0.71** |
| 무작위 중앙값 | **0.1125** | — |

즉 사장님 세트는 **기계 첫 통과분보다는 낫지만 무작위보다 못하다**(p = 0.705,
`no_signal`). 내가 비교 상대를 하나만 놓고 결론을 냈다. 등록 문서에 "이건
탐색적이고 숫자를 먼저 봤다"를 적어두고 돌린 게 이 정정을 만들었다
(`docs/pick-weight-spread-v0-design.md` §0).

**참인 것은 따로 있다**: **"첫 통과분 채택"이라는 기계 정책이 세트로 보면
거의 최악(백분위 0.92)이다.** 이건 취향과 무관하게 기계가 고칠 수 있는 축이다.

## 2026-08-27 00:3x — 재고도 안 물려 있던 세트 규칙을 물렸다

`judge_set`이 시각 무게 폭을 **재고 있었는데**(0.1696 > 관문 0.15) 세트는
"8/8 통과"로 나왔다. 잰 규칙이 아무 판정에도 안 물리면 그건 장식이다.

- `set_verdict`(PASS/FAIL/**UNDEFINED**)와 `set_rules` 넷을 추가했다:
  획 굵기 하나 · 구조 중복 없음 · 시각 무게 폭 · 개별 전부 통과.
  못 잰 규칙이 하나라도 있으면 fail이 아니라 **undefined**다(심판대 규율 4).
- **파서가 "미측정"이라고 단정하던 문자열을 없앴다.** `icon_lane.set_consistency`가
  `optical_weight: "미측정 - 래스터라이저 필요"`를 반환하고 있어서, 실제로 잰
  회차에도 미측정이라고 말하고 있었다. 이제 `None` + 사유이고, 채우는 것은
  래스터를 가진 `icon_judge`다.
- 테스트로 못 박았다: 개별이 전부 통과인데 세트가 FAIL인 그 상황을 그대로 시험한다.

## 2026-08-27 00:4x — 그리고 그걸 **되묻기**로 바꿨다 (`tools/set_impact.py`)

북극성이 "재구성해서 되묻기"이므로, 세트 규칙도 판정으로 끝내지 않고 사람이
고칠 수 있는 형태로 돌려준다. 실제 출력:

```
지금 고르신 세트의 시각 무게 폭은 0.136입니다(관문 0.15). 관문 안입니다.
폭을 줄이는 자리는 이렇습니다:
  - 06_stats: 지금 c01(무게 0.278) → c02(무게 0.175)로 바꾸면 폭 0.136 → 0.068
  - 05_equipment: 지금 c03(0.143) → c02(0.184)로 바꾸면 0.136 → 0.131
그래도 지금 고르신 것으로 갈까요? 세트 일관성은 기계가 재지만,
무엇이 좋은지는 사장님이 정합니다.
```

`06_stats`에서 고르신 것이 그 개념 풀의 **최대 무게**(0.2783)이고, 그 한 자리가
세트 폭의 대부분을 만든다. 한 자리만 바꾸면 폭이 **절반 아래**로 내려간다.

**기계가 바꾸지 않는다.** 테스트가 그걸 지킨다 — 이 도구는 선택 기록을 건드리지
않고(파일 시각 확인), 되묻기 문장에 "바꾸겠습니다·자동으로" 같은 말을 못 쓴다.

## 2026-08-27 07:0x — 지출 상한 $1.00 → **$10.00** (사장님 승인)

사장님 "돈 상한 늘리자". 숫자는 내가 골랐고 근거는 이렇다:

- 08-26 하루 실지출이 **$1.0735**였다. $1 상한은 하루치도 못 담는다.
- 지금 막혀 있던 것: 모델 티어 비교(가장 큰 질문 — "돈 안 써서 퀄리티가 낮은가"),
  스냅 실험의 나머지 절반($0.06), 취향 라운드.
- $10이면 오늘 같은 날 아홉 번이다. **여전히 안전장치로 산다** — 사고가 나도
  $10에서 멈춘다.

`tools/proposer.py`에 **변경 이력을 주석으로** 남겼다(누가 언제 왜 올렸는지).
규칙은 그대로다: 상한은 사장님이 직접 올릴 때만 바뀐다
(`docs/measurement-rules.md` §8).

남은 예산: **$8.92**.

## 2026-08-27 07:3x — 티어 비교: **tier_helps**. 사장님 지적이 규격 층에서 확인됐다

사전 등록 `docs/tier-compare-v0-design.md`(+ §7 개정: 첫 실행 중단).
실지출 **$1.158624**, 54호출 652초. 기록 `data/tier_compare_v0.json`.
조건은 **예시 0개**(세트의 첫 아이콘 = 가장 어려운 자리), 표본 단위는 **호출**.

| 팔 | 통과 | 통과율 | 위반 상위 | 지출 | **통과분당** |
|---|---|---|---|---|---|
| `haiku` (현행) | 32/116 | **0.276** | grid 51, linecap 45, linejoin 45 | $0.111 | **$0.0035** |
| `sonnet-5` | 94/108 | **0.870** | padding 6, shape 4, grid 3 | $0.513 | **$0.0055** |
| `opus-5` | 105/108 | **0.972** | padding 1, grid 1 | $0.535 | **$0.0051** |

- `d(sonnet − haiku) = +0.581` [+0.394, +0.753] → **tier_helps**
- `d(opus − haiku) = +0.683` [+0.515, +0.833] → **tier_helps**

**"돈을 안 써서 퀄리티가 낮다"는 사장님 지적이 맞았다** — 적어도 규격 층에서는.
haiku가 어제 밤 예시 0개에서 0.018이었고 오늘 같은 조건에서 0.276이다(회차 변동은
여전히 크다). 상위 티어는 0.87·0.97로 **다른 구간**에 있다.

### 뒤집히는 것: 통과분당 단가는 거의 같다

haiku $0.0035 vs opus $0.0051 — **1.5배 차이뿐이다.** 호출당 단가는 5배인데,
haiku가 후보의 4분의 3을 버리기 때문에 **쓸 수 있는 것 하나당** 값은 붙어 버린다.
게다가 haiku 통과분은 다양성도 낮다(서로 다른 구조 28 vs 43).

즉 **"싼 티어부터"라는 라우팅 방침은 첫 장 생성에서 틀렸다.** 다만 방침 변경은
비용 구조를 바꾸므로 **사장님 결정**이고, 내가 기본 모델을 바꾸지 않는다.

### 두 교란 요인 (결과에 붙여 읽어야 한다)

1. 상위 티어는 `temperature`를 안 받는다(400) → haiku만 temp 1.0.
2. 상위 티어는 **적응형 사고가 켜진 채로** 돈다(`effort: low`로 낮췄지만 못 끈다).

그러므로 이 비교는 **"티어 + 사고"** 대 **"싼 티어"** 다. 순수한 모델 크기
비교가 아니고, 둘 다 §2-1·§7에 미리 적어 뒀다.

### 중단했던 첫 실행이 이 결과를 만들었다

첫 실행에서 sonnet이 **매 호출 정확히 3000 토큰**(=`max_tokens`)에 걸리는 걸 보고
2분 만에 멈췄다. 그대로 뒀으면 상위 티어 통과율이 **잘림 때문에** 0으로 나왔을
것이고, 결론은 정반대가 됐을 것이다. 중단 기록은 `data/tier_compare_aborted.json`.

## 2026-08-27 07:3x — 취향은 사장님 판으로 (블라인드)

기계는 규격만 판정한다. "더 예쁜가"는 판을 드린다.

- 세 팔의 통과분 **231개**를 개념 9개로 묶고 **티어를 지운 채** 섞었다
  (`tools/blind_pool.py`, 시드 12345). 파일 이름·본문·순서 어디에도 모델 이름이
  없다(테스트로 강제).
- 판: `out/icons/tier-blind/sheet.html` (개념당 20~30개)
- 정답지: `data/tier_blind_key.json` — **선별이 끝난 뒤에만 연다.**

사장님이 개념마다 하나씩 고르시면, 고른 것의 티어 분포를 그때 집계한다.
9개념은 검정력이 약하므로 이번 회차는 **탐색적**이다(설계 §5).

## 2026-08-27 08:0x — 블라인드 선별: **사장님 눈이 haiku를 걸러낸다**

기록 `data/picks/tier-blind-v1.json`(먼저 커밋), 집계식은 정답지를 열기 전에
동결(`docs/tier-compare-v0-design.md` §8), 집계 `data/tier_blind_tally_v0.json`.
귀무값은 균등이 아니라 **각 개념 풀의 실제 구성**(판이 기울어 있다).

| 티어 | 고른 수 | 무작위 기대 | 판 점유 | p(순열, 양측) | 판정 |
|---|---|---|---|---|---|
| sonnet 5 | 18 | 13.07 | 0.41 | 0.0759 | undefined |
| opus 5 | 13 | 14.27 | 0.45 | 0.6893 | undefined |
| **haiku 4.5** | **0** | 3.66 | 0.14 | **0.0252** | **avoided** |

31개를 고르셨는데 **haiku는 하나도 없다.** 판의 14%가 haiku였으니 무작위였다면
3~4개는 섞였어야 한다.

### 세 문장으로

1. **싼 티어는 눈에 걸린다.** 규격 통과율(0.276 vs 0.972)만이 아니라 **통과한
   것들 사이에서도** 사장님이 안 고르신다. "돈을 안 써서 퀄리티가 낮다"는 지적이
   취향 층에서도 확인됐다.
2. **sonnet과 opus는 구분되지 않는다**(p=0.69). 상위 티어 안에서는 눈에 차이가
   없다는 뜻이고, sonnet이 opus의 절반 값이라 **비용에 직결**된다.
3. **이건 취향 심판의 승격이 아니다.** 사람 눈의 분해능을 잰 것이고, 기계 심판은
   여전히 없다(`docs/taste-judge-v0-design.md`의 관문은 그대로).

### 한 회차라는 것

개념 9개·선택 31개 한 회차다. sonnet의 p=0.076은 "치우침이 있어 보이는데 못
잘랐다"이지 "없다"가 아니다. 확정하려면 새 등록으로 독립 반복해야 한다
(표본을 이어 붙이면 optional stopping).

## 2026-08-27 09:2x — 타일·캐릭터 오라클 (게이트 ①의 나머지 둘, 지출 0)

사전 등록 `docs/tile-character-oracle-v0-design.md`(구현 **전** 커밋).
계측기 `genesis/tile_probe.py`, 어댑터 `tile_asset`·`character_set`,
원자 둘 등록: `tile_seam`, `character_set_consistency`.

### 왜 필요했나 — 지금 오라클은 한 장짜리 속성만 봤다

`pixel_art_style`이 재던 것은 파일 무결성·논리 크기·색 수·알파 넷이고 **전부 한
장 안의 값**이다. 그런데 타일과 캐릭터의 결함은 한 장 안에 없다.

### 새 자가 **이미 통과했던 자산에서** 결함을 잡았다

| 자산 | 잰 값 | 뜻 |
|---|---|---|
| PixelLab 타일 16장 | `seam_ratio_x` 중앙값 **5.81** (최대 8.69, 최소 0.66) | 대부분 **이어 붙이면 이음새가 보인다**. 1에 가까운 것은 4장뿐 |
| `merchant` 캐릭터 | `bbox_height_spread` **2** (36 / 38 / 38 / 38) | 방향을 바꾸면 **키가 2픽셀 변한다** — 계약(≤1) 위반 |
| `hero` 캐릭터 | spread 1, 프레임 6·6·6·6 | 통과 |

둘 다 **반입 오라클을 이미 통과한 자산**이다. 크기·색만 맞으면 통과였기 때문이다.

### 문턱은 내가 정하지 않았다

`seam_ratio_x/y`와 `palette_overlap_min`은 **measured·미판정**으로 두고
`tools/threshold_sheet.py`에 올렸다(미동결 9건이 됐다). 실측값을 같이 적어
사장님이 보고 정하실 수 있게 했다. 반면 **프레임 수 같음**과 **키 차 ≤ 1픽셀**은
자연 단위라 문턱이 필요 없어 바로 계약으로 넣었다.

### 감사가 내 실수를 잡았다

`tile_seam`에 "단색 타일은 미정의여야 한다"를 **반례로** 넣었더니 심판대가
`무딤`으로 표시했다 — 반례는 **거절돼야 하는 것**이고 미정의는 거절이 아니다.
빼고 테스트로 옮겼다. 그 뒤 real 원자 13건 전부 이빨, 반례 55건, 자율 100%.

덤으로 계측기 하나도 정직해졌다: 단색 타일이 "3픽셀 미만"이라는 **틀린 사유**로
미정의가 되고 있었다. 이제 "단색 타일 — 내부 변화가 없어 비율이 정의되지 않는다"
라고 적는다.

## 2026-08-27 09:4x — 게임 스모크: 사람이 창을 보던 자리를 기계로 (게이트 ④, 지출 0)

`game/tools/smoke.gd`(SceneTree 스크립트) + `tools/game_smoke.py`.
Godot을 **헤들리스로** 띄워 메인 씬을 올리고 입력을 흉내 낸 뒤 네 가지를 잰다.

```
판정: PASS
  누른 뒤 이동 55.00px (세로 0.00)  뗀 뒤 미끄러짐 0.00px
  본 애니메이션 ['idle_south', 'walk_east']  틱 46
```

**55.00px는 우연이 아니다** — `SPEED 110 × 30틱 / 60fps = 55`. 물리가 실제로
돌았고 값이 설계와 일치한다는 뜻이다.

| 재는 것 | 결과 |
|---|---|
| 오른쪽을 누르면 움직이나 | dx **55.00px** |
| 세로로 흐르지 않나 | dy **0.00** |
| 떼면 멈추나 | 미끄러짐 **0.00px** |
| 방향에 맞는 걷기 애니메이션이 나오나 | `walk_east` 관측 |

### 이빨

`SMOKE_NO_INPUT=1`로 **아무 키도 안 누르는** 주행을 넣었다. 그때 판정이
**FAIL**로 떨어지는 것을 테스트가 강제한다 — 이게 없으면 "항상 PASS"가 검사가
살아 있는 건지 죽은 건지 구분되지 않는다.

Godot이 없는 기계에서는 **fail이 아니라 undefined**(미측정)다. 도구가 없다는
이유로 게임을 탈락시키지 않는다.

### 게이트 ④에서 남은 것

이동·충돌 스모크는 섰다. **자동 조립**(뽑은 자산을 게임에 넣는 것)은 아직이다 —
지금은 08-07 오디션 자산이 손으로 들어가 있다.

## 2026-08-27 10:2x — 자동 조립: 설계도→자산→게임이 이어졌다 (게이트 ④ 50 → 90%)

`tools/icon_export.py` + 스모크의 조립 확인. 지출 0.

지금까지 게임 자산은 **손으로** 들어갔다(08-07 오디션분). 그래서 "설계도 → 자산 →
조립"이 마지막에서 끊겨 있었다. 이제 이어진다:

```
선별 기록(사장님이 고른 8개) → 래스터 24px → game/assets/ui/*.png + manifest
                                          → 게임이 8/8 적재 (헤들리스 확인)
```

- **기계가 고르지 않는다**: 무엇을 넣을지는 `data/picks/*.json`이 정하고, 도구는
  옮기기만 한다. 테스트가 "조립된 것 = 사장님이 고른 것"을 대조한다.
- **빈 그림을 조용히 안 내보낸다**: 내보낸 뒤 다시 재서 잉크 평균이 문턱 아래면
  `suspect`로 표시한다(실측 0.144~0.279, 전부 통과).
- **이빨**: 아이콘 하나를 치우면 게임 스모크가 **FAIL**로 떨어진다
  (`조립 결함: res://assets/ui/attack.png 파일이 없다`). 테스트가 파일을 잠시
  치웠다 되돌리며 그걸 확인한다.

색은 흰색 + 알파로 내보낸다 — 아이콘 스펙이 `currentColor`이므로 색은 게임의
UI 테마가 정한다(자산에 색을 굳히지 않는다).

**남은 것**: 캐릭터·타일은 아직 손으로 들어간다. 아이콘만 자동이다.

## 2026-08-27 10:4x — 세트 규칙을 타일·캐릭터로 (게이트 ③ 70 → 85%)

`genesis/asset_set_probe.py` + 어댑터 `tile_set`·`character_group` +
원자 `tile_set_consistency`. 지출 0.

아이콘은 이미 세트로 봤다(획 굵기·구조 중복·시각 무게). 타일·캐릭터는 낱장만
봤는데, 세트의 결함은 낱장에 없다.

### 실측

| 세트 | 값 | 뜻 |
|---|---|---|
| 오디션 타일 16장 | 크기 **16x16 균일** ✔ | 깔 수는 있다 |
| 〃 | 세트 고유색 **40** (낱장 상한은 24) | **세트 팔레트 상한이 없다** — 한 세계로 보이는지 아무도 안 재고 있었다 |
| 〃 | 최악 이음새 **8.69**(tileset_11), 중앙값 6.04 | 깔면 이음새가 보인다 |
| hero + merchant | 키 36 / 38, 폭 **2** | 캐릭터끼리 키가 2픽셀 다르다 |
| 〃 | 프레임 6·6 균일 ✔, 세트 팔레트 27 | |

**`sizes_uniform`만 계약**(크기가 다르면 애초에 못 깐다)이고, 세트 색 상한과
이음새 문턱은 **미동결**로 문턱표에 올렸다(이제 12건). 실측값을 붙여 뒀으니
사장님이 보고 정하실 수 있다.

심판대: real 원자 **14건 전부 이빨**, 반례 59건, 자율 100%.

## 2026-08-27 11:0x — 조립을 선언으로 (게이트 ④ 90 → 100%)

`data/game_assembly.json`(선언) + `tools/assemble_game.py`(조립기) +
스모크의 캐릭터·타일 검사. 지출 0.

아이콘은 어제 자동이 됐지만 **캐릭터·타일은 손으로** 들어가 있었다. 손으로 넣으면
"무엇이 어디서 왔는지"가 사라진다.

### 선언대로인지 확인해 봤더니

```
캐릭터 hero       파일 28  같음 28  옮김 0   ← PixelLab 오디션 2026-08-07
캐릭터 merchant   파일 28  같음 28  옮김 0   ← PixelLab 오디션 2026-08-07
타일 placeholder [128, 16] (선언 [128, 16]) 크기맞음 True
```

**28/28이 바이트까지 같다.** 게임에 들어 있는 캐릭터가 오디션 산출물 그대로라는
것이 이제 **증명**됐다(지금까지는 그렇다고 믿고 있었다). 테스트가 이걸 지킨다 —
누가 게임 자산을 손으로 고치면 `same != files`가 되어 걸린다.

### 타일은 정직하게 자리표시자라고 적었다

게임의 타일 아틀라스는 **진짜 자산이 아니라 `make_placeholder_tiles.py`가 만든
자리표시자**다. 오디션 타일 16장은 아직 게임에 안 들어가 있고, 넣으면 이음새가
보인다(중앙값 6.04). 이 사실을 선언 파일에 `honest_note`로 박아 뒀다.

### 이빨 둘

- 아이콘 하나를 치우면 → 게임 FAIL
- **캐릭터 방향 하나(merchant/north)를 치우면 → 게임 FAIL**

지금까지는 캐릭터가 하나 사라져도 아무도 몰랐다. 테스트가 파일을 잠시 치웠다
되돌리며 둘 다 확인한다.

### 규율

조립기는 `--apply` 없이는 **아무것도 안 건드린다**. 무엇을 넣을지는 선언이 정하고,
덮어쓰기 전에 무엇이 다른지 먼저 말한다.

## 2026-08-27 11:3x — 취향 재시험 1회차: **0.40**, 판정은 undefined

사전 등록 `docs/taste-retest-v0-design.md`(+ §6). 지출 0. 사장님 손 약 5분.
도구 `tools/retest_board.py`(문서에만 있고 구현이 없던 것을 오늘 만들었다).

| 자리 | 1회차 | 재시험 | |
|---|---|---|---|
| attack | c03 | c03 | 같음 |
| shop | c05 | c05 | 같음 |
| equipment | c03 | c01 | 다름 |
| stats | c01 | c03 | 다름 |
| dialogue | c04 | c05 | 다름 |

**2/5 = 0.40**, 정확 구간 [0.053, 0.853]. 관문 0.75를 물고 있어 `undefined`.
무작위 0.167보다는 확실히 높다.

### 읽는 법

- **사장님 선택은 무작위가 아니다**(0.40 > 0.167). 취향은 있다.
- **그러나 관문 0.75에는 한참 못 미친다.** 그리고 이 0.40은 천장의 **상한 쪽**
  추정이다 — 1회차와 하루밖에 안 지났고(권고는 이틀), `shop`·`stats`는 직전에
  같은 후보를 본 상태에서 고르셨다. 둘 다 재현율을 **올리는** 편향이다.
- 즉 진짜 천장은 0.40보다 낮을 가능성이 높고, 그렇다면 **관문 0.75는 사람이
  못 넘는 선**이다. 다만 이건 아직 **추정이지 판정이 아니다.**

### 사장님이 "불가능으로 확정하자"고 하셨을 때

측정이 그 말을 지지하지 않아서 **확정하지 않았다.** 대신 둘로 갈라 드렸다:
(가) 자리를 채워 측정으로 확정 시도, (나) 결정으로 폐기(기록에 "결정"이라고 적힘).
사장님이 (가)를 고르셨고, 그래서 두 자리를 더 받아 n=5를 채웠다. 그래도 상한이
0.853이라 확정은 안 됐다.

### 2회차를 등록했다 (표본을 이어 붙이지 않는다)

결과를 보고 자리를 늘리는 것은 optional stopping이다. 그래서 남은 자리 **7개
전부**로 독립 2회차를 등록하고, 판정은 **2회차만으로** 낸다.
미리 계산: **2개 이하 일치 → 상한 0.710 → 관문 불가능 확정.** 3개 이상이면 또
undefined. 1회차 관측이 참값이면 확정될 확률은 **반반**이다.

## 2026-08-27 11:4x — 취향 라인 **중단** (사장님 지시) · 최종 저장

> "스탑하고 취향은 여기서 멈추자 최종 저장"

2회차는 **등록만 되고 실행되지 않았다.** 판과 대조표는 남겨 두었으니 언제든
그대로 쓸 수 있다(`out/icons/retest-v2.html`, `data/picks/retest-v2.board.json`).

### 멈춘 자리의 사실

| | |
|---|---|
| 재현율 | **0.40** (2/5) · 구간 [0.053, 0.853] |
| 관문 | 0.75 → **미달·미확정** |
| 무작위 | 0.167 |
| 판정 | **undefined** |

**확정된 것**: 사장님 선택은 무작위가 아니다.
**모르는 것**: 관문 0.75가 사람이 넘을 수 있는 선인지.

### 이 중단의 뜻 (부풀리지 않고)

게이트 ②가 "취향 심판 승격"인데 그 관문의 달성 가능성이 미확정인 채로 멈췄다.
그러므로 **지금 정의로는 게이트가 닫히지 않는다** — 다른 층을 아무리 올려도.
여는 길 셋(2회차 실행 / 관문 재정의 / 영구 human_gate 선언)은 전부 사장님
결정이고, 내가 고르지 않는다(`docs/taste-retest-v0-design.md` §7).

### 오늘 하루 (08-27) 최종 상태

| 층 | 아침 | 지금 |
|---|---|---|
| ① 규격 3종 | 40% | 40% (타일·캐릭터 자를 만들었지만 문턱·생성은 남음) |
| ② 취향 | 10% | **15% · 중단** |
| ③ 세트 | 70% | **85%** |
| ④ 조립·스모크 | 50% | **100%** |
| ⑤ 완주 | 0% | 0% |
| **평균** | 34% | **48%** |

오늘 실지출 **$1.36**(티어 비교 $1.158 + 블라인드 판 재사용), 누적 상한 $10 중
남은 **$7.6**. 테스트는 전부 초록.

## 2026-08-27 13:1x — 완주 시도 (게이트 ⑤ 0 → 50%)

사전 등록 `docs/full-run-v0-design.md`(구현 **전** 커밋). 목 파일럿 → 실행 둘.
실지출 **$0.107**(haiku $0.020 + opus $0.087). 기록 `data/full_run_*.json`.

요청 문장 하나("아이콘 세트 만들어줘")에서 게임까지 여덟 칸을 지나며
**어디서 사람이 필요한지**를 셌다. 성공이 목표가 아니라 **멈추는 자리를 찾는 것**이
목표였다(등록 §1).

| 칸 | 목 | haiku | **opus 5** |
|---|---|---|---|
| 1 요청 분해 | auto | auto | auto |
| 2 재구성·되묻기 | auto | auto | auto |
| 3 설계도·견적 | 승인 | 승인 | 승인 |
| 4 자산 생성 | auto | 승인 | 승인 |
| 5 낱개 심판 | **수리**(0 통과) | auto (6/18, `potion`만) | **auto (18/18, 세 개념 전부)** |
| 6 세트 심판 | 미정 | **미정**(통과 개념 <2) | **auto — PASS** |
| 7 선별 | **선택** | **선택** | **선택** |
| 8 조립·게임 | auto | auto | auto |
| **판정** | stopped | stopped | **stopped** |
| 개입 계수 | fix 1·미정 1 | 미정 1 | **fix 0 · 미정 0** |

### 오늘의 두 실험이 여기서 만난다

아침 티어 비교가 예측한 것이 그대로 나왔다 — haiku는 첫 장(예시 0개)에서
세 개념 중 하나만 통과했고, opus는 전부 통과했다. **모델 티어가 완주의
병목이었고, 그 병목은 돈으로 사라진다.**

### 남은 장애물은 정확히 하나다

opus 기준으로 남은 개입은 **승인 둘**(견적·지출)과 **선별 하나**다.
승인은 사장님이 "예"라고만 하면 되는 것이고, **선별은 구조적**이다 —
"심판은 거를 뿐 고르지 않는다"는 규율 때문이고, 그 규율이 풀리려면
**취향 심판이 승격**돼야 한다.

> **그런데 취향 라인은 오늘 11:4x에 중단됐다.**
> 즉 완주를 막는 유일한 구조적 장애물이, 우리가 오늘 멈춘 그 층이다.

### 왜 100%가 아니라 50%인가 (정직하게)

- 8번 칸은 **새로 만든 아이콘을 게임에 넣은 것이 아니다.** 선별이 안 끝났으므로
  기존 자산을 확인만 했다. 고리가 완전히 닫힌 게 아니다.
- 1회차다. 개념 3개, 세트 하나.
- 요청 문장이 레지스트리 별칭에 걸리는 쉬운 문장이었다(자유 문장은 여전히 못 받는다).

## 2026-08-27 13:4x — 게이트 빨간불 다섯을 쫓아가니 **인코딩 하나**였다

오늘 저녁 전체 게이트가 세 번 빨간불이었다(5건 → 4건 → 3건). 세 갈래로 짚었고
**둘은 맞고 하나는 틀렸다.**

| 짚은 것 | 맞았나 | 결과 |
|---|---|---|
| 테스트가 자산 파일을 옮겨 경쟁 | **맞음** | 파일을 안 건드리고 "없는 척"하는 스위치로 교체(`SMOKE_DROP_ASSET`) |
| 실험 도구가 등록부에 없음 | **맞음** | 오늘 만든 도구 7개 전부 등록(총 17건) |
| Godot 두 개가 프로젝트를 두고 다툼 | **틀림** | 두 개를 동시에 띄워보니 멀쩡했다. 잠금은 해롭지 않아 남겨 둠 |

진짜 원인은 셋 다 아니었다.

```python
subprocess.run(..., text=True)     # 기계 기본 코드페이지(cp949)로 읽는다
```

이 기계는 한국어 Windows다. Godot이 낸 **한글 실패 메시지**에서 디코딩이 터지면
출력이 통째로 사라지고, 그러면 **FAIL이 UNDEFINED로 둔갑한다.**

### 왜 이게 최악의 고장인가

방향이 나쁘다. **실패가 "못 쟀다"로 바뀐다** — 심판이 조용히 무력해지는 쪽이다.
게다가 **통과할 때는 출력에 한글이 없어서 안 터진다.** 그래서 단독 실행은 늘
초록이었고, 어제 "이빨을 붙였다"고 보고한 뒤로도 계속 안 보였다.

`encoding="utf-8", errors="replace"`로 명시하고, **한글 실패 메시지가 파이프를
넘어오는지**를 테스트로 박았다.

### 오늘 배운 것 (도구가 아니라 절차)

내가 만든 테스트를 **병렬 게이트에서 확인하지 않았다.** 파일을 옮기는 테스트,
프로세스를 띄우는 테스트, 한글을 출력하는 테스트 — 셋 다 단독으로는 초록이고
게이트에서만 빨간불이었다. "테스트를 붙였다"는 보고에는 **게이트에서 초록**까지
포함돼야 한다.

**게이트: 1312 passed / 1 skipped, 9분 12초, 빨간불 0.**

## 2026-08-27 14:0x — 취향 재시험 2회차: **0.43**, 또 undefined

`docs/taste-retest-v0-design.md` §8(재개)·§9(결과). 지출 0.
2회차 3/7 = **0.43** [0.099, 0.816]. 확정 문턱은 "2개 이하"였고 3개가 나왔다.

| | 일치 | 재현율 | 구간 |
|---|---|---|---|
| 1회차 | 2/5 | 0.40 | [0.053, 0.853] |
| 2회차 | 3/7 | 0.43 | [0.099, 0.816] |
| 사후 결합 | 5/12 | 0.417 | **[0.152, 0.723]** |

결합하면 관문 아래로 내려가지만 **확정이라 쓰지 않았다** — §6에 "합치지 않는다"고
미리 적었고, 결과를 보고 합치는 것은 사후 결합이다. 여기서 규율을 접으면 이틀간
지킨 것이 전부 무의미해진다.

**확정 없이 참인 것**: 두 회차가 독립적으로 0.40·0.43로 거의 같고, 둘 다 관문
0.75보다 한참 아래이며, 편향은 재현율을 **올리는** 쪽이었다. 그러므로 사람 천장은
0.4 언저리로 보인다 — 추정이지만 **결정을 내리기엔 충분한 근거**다.

정직하게 덧붙일 것 하나: 관문을 사람 천장(0.40)으로 재정의해도 **우리 취향 벤치는
아직 못 넘는다**(1회차 적중률 0.25). 재정의는 우리를 통과시키는 장치가 아니다.

## 2026-08-27 14:2x — 취향층 결정(C+A)과 **선별 시간 계측기**

### 사장님 결정 (C + A 병행)

- **C**: 취향은 **영구 human_gate**. 게이트 ②를 "취향 심판 승격"에서
  **"선별이 굴러가는가"**로 재정의했다.
- **A**: 언젠가 취향 심판이 서면 그 관문은 **적중률 ≥ 0.40**(오늘 잰 사람 천장)이다.
  0.75가 아니다 — 사람이 못 넘는 선을 기계에 요구하지 않는다.
  **지금 벤치는 0.25로 이 관문도 못 넘는다**(재정의가 통과 장치가 아니라는 증거).

새 ②는 세 칸이고 둘은 이미 충족이다: 선별 기록(계약)·기계는 안 고름(계약).
남은 하나가 **세트당 선별 시간**인데, 그걸 재는 계측기가 없었다.

### 계측기를 만들었더니 첫 버전이 쓸모없었다

판을 낸 시각과 기록 시각의 차로 재봤다: **132.8분(자리 5개) · 55.1분(자리 7개)**.
5~7개 고르는 데 그럴 리 없다 — 그 사이의 다른 일이 전부 섞인 값이고,
**상한이 너무 헐거워 관문에 못 쓴다.**

그래서 **판이 스스로 재게** 했다. 페이지가 열린 순간부터 다 고를 때까지를 재고,
번호를 누르면 답 줄과 걸린 시간이 같이 만들어진다. 덤으로 **한 자리에 하나만**
고를 수 있게 됐다(새로 누르면 이전 선택이 풀린다) — 1회차에서 두 자리가 여러 개
선택으로 판정에서 빠졌던 문제가 구조적으로 사라진다.

### 문턱표에 넣으려다 테스트에 막혔다

`selection_minutes`를 "문턱 없는 계측기" 목록에 넣었더니 테스트가 거부했다 —
그 목록은 **어댑터가 실제로 내는 값**만 들어가야 하는데 선별 시간은 계측기 자체가
없었다. 규약이 맞다. 되돌리고 계측기부터 만들었다.

### 정직 조항

②가 15% → 70%로 오른 것은 **능력이 아니라 정의가 바뀐 것**이다. 옛 정의로 재면
여전히 15%이고, 게이트 문서에 두 숫자를 같이 남겼다(전체 58% ↔ 69%).

## 2026-08-27 14:3x — 결산: **정정 하나가 결산의 머리에 온다**

`docs/plan-2026-08-28.md`에 결산·내일 계획·북극성 되새김을 썼다(CLAUDE.md 상시 규칙).

### 결산 전에 정정

오늘 지출을 **$1.47**이라고 두 번 보고했다. 원장에서 다시 세니 **$2.8619**다.
차액의 원인이 그냥 실수가 아니라 사고다 — 07:23에 `TaskStop`으로 껐다고 한
티어 실행이 **안 죽었다.** 껍데기 셸만 죽고 파이썬 자식이 계속 돌아 잘린
sonnet 18호출·opus 18호출을 끝까지 마쳤다(약 **$1.4**).

원장이 증거다: 07:24:15에 죽었어야 할 sonnet 호출이 새 실행의 haiku와 뒤섞이고,
07:33:22·07:34:12에는 같은 초에 두 개가 찍힌다.

규칙으로 남겼다(`docs/measurement-rules.md` §9): **죽였다고 말하기 전에 정말
죽었는지 원장·프로세스로 확인한다. 지출은 도구가 돌려준 값이 아니라 원장에서
다시 센다.** 그리고 애초에 **실험을 끄지 않는다** — 이 사고는 그 규칙을 어기려다
난 것이고, 지켰으면 없었을 일이다.

### 오늘 숫자

| | 아침 | 저녁 |
|---|---|---|
| 게이트 평균 | 34% | **69%** (옛 ② 정의 58%) |
| 테스트 | 1244 | **1312** 초록 |
| 커밋 | — | 33건 |
| 지출 | $0 | **$2.8619** / 누적 $3.94 (상한 $10) |

확정 판정 셋(tier_helps · haiku avoided · 통과분당 1.5배), 층 넷이 올랐고
(③85 ④100 ⑤50 ②70), 취향은 **영구 human_gate로 선언**됐다.

## 2026-08-27 14:4x — 라우팅 결정 반영 + **가격표 오류 발견**

### A: 기본 모델 haiku → **sonnet 5** (사장님 승인)

`icon_lane_run.DEFAULT_MODEL`을 바꾸고, 근거를 코드 주석에 박았다(규격 0.276 →
0.870, 블라인드 0/31, opus와 눈으로 구분 안 됨, 통과분당 1.5배). "싼 티어부터"
방침은 여기서 끝난다.

### 그 김에 원장 가격표가 틀린 것을 찾았다

`PRICING["claude-sonnet-5"] = (3.00, 15.00)` — **그건 Sonnet 4.6 가격이다.**
Sonnet 5는 **$2/$10**이다.

| | 원장 기록 | 올바른 값 | 차이 |
|---|---|---|---|
| sonnet 36호출 | $1.3539 | **$0.9026** | **$0.4513 과대계상** |
| 누적 | $3.9380 | **$3.4867** | |

**원장은 고치지 않았다** — 그때 우리가 그렇게 기록했다는 사실도 기록이다.
대신 가격표를 고쳐 앞으로가 맞게 했고, `claude-sonnet-4-6`을 따로 넣었다.

방향이 **과대계상**이라 안전한 쪽이었지만(실제로는 덜 썼다), 반대였으면 상한을
모르고 넘었을 것이다. **단가는 원장의 근본이고, 그게 틀리면 상한도 결산도
전부 틀린다.**

## 2026-08-27 14:0x~15:1x — 도트 품질: 진단·교체·그리고 내 주장이 깨진 곳

사장님: *"도트 퀄리티 좀 늘려라 못 알아 보겠다"* → *"전체적인 퀄리티가 낮네"* →
*"무료 옵션이라서인가, 니가 프롬프트를 못 넣은 건가, 우리 엔진이 잘못된 건가?
그림자 표현도 없고…"*

### 1. 자리표시자가 화면을 채우고 있었다

게임 타일 8장은 전부 `make_placeholder_tiles.py`가 그린 단색 블록이었다. 진짜
아트(오디션 16장)는 **색 상한 24에 걸려 반입되지 못하고 있었다.** 상한이 진짜
아트를 막고 자리표시자를 통과시키는 상태였다.

사장님 승인으로 **스펙 v2**(`pixel-sprite-v2.yaml`, 색 48·캐릭터 48×48). v1은
지우지 않았다 — "pixel-sprite-v1"이라 적힌 옛 기록은 그 숫자로 판정된 것이다.

| 무리 | v1(24색) 원본 통과 | v2(48색) |
|---|---|---|
| 타일 16장 | **1/16** | **16/16** |
| merchant 4방향 | **0/4** | **4/4** |

### 2. 지형을 진짜 타일로 깔았다

오디션 세트는 **wang 타일셋**이라 1:1 교체가 안 된다(물·나무·벽·지붕·문 그림이
아예 없다). 그래서 지형만 wang으로 깔고 나머지 5칸은 자리표시자로 남겼다.
`build_atlas.py`(21칸) + `village_map.gd`가 반 칸 밀린 배경 레이어에 모서리를
이웃 칸에서 읽어 깐다. 흙길 가장자리가 네모로 잘리지 않는다.

### 3. 스모크가 **타일 0장인데 PASS**를 줬다

아틀라스를 바꾸며 `.import`를 지웠더니 `village_map.gd`가 파싱조차 실패했고 타일이
한 장도 안 그려졌다. **스모크는 PASS였다** — 이동과 매니페스트만 봤기 때문이다.
사장님이 화면을 안 보셨으면 "교체 완료"라는 거짓 보고가 나갔다.

`_check_map()` 추가(스크립트 붙었나·칸 수·아틀라스 텍스처). 이빨 확인: `.import`를
다시 지우니 FAIL이 났다.

### 4. 조립 정직성 검사가 **"영원히 자리표시자"** 를 요구하고 있었다

`kind == "placeholder"` 를 박아 둔 탓에 진짜 타일을 넣자 게이트가 빨개졌다.
자산이 좋아진 것을 결함으로 읽은 것이다. 검사의 **의도**(선언이 정직한가)로 다시
썼다. 반례 8건(자리표시자 감추기·칸 수 속이기·없는 원본 가리키기 등) 전부 거부,
진짜 선언은 통과.

### 5. 크로마키 분해 (사장님 지시)

> "나무 뽑을 땐 나무 옆에는 찐한 녹색 크로마키해서 니가 분해해서 넣어야지"

`genesis/chroma.py`. 생성기의 `no_background`를 믿지 않고 **배경색을 지정해 주문하고
우리가 자른다.** 핵심은 자르는 것이 아니라 **위험할 때 거부하는 것**이다 — 키 색과
그림 색의 거리를 재고, 강도가 그 천장을 넘으면 자르지 않는다.

키 색은 **마젠타**로 바꿨다. 잎 색까지의 여유가 초록 0.072 / 마젠타 0.848로
**12배** 차이다. 방식은 사장님 것 그대로, 색만 근거를 대고 바꿨다.

### 6. shading A/B — **판정은 났고, 내 주장은 깨졌다**

`docs/shading-param-v0-design.md` 사전 등록 후 무료 2회 소모.

| 측정 | A(맨몸) | B(음영) | |
|---|---|---|---|
| 색 | 21 | 28 | B↑ |
| 명도 계단 | 19 | 25.5 | B↑ |
| 명도 범위 | 69 | 81 | B↑ |

**판정 `shading_helps`.** 나는 "품질이 낮은 건 내 프롬프트 탓"이라고 단언했고,
API 명세(26개 중 3개만 사용)가 그 근거였다.

**그런데 08-07 오디션 세트는 같은 맨몸 주문인데 색 32.5 / 명도범위 93으로
오늘의 음영 넣은 B(28 / 81)보다 높다.** 즉 **회차 간 변동이 파라미터 효과보다
크다.** 파라미터는 도움이 되지만 주범이 아니었다.

그리고 그 전에 내가 "오디션 풀 타일 명도범위 24, 거의 평면"이라고 보고한 것은
**순수 풀 타일 한 장**을 잰 것이었다. 풀만 있는 타일은 원래 평면이다. 세트
중앙값은 93이다. **한 장으로 세트를 말했다.**

여기서 나온 것이 오히려 크다: 품질의 진짜 지렛대는 프롬프트가 아니라 **여러 번
뽑아 고르는 것**이고, 그게 정확히 이 엔진이 하는 일이다. 다만 무료 잔량 19회로는
"여러 번"을 못 한다.

### 7. 원장 가격표 오류

`claude-sonnet-5`를 $3/$15(= Sonnet **4.6** 가격)로 적어 뒀다. 실제는 $2/$10.
sonnet 36호출이 $1.3539로 기록됐지만 실제는 $0.9026 — **$0.4513 과대계상**.
원장은 고치지 않고 가격표만 고쳤다.

### 8. 등록부가 최상위 키를 안 봤다

새 실험을 `experiments` **밖**에 붙였는데 검사 전부가 통과했다. 최상위 키 검사
추가. 같이 발견: 결과 파일이 없으면 떨어뜨리는 검사가 **사전 등록을 벌하고
있었다** — `pending`으로 밝히게 하고, 밝혔으면 result를 비우게 강제한다.

### 6b. 사장님 눈이 계측기와 같은 순서를 냈다 (2026-08-27 15:2x)

세 세트를 나란히 보여드리자 사장님이 **"3번째가 가장 좋음"** — 08-07 오디션
세트다. 계측기가 매긴 순서와 **같다**:

| 순위 | 세트 | 색 | 명도범위 |
|---|---|---|---|
| 1위 (사장님) | 08-07 오디션 | 32.5 | 93 |
| 2위 | B(음영 파라미터) | 28 | 81 |
| 3위 | A(맨몸) | 21 | 69 |

**이건 판정이 아니라 관찰이다.** 비교 1회·세트 3개다. 사전 등록도 없었고,
`shade_probe`는 애초에 "음영이 들어갔나"를 재려고 만든 것이지 "예쁜가"를 재려고
만든 게 아니다. 그럼에도 기록해 둘 가치가 있는 것은, 취향이 **영구 human_gate**로
선언된(08-27) 뒤 기계 계측과 사람 눈이 처음으로 겹친 자리이기 때문이다.
이걸 근거로 취향 게이트를 자동화하지 않는다 - n=1이다.

실무적 귀결: **1위가 이미 게임에 들어가 있는 그 타일이다.** shading 파라미터
쪽으로 갈아탈 이유가 없어졌고, 무료 2회는 "갈아타지 않아도 된다"를 확인하는 데
쓴 셈이다. 남은 잔량 19회.

## 2026-08-27 16:0x~17:0x — 사장님이 목표를 "일관성"으로 정하고, 내 접근이 두 번 깨졌다

### 사장님 말

1. *"연못 타일에 일정 부분은 풀이랑 연결해야 자연스러워"* → 물도 wang 지형으로.
2. *"나무 집 연못 다시 만들어"*
3. *"왜 도트 퀄리티가 일정하지 않을까? 우린 이걸 집중적으로 고친다"*
4. (참고 화면 첨부) *"이 정도 퀄리티로 가고, 도트를 타일로만 찍을 수 있어?"*
5. *"상인이랑 주인공 퀄리티가 달라? 색이 너무 단순해"*
6. *"프롬프트를 얼마나 쓰레기같이 했길래"* / *"니가 멍청한 거 같은데"*
7. *"돈 필요하면 당당하게 말해. 아낄 생각 없어. 제품은 만들어야지"*

### 잰 것

| 물음 | 답 |
|---|---|
| 타일만으로 참고 화면이 되나 | **아니오.** 격자를 씌우니 수관·통나무·바위가 전부 타일 경계를 무시하고 겹친다. 바닥=타일, 나머지=y정렬 오브젝트 스프라이트 |
| 톤 차이 | 참고 밝기 **181**/채도 **35** vs 우리 **87**/**76** — 두 배 어둡고 두 배 쨍하다 |
| 캐릭터가 바닥보다 어두운 게 결함인가 | **아니다. 정정.** 참고는 −99, 우리는 −38. 우리가 오히려 대비 **부족** |
| hero와 merchant가 왜 다른가 | `metadata.json` 대조 — **설정이 완전히 동일**(48×48·mannequin·4방향·low top-down). 색만 10.5 대 21.0. 또 회차 변동이다 |
| 우리가 보낸 프롬프트 | `"lush green grass meadow"` **네 단어.** 아트 디렉션 0, 스타일 파라미터 0 |

### 내 접근이 깨진 곳 둘

**① 팔레트 잠금** — "가진 자산 전부에서 마스터 팔레트를 뽑아 강제하면 일관성이
해결된다"고 했다. 해보니 UI 아이콘 거리 0.457 → **0.457 그대로**. 어긋난 것들로
기준을 만들면 어긋남이 기준이 된다. 지형 팔레트로 강제하면 거리는 0이 되지만
인물이 올리브색이 된다. **팔레트는 설계해야 하는 것이지 뽑아내는 것이 아니다.**

**② "제대로 된 주문"** — 아트 디렉션 문장 + `shading`/`detail`/`outline` +
`color_image` 를 처음으로 다 같이 넣었다. 결과가 **네 단어짜리보다 나빴다**:
색 40 → 16, 풀과 길이 구분 안 되는 베이지 죽. 톤 수치(밝기 169/채도 54)는 목표에
가까워졌는데 그림이 죽었다. **나는 이 생성기를 참고 수준으로 몰 줄 모른다.**

### 돈 사고 둘

**타일셋 1건 = 생성 3회다.** 나는 1회로 세고 "잔량 19→15"라고 보고했다. 실제는
21→9였다. 명세에 안 적혀 있는데 확인 없이 가정했다. `pixellab_ledger.py` 를
만들어 이제 주문 전후 잔량을 실측한다.

**그리고 단가를 하루 종일 안 찾아봤다.** 명세에 *"25 generations or at least
$0.125"* — **생성 1회 = $0.005**다. 타일셋 1건 $0.015, pro 캐릭터 $0.10~0.20.
**나는 $0.10짜리 제약을 아끼려고 하루 종일 실험 설계를 비틀었다.**

### 길이 문턱이 성공을 실패로 둔갑시켰다

`images_in` 이 base64 500자 미만을 걸렀다. 파스텔 타일은 색이 적어 476자로 와서
**16장 전부** 걸러졌고, 주문은 성공했는데 "0장 받았다"고 보고했다. PNG 서명으로
바꿨다. 임의의 문턱은 언제나 이렇게 문다.

### 오늘이 증명한 것

**엔진의 전제가 맞다.** 같은 설정이 다른 결과를 낸다는 것을 타일과 캐릭터 양쪽에서
확인했다. 그러니 **여러 번 뽑아 골라야 한다** — 그게 이 제품이다.

**그런데 우리 게임의 모든 자산이 n=1이다.** 한 번 뽑고 나온 걸 그냥 썼다. 무료
40회로는 고를 수가 없었다. 품질이 낮은 진짜 이유는 프롬프트도 파라미터도 아니라
**선택지가 없었다는 것**이다. 사장님께 $20을 요청했다(= 생성 4,000회).

## 2026-08-27 17:0x — 사장님 정정: **엔진을 만드는 중이고 게임은 실험이다**

> "엔진 만드는 거 잊은 거 아니지. 게임은 실험이다."
> "엔진에 오늘 실수 기록해놔."

맞는 정정이다. 나는 오후 내내 **게임 그림을 예쁘게 만드는 일**에 빠져 있었다.
프롬프트를 고치고 타일을 갈아 끼우고 맵을 다시 그렸다. 그건 실험대를 닦은 것이지
제품을 만든 것이 아니다.

### 오늘의 사고를 엔진 규칙으로 승격 (measurement-rules §10~§17)

문서에만 적으면 다음에 또 한다. **규칙으로 올리고, 가능한 것은 코드로 만들었다.**

| § | 규칙 | 이걸 낳은 오늘의 사고 |
|---|---|---|
| 10 | 단가를 모르면 원장이 없는 것과 같다 | 타일셋 1건=3회인데 1회로 가정, 잔량 오보. 그리고 **$0.10짜리 제약을 아끼려 하루를 썼다** |
| 11 | 데이터는 계약으로 식별한다, 길이로 하지 않는다 | base64 500자 문턱이 476자 타일 16장을 전부 걸러 "0장 받았다"고 보고 |
| 12 | 생성기에 **부정 지시를 보내지 않는다** | `"no harsh contrast"` → 명암폭 36, `"low saturation"` → 채도 3 |
| 13 | 심판에 축이 없으면 조용히 통과한다 | 채도 3짜리 마녀가 PASS |
| 14 | 기준은 고르는 것이지 모집단에서 뽑는 것이 아니다 | 어긋난 자산들로 마스터 팔레트를 뽑았더니 거리가 그대로 |
| 15 | **n=1은 판정이 아니다** | 게임의 모든 자산이 n=1이었다 |
| 16 | 검사는 의도를 검사한다 | `kind == "placeholder"` 가 개선을 결함으로 읽음 |
| 17 | 운 좋은 씨앗으로 넘어가지 않는다 | 맵 생성기가 씨앗 5개 중 3개 실패, 내 것만 통과 |

### §15를 코드로 — `genesis/audition.py`

**이게 제품의 본체다.** 세 칸을 분리하고 섞지 않는다:

  뽑기(제공자가 확률적으로 낸다) → 거르기(기계, **고르지 않는다**) → 고르기(사람)

- `n < 3` 이면 `NotAnAudition` 을 던진다. *"하나만 뽑아 쓰는 것은 판정이 아니라
  도박이다"* — 기본값으로 도박을 팔지 않는다.
- 통과분에 **순위·최고점이 없다.** 뽑은 순서 그대로 돌려준다. 마지막 칸은 사람 것이다.
- 한 회차가 터져도 나머지가 돈다(§5: 돈 주고 산 것을 예외 하나로 버리지 않는다).
- 심판이 터지면 **미정**이지 탈락이 아니다(3값).

이빨 8건. 실제 자료로 첫 주행:

```
오디션 캐릭터 — 3회 뽑아 통과 1 · 탈락 2 · 미정 0
  ✖ witch_a  채도 3.0 < 25 — 흑백에 가까워 세계에서 뜬다
  ✖ hero     색 5.5 < 16 — 실루엣에 가깝다
  → 사장님께 1개를 나란히 보여드린다 (순위 없음)
```

**기계가 사장님의 판단 둘을 독립적으로 재현했다** — "상인이랑 주인공 퀄리티가
다르다"(hero 탈락, merchant 통과), 그리고 마녀의 색 문제(채도 3).

### 게임 쪽에서 안 것 (실험 결과이지 제품이 아니다)

- 참고 화면은 **타일만으로 못 만든다.** 바닥=타일, 나머지=y정렬 오브젝트 스프라이트.
- 파스텔 = 저채도 + **넓은 명암폭**(참고 172). 내가 저대비로 잘못 읽어 36을 만들었다.
- `proportions`(chibi 등)와 `force_colors`(팔레트 **강제**)를 한 번도 안 썼다.
  hero·merchant·마녀가 전부 `default` 비율이다 — 사장님이 "스타듀 같다"고 한 그것.
- 캐릭터 48px인데 타일 16px, 카메라 줌 2배라 참고 화면의 1/9만 보인다.

계획은 `docs/quality-plan-20260827.md`. **잔량 2회라 크레딧 없이는 3번을 못 한다.**

## 2026-08-27 17:3x — 생성은 GPT, 규격·판정은 엔진 (사장님 방침 전환)

> "프롬프트 입력하는 거 지피티가 더 잘하면 너 말고 지피티 시키자."
> "그리고 배경 사진도 지피티."
> "도트는 지피티가 더 잘할 수 있어. 아예 지피티로 만들자."

옳은 분업이다. 내가 쓴 프롬프트는 그날 두 번 실패했고, 그걸 계속 쥐고 있을 이유가
없다. **그리고 이게 제품 설계에 더 맞다** — 이 제품은 "좋은 프롬프트를 쓰는 AI"가
아니라 **"나온 것이 설계도에 맞는지 판정하고 골라 주는 AI"** 다.

### 만든 것 다섯

**`genesis/audition.py`** — 엔진 본체. 뽑기 → 거르기(기계) → 고르기(사람).
`n < 3` 이면 `NotAnAudition` 을 던진다: *"하나만 뽑아 쓰는 것은 판정이 아니라
도박이다."* 통과분에 **순위가 없다.** 이빨 8건.

**`genesis/style_bible.py`** — 사장님이 고른 자산 하나가 기준이 된다(§14).
`chosen_by` 없이는 채택을 거부한다. 팔레트를 평평한 목록이 아니라 **램프**(색상대별
밝기 사다리)로 분해한다. 실측: merchant 램프 2개·중앙 8.5단계 / 지형 4개·9단계 /
**마녀A 0개·무채색 22단계**(진짜 흑백이라는 게 램프로 보면 한눈에 나온다). 이빨 8건.

**`genesis/prompt_book.py`** — 프롬프트는 엔진의 **입력**이다. GPT가 쓰든 사장님이
쓰든 내가 쓰든 파일로 들어와 같은 검사를 받는다. `author` 필수(출처끼리 비교하려고).
검사가 그날 내 실패 둘을 그대로 잡는다: `'no harsh contrast'`, `'low saturation'`.
이빨 15건.

**`genesis/context_view.py`** — **게임 바닥 위 1:1**로 올려 판정한다.
그날 내가 제일 크게 틀린 것이 자산을 회색 배경에 8배 확대해 보여드린 것이다.
경계 대비를 **테두리에서** 잰다(전체 평균이 아니라 - 눈이 형태를 읽는 곳이 거기다).

화면 안에서 보니 판단이 뒤집혔다: 따로 볼 때 "흑백이라 문제"였던 마녀가 **바닥
위에서는 제일 잘 읽힌다**(경계 대비 95.2 / hero 58.5 / merchant 62.0).
대신 셋이 같은 세계 사람이 아니라는 것이 보인다.

**`tools/gpt_intake.py`** — GPT 그림 → 진짜 게임 자산. 다섯 칸(배경 제거 → 격자
강제 → 팔레트 → 규격 → 화면). 각 칸에서 **무엇을 얼마나 고쳤는지** 남긴다 —
많이 고쳐 통과한 것은 "통과"가 아니라 "우리가 고쳐서 통과"다.

### despill — 규격은 통과했는데 화면에서 떨어진 사고

GPT풍 입력(512px·12,050색·흐린 가장자리)으로 시험하니 **규격 검사는 통과**했는데
화면 판정이 **경계 대비 14**로 떨어졌다. 테두리 화소를 세어 보니 마젠타였다 —
**크로마 헤일로**다.

원인: `chroma.safe_strength` 는 키 색에서 가장 가까운 '그림 색'까지를 천장으로
잡는데, **흐린 그림에서는 키와 그림이 섞인 중간 화소가 전부 '그림 색'으로 잡혀
천장이 0으로 무너진다**(실측 0.0023). 그 도구는 가장자리가 딱 떨어지는 픽셀아트
전용이었다.

`chroma.despill()` 을 추가했다 — 그림 색을 참조하지 않고 **키와의 거리만** 본다.
가까우면 지우고, 중간이면 키 성분을 빼서 되돌리고, 멀면 둔다.
**경계 대비 14 → 73.4, 판정 PASS.**

**여기서 중요한 것은 화면 판정이 규격 판정이 놓친 것을 잡았다는 사실이다.**
크기·색 수·알파는 전부 맞았다. 그런데 화면에 놓으니 형태가 안 읽혔다.
따로 보면 괜찮은데 같이 놓으면 엉망인 것 — 그게 픽셀 아트 실패의 대부분이고,
이제 기계가 그걸 본다.

### GPT에게 넘길 사양서

`docs/brief-for-gpt-20260827.md` (177줄). 통째로 붙여넣게 썼다. 목표 수치(참고
화면 실측), 금지 표현과 그 증거, 파라미터 전체(`proportions: chibi`·`force_colors`
등 우리가 한 번도 안 쓴 것들), 요청 6건(마녀·상인·풀↔흙길·풀↔물·풀↔숲·**마스터
팔레트**), 건당 3변형.

## 2026-08-27 18:0x — 분업이 자리를 찾았다: GPT가 그리고 PixelLab이 돌린다

사장님 지시가 이어졌다: *"도트는 지피티가 더 잘할 수 있어"* → *"API로 안 돼?"* →
*"다 우리 엔진이면 다 API로"* → *"www.pixellab.ai 이걸로 하자"* →
*"지피티는 그동안 프롬프트 짜달라고 해"*.

### 각자 잘하는 것만 시킨다

| 누가 | 무엇 | 근거 |
|---|---|---|
| **GPT (chat)** | 주문서를 쓴다 | 내 프롬프트는 두 번 실패했다. GPT는 검사 **4/4 통과** |
| **GPT (image)** | 정면 한 장을 그린다 | 도트·투명배경·단일 포즈로 나온다 |
| **PixelLab v3** | 8방향으로 돌린다 | `reference_image` 모드. 64px이면 **1회**(실측) |
| **우리 엔진** | 규격·일관성·판정 | 격자·팔레트·화면 대비 |
| **사장님** | 고른다 | 영구 human_gate |

### GPT 주문서가 마스터 팔레트를 스스로 설계했다

사양서(생성물)를 읽고 변형 4개를 냈는데, **네 개가 전부 같은 램프를 공유**한다:

| 램프 | 그림자 → 하이라이트 |
|---|---|
| 남색 천 | `#121427` `#23274f` `#414992` `#7f8ce6` `#dfe3ff` |
| 청록 머리 | `#052a2a` `#0f4f4f` `#1e7a7a` `#43a7a7` `#b9f2f2` |
| 가죽·나무 | `#2a170d` `#4a2e1a` `#7a4e2a` `#b67a3d` `#e7b36a` |
| 놋쇠 | `#3b2a07` `#6a4b0e` `#9c7316` `#cfa42a` `#fff2b3` |
| 피부 | `#5a3a2c` `#8e5e45` `#c68e6b` `#f1b88f` `#ffe1c9` |

**5램프 × 5단계 = 25색, 램프 밖 색 0개.** 광원도 전부 좌상단으로 통일하고,
"모자챙 밑 `#121427`, 모자 꼭대기 `#dfe3ff`"처럼 위치까지 지목했다.

**이게 하루 종일 못 찾던 마스터 팔레트다.** 내가 만든 것(자산에서 뽑기)은 실패했고
(§14: 어긋난 것들로 기준을 만들면 어긋남이 기준이 된다), 사양서를 읽은 GPT가
**설계**해서 냈다. 기준은 뽑는 것이 아니라 정하는 것이라는 규칙이 맞았다.

### 게임에 부적합했던 것은 내 프롬프트였다

| 내가 쓴 것 | 결과 |
|---|---|
| `"pixel art game sprite"` | **20프레임 시트** — 게임에 못 넣는다 |
| `+ "ONE single character, one pose"` | 단일, 그러나 일러스트 |
| `+ "chunky visible square pixels, no anti-aliasing"` | **도트·단일·투명** ✓ |

사장님이 *"사진을 이따구로 만들면 게임에 어떻게 넣을까"* 라고 하신 것이 맞았고,
원인은 생성기가 아니라 형식 지시를 안 쓴 나였다.

**크로마키는 필요 없었다.** API의 `background: "transparent"` 가 실제로 먹혀서
70%가 투명하게 온다. 내가 어둡게 본 것은 뷰어가 투명을 검게 칠한 것이었다.

### 첫 후보

GPT 마녀 → PixelLab 회전 → **8방향 64px, 색 50.5, 채도 36.5**.
심판은 **FAIL**(명암폭 90.7 < 120) — 자주색이 큰 면적을 덮으며 명암이 눌렸다.
다만 8방향이 같은 인물로 읽히고 바닥 대비 136이다. 지금 게임의 hero(색 5.5)와
비교가 안 된다.

**오늘 처음으로 "고를 수 있는 후보"가 생겼다.**
