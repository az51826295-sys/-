<!-- provenance: {"source_id": "docs/mission-design.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-07-30T02:25:33", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# Genesis 임무세계 모드 — 기술 설계서 (게임 설계 협업 실험)

작성일: 2026-07-30. 상태: **검토 대기** (구현 전).
관계: [stage1-design.md](stage1-design.md)의 자유문명 트랙은 장기 구조로
유지하고 구현은 보류. 이 문서가 첫 구현 대상이다.

연구 질문: *인간이 큰 목표와 현실적 제약만 제공했을 때, 동일한 기본
구조를 가진 여러 개체가 스스로 하위 목표와 기능적 역할을 형성하고,
제안·비판·가상 실험·수정·선택의 반복으로 단일 개체보다 나은 결과물을
만드는가?*

첫 임무: *"2~4명이 종이와 토큰만으로 10분 안에 즐길 수 있으며,
가위바위보와 틱택토를 복제하지 않는 새로운 게임을 설계하라."*

기술 제약: Python 3.12, Pydantic, SQLite, LLM 금지, NN/RL 금지,
seed 재현성, 전 과정 로그.

---

## 0. 이 실험이 성립하기 위한 두 가지 전제 (가장 중요)

**전제 1 — 게임은 실행 가능해야 한다.** "규칙 유효성"과 "가상 플레이"가
진짜이려면 GameSpec은 자유 텍스트가 아니라 **닫힌 규칙 문법(DSL)의
조합**이어야 한다. 설계의 절반은 이 문법을 좁게 정의하는 데 쓴다(§4).
문법이 넓으면 인터프리터를 못 만들고, 좁으면 탐색이 무의미해진다 —
이 긴장이 이 MVP의 실제 난이도다.

**전제 2 — 세 실험군의 예산은 같아야 한다.** C(상호작용)가 B(독립+선발)를
이기는 가장 흔한 가짜 원인은 "C가 계산을 더 많이 해서"다. 모든 군은
**총 행동 수 = N_agents × T_rounds**로 고정한다(§9). 이 통제 없는 비교는
무효로 간주한다.

---

## 1. 모듈 구조

```
genesis/mission/
  config.py            MissionConfig — 상수·예산·소거 스위치
  models/
    gamespec.py        GameSpec과 규칙 DSL 타입 전부
    artifacts.py       Proposal, Critique, SimulationResult, Endorsement
    traits.py          AgentTraits
    events.py          BoardEvent (행동 로그 원장)
  grammar/
    space.py           규칙 공간 정의: 샘플링, 변이, 지문(fingerprint)
    clones.py          가위바위보/틱택토 복제 판정
  engine/
    interpreter.py     GameSpec → 실행 가능한 상태기계
    policies.py        RandomPolicy, GreedyPolicy (가상 플레이어)
    playout.py         M회 시뮬레이션 → 원시 지표
    static_check.py    실행 없이 잡는 모순 검사
  evaluation/
    metrics.py         원시 지표 → 평가 항목별 점수
    score.py           객관 점수(고정 가중치) + 개체별 주관 점수
  agents/
    decision.py        다음 행동 선택 (효용 + softmax)
    actions.py         PROPOSE/MODIFY/CRITIQUE/SIMULATE/ENDORSE 실행
  board.py             Blackboard — 공유 작업대 (C군에서만 공유됨)
  rounds.py            라운드 루프 + A/B/C 실험군 러너
  analysis/
    roles.py           기능적 역할 분화 측정
    lineage.py         최종안 계보, 정보 전파량
    report.py          실험 리포트 CLI
  store.py             SQLite 저장 (runs, events, artifacts)
  main.py              python -m genesis.mission --arm C --seed 42 ...
```

의존 방향: `models → grammar → engine → evaluation → agents → rounds`.
`analysis`는 SQLite만 읽는다 (stage1과 동일한 원칙).

## 2. 핵심 데이터 모델

### 2.1 GameSpec — 닫힌 DSL

```python
class BoardSpec(BaseModel):
    kind: Literal["GRID"]                # 검토 확정: NONE 보드는 MVP 제외
    width: int = 0                        # GRID: 3..5
    height: int = 0

class ActionKind(str, Enum):
    PLACE      # 내 토큰을 빈 칸에 놓는다
    MOVE       # 내 토큰을 거리 d(1..2)만큼 옮긴다
    CAPTURE    # 조건 충족한 상대 토큰 제거 (조건: ADJACENT | FLANKED)
    TAKE_POOL  # 공유 풀에서 토큰 k개 가져오기
    PASS       # 항상 합법 (교착 방지 폴백)

class TurnAction(BaseModel):
    kind: ActionKind
    params: dict[str, int] = {}          # {"distance": 1}, {"k": 2}, ...

class ScoringKind(str, Enum):
    LINE            # 길이 L 연속 배열 → p점 (제약: §4 복제 방지)
    AREA_MAJORITY   # 종료 시 행/열 다수 점유 → 행·열당 p점
    CAPTURED        # 잡은 토큰당 p점
    POOL_HELD       # 보유 토큰당 p점

class ScoringRule(BaseModel):
    kind: ScoringKind
    params: dict[str, int] = {}          # {"length": 4, "points": 3}

class WinKind(str, Enum):
    SCORE_REACH      # k점 선취
    MOST_AT_END      # 종료 시 최고점
    LAST_MOVER       # 마지막까지 수를 낼 수 있는 자

class EndKind(str, Enum):
    ROUNDS           # r라운드 후 종료
    BOARD_FULL
    POOL_EMPTY
    NO_LEGAL_MOVE    # PASS 외 수가 없는 플레이어 발생 시

class GameSpec(BaseModel):
    spec_id: str
    name: str                            # 템플릿 생성 ("4목 포위전" 등)
    players_min: int = 2; players_max: int  # ≤ 4
    board: BoardSpec
    tokens_per_player: int               # 3..10
    shared_pool: int                     # 0..12
    actions: list[TurnAction]            # 2..4개 (PASS 자동 포함)
    scoring: list[ScoringRule]           # 1..2개
    win: WinKind;  win_params: dict[str, int]
    end: EndKind;  end_params: dict[str, int]
    est_minutes: float = 0.0             # 플레이아웃에서 역산, 손으로 안 씀
    design_intent: str = ""              # 템플릿 문구. 평가에 사용 금지
```

이 문법의 조합 공간은 대략 수만~수십만 개 — 전수 탐색은 안 되고
탐색·비판·수정이 의미를 갖는 크기다. **모든 필드는 인터프리터가
실행할 수 있어야 하며, 실행 불가능한 필드는 문법에 넣지 않는다.**

### 2.2 작업 산출물 (블랙보드에 쌓이는 것)

```python
class Proposal(BaseModel):
    proposal_id: str
    spec: GameSpec
    author_id: str
    parent_id: str | None                # MODIFY 계보 — lineage 분석의 원료
    addressed_critique_ids: list[str]    # 이 수정이 반영한 비판
    round_created: int

class Issue(BaseModel):
    kind: Literal["CONTRADICTION",       # 정적 모순 (§5 static_check)
                  "NON_TERMINATION",     # 종료 불가/무승부 과다
                  "DOMINANT_STRATEGY",   # 한 행동/전략 지배
                  "NO_SKILL",            # greedy가 random을 못 이김
                  "DURATION",            # 10분 초과/미달
                  "CLONE"]               # 금지 게임 복제
    detail: str                          # 템플릿 문장 + 수치
    severity: float                      # 0..1

class Critique(BaseModel):
    critique_id: str
    target_proposal_id: str
    author_id: str
    issues: list[Issue]
    round_created: int

class SimulationResult(BaseModel):
    result_id: str
    proposal_id: str
    author_id: str                       # 누가 예산을 써서 돌렸나
    n_playouts: int
    playout_seed: int
    metrics: dict[str, float]            # §5의 원시 지표 전부
    round_created: int

class Endorsement(BaseModel):
    author_id: str; proposal_id: str
    stance: Literal["SUPPORT", "OPPOSE"]
    round_created: int

class AgentTraits(BaseModel):
    # 검토 확정(2026-07-30): cooperation_tendency, fun_bias 제거 — 4개로 축소
    novelty_preference: float            # 0..1
    risk_tolerance: float
    criticism_tendency: float
    simplicity_preference: float

class BoardEvent(BaseModel):             # 행동 로그 원장 (분석의 유일 원료)
    round: int; agent_id: str
    kind: Literal["PROPOSE","MODIFY","CRITIQUE","SIMULATE",
                  "ENDORSE","OPPOSE","SELECT"]
    artifact_id: str
    refs: list[str] = []                 # 참조한 산출물 id — 전파량 측정
    utilities: dict[str, float] = {}     # 그 시점 행동별 효용 (판단 추적)
```

## 3. 한 라운드의 실행 순서

```
라운드 r (r = 1..T):
1. 순서 셔플     arb_rng로 개체 순서 결정
2. 개체별 1행동  각 개체:
   a. 블랙보드 읽기 (자유 — 행동 아님. 단 실제 참조는 refs에 기록)
   b. 행동별 효용 계산 (§7) → softmax 선택
   c. 행동 실행 → 산출물 블랙보드 게시 + BoardEvent 로그
3. 라운드 종료   예산 카운터 갱신

전 라운드 종료 후:
4. 선택 단계     각 개체 ENDORSE/OPPOSE 1회 (예산 외 고정 행동)
5. 최종안        objective_score 최대 제안 (검토 확정: λ 투표 항 제거.
                 투표는 로그만 남기고, 투표 반영 시 선택이 달라졌을지를
                 analysis가 반사실로 보고한다)
```

같은 라운드 안에서는 서로의 신규 산출물이 보이지 않는다(스냅숏 일관성,
stage1의 지각 단계와 동일한 원칙). B군은 블랙보드가 개체별로 격리된다는
점만 다르고 나머지 절차는 동일하다.

## 4. 템플릿 기반 규칙 생성

**샘플링** (`grammar.space.sample(rng, traits)`): 필드별 가중 추첨.

- `novelty_preference` → 기존 블랙보드 제안들과의 지문 거리(§4 지문)가
  먼 조합에 가중치. C군에서만 "기존 제안"이 타인 것을 포함한다.
- `simplicity_preference` → 행동 수·채점 규칙 수가 적은 쪽에 가중치.
- `risk_tolerance` → 문법의 저빈도 조합(예: CAPTURE+FLANKED)에 가중치.

**문법 제약** (샘플링 단계에서 원천 차단):

- PLACE가 actions에 없으면 LINE/AREA_MAJORITY 채점 금지 (도달 불가 모순)
- TAKE_POOL 있으면 shared_pool ≥ 4
- **복제 방지**: 3×3 GRID + {PLACE}만 + LINE(3) + 선취승 = 틱택토 지문
  → 생성 금지. 동시 공개 행동은 문법에 없으므로 가위바위보는 구조상
  생성 불가. `clones.py`는 변이 결과에도 같은 검사를 적용한다.

**변이** (`grammar.space.mutate(spec, rng, critique=None)`): 한 번에 1군데.
파라미터 조정(±1), 행동 추가/제거, 채점 규칙 교체, 종료 조건 교체.
critique가 주어지면 **Issue 종류에 매핑된 변이만** 후보로 쓴다:

| Issue | 허용 변이 |
|---|---|
| NON_TERMINATION | 종료 조건을 ROUNDS로 교체 / r 축소 |
| DOMINANT_STRATEGY | 지배 행동 파라미터 약화 / 경쟁 행동 추가 |
| NO_SKILL | CAPTURE·MOVE 추가 (선택지 상호작용 증가) |
| DURATION | r·보드 크기·토큰 수 조정 |
| CONTRADICTION | static_check가 지목한 필드 교체 |

이 매핑이 "비판이 수정을 실제로 유도한다"의 기계적 구현이다.
**지문**: `(board.kind, w, h, sorted(action kinds), sorted(scoring kinds),
win, end)` 튜플. 거리 = 필드별 불일치 가중 합.

## 5. 가상 플레이 엔진의 최소 범위

`interpreter.py`: GameSpec → 상태기계.

- 상태: 보드 점유(GRID면), 플레이어별 토큰 수·확보 토큰·점수, 풀, 턴 수
- 합법 수 열거: actions의 각 kind에 대해 파라미터로 정해지는 이동/배치
  후보 (GRID 4-이웃, 거리 ≤ 2). PASS 항상 포함
- 수 적용 → 채점 규칙 평가 → 승리/종료 판정
- 하드 캡: 200턴 (초과 = 종료 불가로 기록)

`policies.py`: RandomPolicy (rng 균등), GreedyPolicy (1수 앞 자기 점수
증분 최대, 동점이면 rng). **2단계 이상 탐색은 넣지 않는다** — 엔진이
똑똑해질수록 지표가 정책 성능을 측정하게 되기 때문(전제 1의 이면).

`playout.py`: 제안당 M=40회 (G vs R 20회 + G vs G 20회, 2인 기준.
3~4인 지원은 인원수만 늘려 동일). 원시 지표:

```
termination_rate    200턴 내 종료 비율
mean_turns          평균 턴 수 → est_minutes = mean_turns × 15초
draw_rate           무승부 비율
branching_mean      턴당 합법 수 평균 (전략적 선택의 수)
skill_margin        G vs R 승률 (실력이 통하는가)
first_player_adv    G vs G 선공 승률 (밸런스)
action_entropy      사용된 행동 종류 분포의 정규화 엔트로피 (지배 탐지)

재미 대리 지표 (검토 확정 2026-07-30 — 재미의 구조적 상관물이지
재미 자체가 아니다. 최종 심판은 인간 플레이테스트로 예약):
close_decision_rate 상위 1·2위 수의 가치 차가 '고민 구간'인 턴 비율
                    (의미 있는 선택 — Sid Meier/Costikyan 계열)
lead_changes        평균 리드 교체 횟수 (서스펜스 — Ely et al. 계열)
decided_late        승자가 최종 리드를 잡은 시점 / 총 턴 수
comeback_rate       중반 열세 플레이어의 최종 승리 비율
```

학습 깊이 지표(2수 탐색 정책과의 승률 비교 — Koster 계열)는 비용이
플레이아웃당 수 배라 M1에서 실측 후 채택 여부 결정 (config 스위치).

`static_check.py` (실행 없이): 채점 규칙 도달 가능성, 종료 조건 도달
가능성(예: end=POOL_EMPTY인데 TAKE_POOL 없음), 토큰 수지, 복제 지문.
→ Issue(kind=CONTRADICTION | CLONE) 목록.

## 6. 제안 평가와 선택

**객관 점수** (`score.objective(spec, sim, static)` — 모든 군 공통,
고정 가중치, 사전 등록):

```
게이트 (하나라도 걸리면 0점):
  contradiction > 0 / clone / termination_rate < 0.95
합산 (각 항 0..1, 가중치 합 = 1.0):
  0.20 · skill:      clamp01((skill_margin - 0.55) / 0.35)
  0.15 · balance:    1 - 2·|first_player_adv - 0.5|
  0.15 · choice:     clamp01((branching_mean - 2) / 6)
  0.10 · close:      close_decision_rate
  0.10 · suspense:   0.5·clamp01(lead_changes/4) + 0.5·decided_late
  0.05 · comeback:   clamp01(comeback_rate / 0.3)
  0.05 · variety:    action_entropy
  0.10 · duration:   1 - clamp01(|est_minutes - 10| / 10)
  0.05 · simplicity: 1 - clamp01((행동수+채점수 - 3) / 5)
  0.05 · low_draw:   1 - clamp01(draw_rate / 0.3)
```

**주관 점수** (개체의 의사결정·투표용): 같은 항들의 가중치를 traits로
재조정(simplicity_preference가 simplicity 가중을 0.5~2배 등) 하고,
`fun_bias_seed`로 ±20% 섭동. **주관 점수는 선택 행동에만 쓰이고, 실험
판정에는 반드시 객관 점수만 쓴다.**

주의: 개체는 **SimulationResult가 블랙보드에 있는 제안만** sim 기반
항을 알 수 있다. 없으면 static 항 + 사전추정(불확실 페널티)만으로
판단한다. → SIMULATE가 정보 가치를 갖는 유일한 원천이고, 이것이 C군에서
"남이 돌린 실험 결과를 재활용"하는 실제 이득을 만든다 (전제 2와 연결).

## 7. 개체의 다음 행동 결정

```
u(PROPOSE)  = w_p · novelty_preference · decay(내 제안 수)
              · (2.0 if 블랙보드에 제안 없음 else 1.0)
u(MODIFY)   = w_m · max over (제안 p, 미해소 비판 c): 기대개선(p, c)
              (cooperation_tendency 제거 확정 — 타인 제안 수정에 게이트 없음)
u(CRITIQUE) = w_c · criticism_tendency · |비판 없는 제안 중 주관점수 상위|
u(SIMULATE) = w_s · |sim 없는 제안 중 주관점수 상위| · risk_tolerance⁻¹
              (위험 회피적일수록 검증을 원함)
선택        = softmax(u / T), T = 0.5 (전 개체 공통 — 온도 차는 traits와
              중복 변인이라 두지 않는다)
```

기대개선(p, c) = c.severity × (p의 현재 주관점수가 높을수록 큼).
ENDORSE/OPPOSE는 §3의 선택 단계 고정 행동이므로 여기 없다.

## 8. 기능적 역할 분화 측정 (`analysis/roles.py`)

로그(BoardEvent)만 사용. traits는 판정에 쓰지 않는다.

1. 개체별 행동 분포 벡터 (PROPOSE/MODIFY/CRITIQUE/SIMULATE 비율)
2. **분화도** = 개체 간 행동 분포의 평균 JS divergence.
   대조군: `trait_sd = 0` (클론 집단) 20 seed의 동일 지표 분포.
   분화 판정 = 클론 대조군 95분위 초과
3. **역할 명명**: k-means(k=2..4, 손코딩)로 군집 후 지배 행동으로 사후
   라벨 (제안자/비평가/실험자/통합자). 라벨은 보고용이지 판정 근거 아님
4. **맥락 반응성** (§11의 함정 대비): 같은 개체가 블랙보드 상태에 따라
   행동을 바꾸는가 — 라운드 초반(제안 부족)과 후반(비판 누적)의 개체별
   행동 분포 차이. 역할이 traits의 메아리에 불과하면 이 값이 0에 가깝다

**정보 전파량** (`lineage.py`): 최종안에서 parent 사슬을 거슬러 올라가
계보 추출. 지표: 계보에 등장한 서로 다른 저자 수, 타인 제안에 대한
MODIFY 비율, addressed_critique_ids로 연결된 비판→수정 링크 수,
SimulationResult를 타인이 참조(refs)한 횟수.

## 9. A / B / C 비교 실험 절차

| 군 | 구성 | 블랙보드 | 총 행동 예산 |
|---|---|---|---|
| A | 개체 1 | 자기 것 | N × T (동일) |
| B | 개체 N, 격리 | 개체별 격리, 최종 objective 최대안 선발 | N × T |
| C | 개체 N, 공유 | 공유 | N × T |

- N = 6, T = 20 (초기값 — P2에서 민감도 확인)
- 동일 seed 세트 20개 × 3군. 군 간 traits 세트도 동일 (A는 첫 개체 사용)
- A군의 개체는 T×N 라운드를 혼자 돈다 — 같은 예산, 같은 행동 레퍼토리
- 판정 지표 (사전 등록):
  - 1차: 최종안 objective_score의 군별 분포 (C > B 여부가 핵심 질문)
  - 2차: 개선도 = 최종안 점수 − 1라운드 제안 최고점
  - 3차: C군 내 분화도·전파량·맥락 반응성 (§8)
  - 강건성: C군에서 라운드 T/2에 개체 2 제거 → 최종 점수 하락폭
- **사전 예측** (실행 전 고정, stage1 §11 규율 동일):
  - C 중앙값 > B 중앙값 (20 seed 중 ≥ 13에서 C ≥ B)
  - 이유 가설: C만 (a) 비판→수정 매핑으로 탐색이 유도되고 (b) 타인의
    SIMULATE 결과를 재활용해 예산 효율이 높다
  - **빗나가면**: 상호작용 구조가 이 과제에서 무가치하다는 결과로 보고
    하고, 사회 구조 확장(자유문명 트랙)의 근거를 재검토한다 — 이것이
    이 실험의 존재 이유다

## 10. 구현 파일 목록과 순서

| 단계 | 파일 | 완료 기준 테스트 |
|---|---|---|
| M0 | config, models/*, grammar/space, grammar/clones | 샘플 1,000개 전부 제약 통과·복제 0건·seed 재현 |
| M1 | engine/* (interpreter, policies, playout, static_check) | 손제작 정상 게임(예: 4×4 포위 4목) 종료율 100%·수제 모순 게임을 static_check가 잡음·동일 seed 동일 지표 |
| M2 | evaluation/* | 수제 좋은 게임 > 수제 퇴화 게임(즉승/무한/선택지 1개) 점수 순서 검증. 지표별 단조성 단위 테스트 |
| M3 | board, agents/*, rounds (C군만) | 1 seed 완주, 로그 완결성 (모든 행동에 BoardEvent, 효용 기록) |
| M4 | rounds에 A/B군, main | 예산 동일성 자동 검증 테스트, 3군 동일 seed 완주 |
| M5 | analysis/* | 합성 로그(역할 주입/무주입, 전파 주입/무주입) 정밀도·재현율 ≥ 0.9 — stage1 §8.4와 동일 규율 |
| M6 | 본실험 | 20 seed × 3군 실행 → Findings 보고 (사전 예측 대조) |

각 단계: 구현+테스트 동시, pytest 통과 후 커밋 (기존 리듬).

---

## 11. 자기 검토 — 가짜 창발·과잉 복잡성 후보 (제거 논의용)

사용자 검토 전에 설계자가 먼저 자수하는 목록이다.

1. **역할 분화는 traits의 메아리일 가능성이 구조적으로 높다.**
   criticism_tendency가 CRITIQUE 효용에 직접 곱해지므로(§7), 행동 분포가
   갈라지는 것 자체는 창발이 아니라 **설계의 직접 귀결**이다. 그래서
   §8-4 맥락 반응성을 넣었지만, 더 정직한 선택지는 traits를 효용에서
   빼고 초기 경험(첫 성공 행동)이 성향을 만드는 구조다. MVP에서는
   전자(측정으로 방어)를 제안하되, 이 한계를 결과 보고에 명시해야 한다.
2. **`human_fun_estimation_bias` → `fun_bias_seed`로 축소했지만 여전히
   제거 후보.** "인간 재미"를 예측할 근거가 이 시스템 어디에도 없다.
   가중치 섭동은 다양성 노이즈일 뿐이며, 없어도 실험이 성립한다.
3. **`cooperation_tendency`도 절반은 중복.** 타인 제안 MODIFY 게이트
   하나에만 쓰인다. novelty/criticism/simplicity/risk 4개로 줄여도
   연구 질문은 그대로 검증된다.
4. **`design_intent` 필드는 장식이다.** 평가에 쓰면 안 되고(템플릿
   문장이므로), 안 쓸 거면 없어도 된다. 산출물 가독성용으로만 유지.
5. **NONE 보드(토큰만 게임)는 문법 공간을 넓히지만 인터프리터 분기를
   2배로 만든다.** M0~M2를 GRID만으로 시작하고 NONE은 이후 추가가
   싸다 — 첫 구현에서 제외 권장.
6. **선택 단계의 λ·지지 항**: λ=0.2면 사실상 objective가 결정한다.
   투표가 결과를 바꾸지 않는다면 왜 두는가? — C군에서 주관 점수(정보
   비대칭 반영)가 선발을 개선하는지가 자체 검증 항목이 되어야 하며,
   아니면 제거.
7. **의도된 한계 재확인**: 템플릿 생성이므로 진짜 "창의"는 없다. 이
   실험이 측정하는 것은 창의가 아니라 **탐색 공간에서의 집단 탐색
   효율과 정보 공유의 가치**다. LLM 연결(다음 단계)은 생성기만 교체하면
   되도록 `grammar.space.sample/mutate` 인터페이스 뒤에 격리해 둔다.
