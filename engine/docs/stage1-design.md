<!-- provenance: {"source_id": "docs/stage1-design.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-07-30T01:50:11", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# Genesis Stage 1 — 다중지능 최소 실험 세계 기술 설계서

작성일: 2026-07-30. 상태: **검토 대기** (구현 전).

목표 가설: *동일한 기본 구조로 태어난 여러 개체가, 서로 다른 경험을 통해
각기 다른 능력과 행동 전략을 발달시키고, 유용한 행동이 관찰을 통해
집단에 전파되는가?*

기술 제약: Python 3.12, Pydantic, SQLite, 외부 LLM API 금지,
신경망/강화학습 프레임워크 금지, random seed 재현성, 전 판단 과정 로그화.

---

## 0. 기존 코드베이스와의 관계

현재 리포의 미로 세계(열쇠·문·버튼)는 **그대로 유지**하고, Stage 1은
`genesis/society/` 신규 패키지로 만든다. 재사용하는 것:

- **시드 규율**: `random.Random(seed)`를 목적별 스트림으로 분리하는 패턴
  (기존 `test_same_seeds_reproduce_episode` 방식의 재현성 테스트 포함)
- **저장 패턴**: Pydantic 모델을 JSON 컬럼으로 SQLite에 왕복 저장
- **리포트 인프라**: `--report` 스타일의 사후 집계 출력

계승하는 교훈 (100 에피소드 장기 실험, progress.md Findings):
절대 좌표 (x, y)가 섞인 경험은 맵이 바뀌면 오염원이 된다.
→ **Stage 1의 가설 컨텍스트에는 절대 좌표를 절대 넣지 않는다.**
컨텍스트는 전부 국소적·상대적 특징(내 칸/인접 칸의 내용물, 계절,
내부 상태 구간)으로만 구성한다.

---

## 1. 모듈 구조

```
genesis/society/
  config.py            SocietyConfig (모든 상수·스위치·시드)
  world/
    grid.py            World, Cell — 20×20 격자, 지형, 점유 규칙
    entities.py        Food, Water, Stone, Wood, HazardZone 정의·팩토리
    dynamics.py        환경 변화 스케줄러 (계절, 독, 재배치, 길 차단)
    arbitration.py     동시 행동 충돌 해소 (틱당 시드 셔플 + 규칙)
  mind/
    traits.py          Traits — 개체별 성향 파라미터
    drives.py          내부 상태 → 욕구 가중치 변환
    memory.py          EpisodicMemory — 용량 제한 경험 저장
    hypothesis.py      Hypothesis, HypothesisStore, 귀납 생성, 신뢰도 갱신, 분화
    prediction.py      후보 행동별 결과 예측 (가설 조회·결합)
    decision.py        효용 계산 + 행동 선택 (softmax)
  social/
    witness.py         타 개체 행동·결과 목격 이벤트 생성
    imitation.py       목격 → OBSERVED 가설 채택
    trust.py           쌍별 신뢰 원장
    signals.py         무의미 토큰 신호 발신·수신·연합 학습
  sim/
    tick.py            틱 오케스트레이션 (6단계, §4)
    lifecycle.py       출생·노화·사망·대체 스폰
    eventlog.py        SQLite 이벤트 로그 기록기
  analysis/            ★ 시뮬레이션과 완전 분리 — DB만 읽는다
    profiles.py        행동 프로파일 추출 + 사후 유형 분류
    transmission.py    행동 패턴 계보(밈 계통도) 추적
    culture.py         문화 판정 4조건 탐지기
    report.py          CLI 리포트
  main.py              python -m genesis.society 진입점
```

의존 방향은 기존과 동일하게 일방향:
`config → world → mind → social → sim`, `analysis`는 DB만 의존.
`mind`는 세계 내부를 모른다 — `Observation`만 소비한다.

## 2. 모듈별 책임

| 모듈 | 책임 | 하지 않는 것 |
|---|---|---|
| `world` | 격자 상태, 자원 배치, 물리 규칙(이동·점유·먹기 가능 여부) | 개체의 판단·기억 |
| `dynamics` | 틱 스케줄에 따른 환경 변화. 자체 RNG 스트림 사용 | 개체 상태 접근 |
| `arbitration` | 같은 틱 행동들의 순서·충돌 해소 | 행동의 성패 판정 외 부수효과 |
| `mind` | 관찰→회상→가설→예측→선택→갱신 루프 전체 | 다른 개체의 내부 접근 |
| `social` | 목격 이벤트 분배, 모방 채택, 신뢰 갱신, 신호 | 의미 부여(의미는 학습으로만) |
| `sim` | 틱 단계 순서 보장, 수명 주기, 로그 기록 | 판단 로직 |
| `analysis` | 사후 분석·판정. 실행 중 시뮬레이션에 개입 금지 | 시뮬레이션 상태 변경 |

## 3. 핵심 데이터 모델 (Pydantic)

### 3.1 세계

```python
class TerrainType(str, Enum): PLAIN; WATER; BLOCKED     # BLOCKED = 길 차단
class ResourceType(str, Enum): FOOD; STONE; WOOD

class Resource(BaseModel):
    resource_id: str
    resource_type: ResourceType
    # FOOD 전용 지각 특징 — 가설 컨텍스트의 재료가 된다
    features: dict[str, str] = {}      # 예: {"color": "red", "ripeness": "ripe"}
    energy_value: float = 0.0          # 독이면 음수 (개체에게는 비공개)
    portable: bool                     # 돌·나무·음식 = True

class Cell(BaseModel):
    terrain: TerrainType
    resources: list[Resource]
    hazard: bool = False               # 위험 지역 (진입 시 체력 피해)
    occupant_id: str | None = None     # 개체 1칸 1명

class WorldState(BaseModel):
    tick: int
    season: Literal["spring", "summer", "autumn", "winter"]
    grid: list[list[Cell]]             # 20×20
```

### 3.2 개체

```python
class InternalState(BaseModel):
    energy: float      # 0~100, 매 틱 감소, 0이면 사망
    hydration: float   # 0~100, 매 틱 감소, 0이면 체력 감소 시작
    health: float      # 0~100, 0이면 사망
    age: int           # 틱 단위, max_age 도달 시 사망
    fear: float        # 0~1, 피해·목격으로 상승, 매 틱 감쇠
    curiosity_state: float   # 0~1, 새로움 결핍 시 상승 (성향과 별개인 '상태')
    # 사회적 신뢰는 스칼라가 아니라 쌍별 원장 → TrustLedger (§7)

class Traits(BaseModel):
    """출생 시 공통 평균 ± 시드 노이즈로 결정, 이후 불변."""
    curiosity: float          # 새로움 보너스 계수
    risk_aversion: float      # 예상 피해 페널티 계수
    memory_capacity: int      # 일화 기억 최대 건수 + 가설 최대 개수
    observation_accuracy: float  # 특징 오지각 확률 = 1 - 이 값
    imitation_tendency: float # 목격 시 가설 채택 확률 계수
    planning_horizon: int     # MVP=1 (즉시 효용만). 필드만 예약
    social_trust_bias: float  # 신뢰 원장 초기값

class Agent(BaseModel):
    agent_id: str
    born_tick: int
    position: Position
    state: InternalState
    traits: Traits
    inventory: list[Resource]      # 최대 2개
    alive: bool = True
```

### 3.3 관찰

```python
class ObservedAgent(BaseModel):
    agent_id: str
    offset: tuple[int, int]        # 나 기준 상대 위치 — 절대 좌표 금지
    last_action: ActionType | None # 직전 틱에 목격한 행동
    visible_outcome: str | None    # "ATE", "TOOK_DAMAGE", "FLED", ...

class Observation(BaseModel):
    tick: int
    season: str
    self_state: InternalState
    local_cells: dict[tuple[int, int], CellView]  # 맨해튼 거리 ≤ 3, 상대 좌표 키
    observed_agents: list[ObservedAgent]
    heard_signals: list[HeardSignal]              # (sender_id, token, offset)
```

`CellView`는 `Cell`의 지각 버전: `energy_value`는 빠지고, `features`는
`observation_accuracy` 확률로 오지각될 수 있다(예: red를 orange로).
**오지각은 개체별 가설 분화의 자연 발생원이다.**

### 3.4 행동

```python
class ActionType(str, Enum):
    MOVE          # dir ∈ N/S/E/W
    OBSERVE       # 관찰 반경 +1 (이번 틱 한정), 에너지 소모 최소
    EAT           # 내 칸 또는 인벤토리의 FOOD
    DRINK         # 인접 WATER 지형
    PICK_UP; DROP # portable 자원
    PUSH          # 앞 칸 자원을 한 칸 밀기
    ATTACK        # 인접 개체, 대상 health 감소, 내 에너지 소모
    FLEE          # 가장 가까운 위협 반대 방향 2칸 이동 시도
    WATCH_AGENT   # 대상 개체 집중 관찰 — 목격 정확도 상승
    SIGNAL        # token ∈ 0..7, 반경 5 내 전파. 의미 사전 정의 없음
    WAIT
```

도구 제작·거래·게임은 행동으로 제공하지 않는다. 존재하는 조합 가능성:
PUSH+DROP으로 자원 재배치, SIGNAL+FLEE 공기(共起)로 경고 신호 학습 등.

### 3.5 판단 기록 (로그의 단위)

```python
class DecisionRecord(BaseModel):
    """매 틱, 개체당 1건 — '모든 판단 과정 추적' 요구의 구현체."""
    tick: int; agent_id: str
    candidate_actions: list[ActionEvaluation]   # 후보별 예측·효용 전부
    chosen: Action
    used_hypotheses: list[str]                  # hypothesis_id 목록

class ActionEvaluation(BaseModel):
    action: Action
    predicted_deltas: dict[str, float]   # {"energy": +12, "health": 0, ...}
    prediction_confidence: float
    utility: float
    utility_terms: dict[str, float]      # {"need": .., "novelty": .., "risk": ..}
```

## 4. 한 틱의 실행 순서

동시성 공정성과 재현성을 위해 6단계로 고정한다. RNG 스트림은
`env_rng`(환경), `arb_rng`(중재), `agent_rng[i]`(개체별 지각·선택),
`spawn_rng`(출생 traits) 4종으로 분리 — 개체 수가 바뀌어도 환경 재현성이
깨지지 않는다.

```
1. 환경 단계   dynamics: 계절 진행, 자원 재생/재배치, 독 발생, 길 차단
2. 지각 단계   모든 개체가 '같은 스냅숏'에서 Observation 생성 (오지각 적용)
3. 결정 단계   개체별 mind 루프 → Action + DecisionRecord
               (세계를 변경하지 않으므로 순서 무관)
4. 해소 단계   arbitration: arb_rng로 셔플한 순서로 행동 적용
               충돌 규칙 — 같은 음식 EAT: 선순위만 성공 / 이동 목적지 중복:
               선순위만 이동 / ATTACK은 대상이 그 틱에 이동했으면 실패
5. 학습 단계   각 개체에 ActionResult + 결과 관찰 전달
               → 가설 신뢰도 갱신, 일화 저장, 목격 이벤트 분배(§7),
               신호 연합 갱신, 신뢰 원장 갱신
6. 정리 단계   대사(에너지·수분 감소, 갈증 피해, 노화), 사망 처리,
               대체 스폰, 이벤트 로그 flush
```

## 5. 기억·가설·전략의 데이터 구조

### 5.1 일화 기억 (EpisodicMemory)

```python
class Episode(BaseModel):
    tick: int
    context: Context            # §5.2와 동일 형식
    action: Action
    outcome_deltas: dict[str, float]   # 실측 내부 상태 변화
    surprise: float             # |예측 - 실측| 가중합
```

- 용량 = `traits.memory_capacity`. 초과 시 퇴출 점수
  `(오래됨 × 낮은 surprise)` 최대인 것부터 삭제 — 놀라웠던 경험은 오래 남는다.
- 조회: 현재 Context와의 특징 일치 수 기반 top-k (기존 similarity 모델의
  버킷 조회 패턴 재사용, 단 특징은 전부 국소적).

### 5.2 가설 (Hypothesis) — 이 시스템의 핵심

```python
class Context(BaseModel):
    """가설의 조건부. 값이 None인 특징은 '무관' — None이 많을수록 일반적."""
    target_kind: str | None        # "FOOD", "WATER", "AGENT", "HAZARD", ...
    target_features: dict[str, str]  # {"color": "red"} 등 — 부분 지정 가능
    season: str | None
    self_state_bucket: dict[str, str]  # {"energy": "low"} — low/mid/high 3구간
    # 절대 좌표 필드 없음 (§0)

class Hypothesis(BaseModel):
    hypothesis_id: str
    context: Context
    action_type: ActionType
    predicted_deltas: dict[str, float]  # 기대 효과 (증분 평균으로 갱신)
    alpha: float; beta: float           # 증거 카운트 (Beta 분포)
    source: Literal["OWN", "OBSERVED", "SIGNAL"]
    origin_agent_id: str                # 최초 발생 개체 — 밈 계보의 열쇠
    parent_id: str | None               # 분화(§6) 시 부모 가설
    created_tick: int; last_used_tick: int

    @property
    def confidence(self): return self.alpha / (self.alpha + self.beta)
    @property
    def support(self): return self.alpha + self.beta
```

**생성 (귀납, LLM 없음)**: surprise가 문턱을 넘은 Episode에서 템플릿 귀납.
관찰된 Context의 특징 부분집합을 일반화 수준별로 3개까지 생성한다.
예: 빨간 열매를 먹고 체력이 깎였다면 →

- H1 `{target_kind: FOOD} + EAT → health -20` (가장 일반)
- H2 `{FOOD, color: red} + EAT → health -20`
- H3 `{FOOD, color: red, season: winter} + EAT → health -20` (가장 구체)

셋 다 α=1, β=1(신뢰 50%)로 출발하고, 이후 증거가 셋을 갈라놓는다.
가설 수 상한 = `memory_capacity`. 퇴출: `support 낮음 × confidence 0.5
근처 × 오래 미사용` 점수순.

**예측 시 결합**: 후보 행동과 현재 Context에 매칭되는 가설들을 조회,
`가중치 = confidence × log(1+support) × 구체성(지정된 특징 수)`으로
predicted_deltas를 가중 평균. 매칭 가설이 없으면 예측 무지 상태
(deltas=0, confidence=0) — 이때 novelty 보너스가 최대가 된다.

### 5.3 행동 전략 = 창발적 산물, 별도 자료구조 없음

전략은 명시적으로 저장하지 않는다. `개체의 가설 집합 + traits`가 곧
전략이고, analysis가 로그에서 사후에 패턴으로 추출한다(§8). 이는 설계
원칙이다: 전략을 1급 객체로 만들면 곧 역할 지정의 뒷문이 된다.

## 6. 가설 신뢰도 갱신

행동 후 학습 단계에서, 이번 예측에 사용된 각 가설에 대해:

```
방향 일치 판정: sign(predicted_deltas[k]) == sign(actual[k])
              (|actual| < 잡음 문턱 0.5면 0으로 간주), 주요 스탯 다수결
일치   → alpha += 1,  predicted_deltas를 실측 쪽으로 증분 평균 갱신
불일치 → beta  += 1
```

의사결정에는 신뢰도 원점수가 아니라 **하한 추정치**
`confidence - z·sqrt(conf·(1-conf)/support)` (z=1.0)를 쓴다 —
증거 2건짜리 100%가 증거 40건짜리 80%를 이기는 것을 막는다.

**분화(specialization)**: `support ≥ 8`인데 `confidence`가 0.35~0.65에
갇힌 가설은 "조건을 놓치고 있다"는 신호다. 그 가설을 참조한 Episode들에서
성공군/실패군을 가장 잘 가르는 특징 1개를 카운팅으로 찾아(정보 이득,
프레임워크 불필요 — 순수 세는 것), 그 특징을 지정한 자식 가설 2개를
생성하고 부모는 유지하되 가중치를 낮춘다. "익은 빨간 열매만 안전하다"가
나오는 경로가 바로 이것이다.

**행동 선택 효용** (decision.py):

```
U(a) = Σ_k need_weight(k) · E[Δk|a]          # 욕구 충족 기대
     + traits.curiosity · novelty(a, ctx)     # 매칭 가설 support가 적을수록 ↑
     - traits.risk_aversion · (1 + fear) · E[피해|a]
선택 = softmax(U / T),  T = 0.3 + 0.7·traits.curiosity
```

`need_weight(energy)`는 에너지가 낮을수록 볼록하게 커진다
(`(1 - energy/100)²` 형태). **"음식을 찾아라"는 목표는 어디에도 없다** —
결핍이 가치를 만들 뿐이다.

## 7. 개체 간 관찰과 모방

**목격**: 해소 단계에서 성공한 행동 중 가시적 결과가 있는 것
(EAT, ATTACK, FLEE, 피해, SIGNAL)은 반경 3 내 개체들에게
`WitnessEvent(actor, action, context_view, visible_outcome)`로 분배된다.
WATCH_AGENT 중인 목격자는 context_view의 특징 손실이 없다(집중 관찰).

**모방 채택** (imitation.py): 목격자 B가 행위자 A의 행동을 볼 때,

```
채택 확률 = traits.imitation_tendency × trust(B→A) × outcome_salience
```

채택되면 `source=OBSERVED, origin_agent_id=A(의 가설 계보 유지)`인 가설을
생성하되 **초기 증거는 자기 경험보다 약하게**: `alpha = 1 + trust(B→A)`,
`beta = 1`. 남의 지식은 내 검증을 거쳐야 강해진다.

**신뢰 원장** (trust.py): `trust[B][A] ∈ [0,1]`, 초기값
`B.traits.social_trust_bias`. 갱신:

- A에게서 채택한 가설이 B의 실전에서 확증 → +0.05 / 반증 → -0.10
- A가 B를 ATTACK → -0.3, fear +0.2
- 갱신 없는 쌍은 매 100틱마다 초기값 방향으로 1% 회귀

**신호** (signals.py): SIGNAL(k)는 의미가 없다. 수신자는
`(token, 직후 W=5틱 내 발생 사건)` 공기 카운트를 유지하고, 특정 사건과의
공기가 문턱을 넘으면 `source=SIGNAL`인 가설
(예: `{heard_token: 3} → 위험 근접 확률↑ → FLEE 효용 보정`)을 귀납한다.
경고음의 의미가 생기려면 이 경로 하나로 충분하고, 강요하지 않는다.

## 8. 문화 출현 탐지 (analysis — 전부 사후·오프라인)

### 8.1 행동 프로파일과 사후 유형 분류 (profiles.py)

개체별 특징 벡터: 탐사 커버리지(방문 셀 비율), 행동 유형 분포,
WATCH_AGENT 비율, ATTACK 비율, SIGNAL 발신율, OBSERVED 가설
채택 수/기각 수, 자기 가설이 남에게 채택된 수(지식 전달자 지표).
→ 손코딩 k-means(표준 라이브러리로 충분)로 군집화 후, 군집 특성을
탐험형/관찰형/협력형/공격형/전달형 라벨로 **사후 명명**한다.
검증 지표: 동일 world seed + 상이 trait seed에서 개체 간 행동 분포의
Jensen-Shannon divergence가 trait 분산 0일 때 대비 유의하게 큰가.

### 8.2 패턴 추출과 계보 (transmission.py)

- **패턴** = 개체의 (Context 클래스, ActionType) 시퀀스에서 빈발 n-gram
  (n ≤ 3, 카운팅 기반) — 예: `[적색열매 관찰 → PICK_UP → 물가로 MOVE → EAT]`.
- **전파 판정**: B가 패턴 P를 처음 수행한 시점 이전 W=30틱 내에
  A의 P 수행을 목격(WitnessEvent 로그)했고 B의 P 관련 가설이
  `source=OBSERVED, origin=A 계보`이면 전파 간선 A→B.
  가설의 `origin_agent_id`가 계보를 끝까지 보존하므로 밈 계통수가 그려진다.

### 8.3 문화 판정 4조건 (culture.py)

패턴 P에 대해 이벤트 로그에서 기계 판정:

1. **전파**: 전파 간선으로 연결된 수행 개체 ≥ 3
2. **존속**: `origin 개체의 사망 틱 < P의 마지막 수행 틱 - 50`
3. **변형**: P의 변이형(편집 거리 1~2)이 후대에 등장하고 원형과 공존
4. **집단 차이**: 공간 근접 그래프로 나눈 개체 군집 간 P 수행률 차이가
   200틱 이상 유지

4조건 모두 충족 → "문화 후보"로 리포트. **게임 판정은 MVP에서 제외**하되,
판정에 필요한 원자료(반복 참여, 생존 무관 지속)는 이벤트 로그에 이미
남으므로 나중에 탐지기만 추가하면 된다.

### 8.4 탐지기 자체의 검증

탐지기를 실제 시뮬레이션에 쓰기 전에, **합성 로그 생성기**로 정답을 아는
로그(전파 사슬 주입/무주입)를 만들어 정밀도·재현율을 먼저 측정한다.
탐지기가 무작위 행동에서 문화를 "발견"하면 그 판정은 무효다.

### 8.5 저장 스키마 (SQLite)

```
runs        (run_id, seed, config_json, started_at)
events      (run_id, tick, agent_id, kind, payload_json)   -- 유일한 사실 원장
decisions   (run_id, tick, agent_id, record_json)           -- DecisionRecord
hypotheses  (run_id, agent_id, hypothesis_id, snapshot_json, logged_tick)
agents      (run_id, agent_id, born_tick, died_tick, traits_json)
```

`events.kind`: SPAWN, DEATH, ACTION, DAMAGE, WITNESS, SIGNAL_SENT,
SIGNAL_HEARD, HYPOTHESIS_CREATED, HYPOTHESIS_UPDATED, HYPOTHESIS_SPLIT,
HYPOTHESIS_ADOPTED, TRUST_CHANGED, ENV_CHANGED. analysis는 이 테이블만
읽는다 — 시뮬레이션 재실행 없이 모든 판정이 가능해야 한다.

## 9. MVP에서 제외하는 것

| 제외 | 이유 |
|---|---|
| 도구 제작·조합 시스템 | 창발 대상이지 기능이 아님. 행동 조합으로 관찰 |
| 거래·소유권 | 동상 |
| 게임 탐지기 | 문화 4조건이 먼저. 원자료는 로그에 확보됨 |
| 유전(traits 상속) | 문화 전파와 유전 전파가 섞이면 판정 불가. 신규 스폰은 무경험 + 무작위 traits — 문화만이 세대를 건널 수 있게 |
| planning_horizon > 1 | 즉시 효용만으로 1차 실험. 필드만 예약 |
| 복수 신호 조합(문장) | 단일 토큰 연합부터 |
| GUI/실시간 시각화 | 텍스트 렌더 + 사후 리포트로 충분 |
| numpy/scipy 포함 외부 수치 라이브러리 | 카운팅과 산수로 전부 가능. 의존성 최소화 |
| 미로 세계와의 통합 | 별도 패키지. 통합은 두 세계가 각자 검증된 후 |

## 10. 구현 순서와 단계별 검증 테스트

각 단계는 "구현 + 테스트 동시, pytest 통과 + 실행 확인 후 커밋" 리듬 유지.

**P0 — 세계와 결정론** (world, dynamics, sim 골격)
- 20×20 생성, 자원 배치, 환경 변화 스케줄, 6단계 틱, 스크립트 개체 2명
- ✅ 같은 seed → 500틱 이벤트 로그 해시 동일 (개체 수를 바꿔도 환경
  스트림은 동일해야 함 — RNG 분리 검증)
- ✅ 충돌 규칙 단위 테스트 (같은 음식 EAT 경합, 이동 목적지 중복)

**P1 — 욕구 구동 생존** (drives, decision — 가설 없이 규칙 예측만)
- ✅ 욕구 개체의 평균 수명 > 무작위 개체 × 2 (20 seed)
- ✅ 에너지 포화 상태에서 EAT 효용이 탐사보다 낮아짐 (결핍→가치 검증)

**P2 — 가설 엔진** (memory, hypothesis, prediction)
- ✅ 독성 빨간 열매 환경에서 15회 노출 내 관련 가설 confidence < 0.3
- ✅ 분화 테스트: "익은 것만 안전" 조건 심은 세계에서 ripeness 지정
  자식 가설이 생성되고 부모보다 높은 confidence 획득
- ✅ 전이 테스트: 음식 위치 재배치 후 성능 유지 (절대 좌표 오염 부재 증명
  — 장기 실험 교훈의 회귀 테스트)

**P3 — 개체 분화** (traits 분산 활성화)
- ✅ 동일 world seed, trait 분산 0 vs 유: 행동 분포 JS divergence 유의차
- ✅ profiles.py가 탐험형/회피형을 traits 모른 채 행동만으로 분리

**P4 — 사회 학습** (witness, imitation, trust, signals)
- ✅ 사전 학습된 '지식 보유' 개체 1 + 무경험 9: 안전 음식 발견 시간이
  모방 OFF 대조군보다 유의하게 단축 (**모방 ON/OFF 스위치가 실험 대조군**)
- ✅ 배신 시나리오: 틀린 가설을 목격 학습한 개체의 trust 하락 확인
- ✅ 신호 연합: 위험+SIGNAL 공기 반복 후 수신 개체의 FLEE 효용 상승

**P5 — 수명 주기와 장기 실행**
- ✅ 사망·대체 스폰 후에도 이벤트 로그 결정론 유지
- ✅ 2,000틱 × 12개체 실행이 로컬에서 수 분 내 완료

**P6 — 문화 분석기** (analysis 전체)
- ✅ 합성 로그에서 전파 사슬 정밀도·재현율 ≥ 0.9 (§8.4)
- ✅ 실제 장기 실행 로그에 4조건 판정 리포트 산출
- 여기서 나오는 것이 Stage 1의 최종 산출물: **"문화 후보가 출현했는가,
  못 했다면 어떤 조건이 부족한가"에 대한 데이터 기반 답변**

---

## 11. 연구의 유의미성 — 사전 등록 (실행 전 고정)

### 11.1 이미 알려진 것 — 새로움의 한계를 먼저 인정한다

격자 세계에서 단순 에이전트로 문화 전파·교역·집단 분화가 나오는 것은
기존 연구로 확립되어 있다 (Sugarscape — Epstein & Axtell 1996, Axelrod
문화 확산 모델 1997, Lewis 신호 게임 계열의 신호 의미 획득). 따라서
**"문화가 창발했다"는 그 자체로 이 연구의 성과가 아니다.** 또한 귀납
템플릿·모방 확률·신뢰 원장을 전부 우리가 설계했으므로, 창발처럼 보이는
현상이 설계의 반향일 가능성을 항상 대조군으로 배제해야 한다.

### 11.2 성공의 3단 정의

| 단계 | 내용 | 판정 근거 | 미달 시 해석 |
|---|---|---|---|
| **최소 성공** (아키텍처) | 가설 엔진이 암기가 아니라 전이하고, 타 개체 지식을 검증 후 흡수 | P2 전이 테스트 + P4 효과 크기 | 엔진 결함 — Rookery 이식 보류 |
| **중간 성공** (인과) | 소거법으로 필수 재료 규명: "스위치 X를 끄면 현상 Y가 사라진다" | 모방/오지각/신호/traits 분산 각각의 ON-OFF 대조 | 현상이 스위치와 무관 → 설계의 반향이었다는 증거 |
| **최대 성공** (문화) | 4조건 충족 패턴 검출 | §8.3 + 합성 로그 검증 통과한 탐지기 | 미출현 자체가 산출물 (§11.3 P6) |

최소 성공만으로도 프로젝트는 유의미하다 — 이식 경로는 §11.5.

### 11.3 단계별 사전 예측 — 검증 실행 전에 여기 적힌 대로 고정

| 단계 | 예측 (수치 기준) | 빗나가면 무엇이 반증되는가 |
|---|---|---|
| P1 | 욕구 개체 평균 수명 ≥ 무작위 × 2 (seed 20) | 결핍→가치 변환(drives) 설계 결함 |
| P2 | 독 노출 15회 내 관련 가설 confidence < 0.3; 재배치 후 성능 유지 | 귀납 템플릿 또는 컨텍스트 특징 집합의 결함 |
| P3 | trait 분산 유/무 간 행동 분포 JS divergence 유의차 | traits→효용→행동 경로가 약함 — 효용식 재검토 |
| P4 | 모방 ON이 안전 음식 발견 시간을 OFF 대비 ≥ 30% 단축 | 목격 빈도 부족(밀도 문제) 또는 채택 규칙 결함. 밀도 스윕 후 재실험 1회만 허용 |
| P6 | **예측하지 않음** — 문화 4조건 충족은 보장도 기대도 하지 않는다 | 미출현이면 "4조건 중 어디서 끊겼는가"가 최종 보고의 본문이 된다 |

### 11.4 해석 규율

- 파라미터 튜닝 후 재실행한 결과는 '탐색'이지 '검증'이 아니다. 검증
  실행은 seed 20개 고정, 실행 중 튜닝 금지. 튜닝했다면 사전 예측을
  갱신하고 새 검증 실행으로 판정한다.
- 합성 로그 검증(§8.4)을 통과하지 않은 탐지기의 문화 판정은 무효.
- 부정적 결과도 긍정적 결과와 동일한 형식으로 progress.md Findings에
  기록한다 — 이 프로젝트에서 실패는 폐기물이 아니라 자산이다(Genesis
  원칙과 동일).

### 11.5 Rookery 이식 경로 — 문화 출현과 무관하게 성립

가설 엔진(출처 표시, 신뢰도, 반례 카운트, 분화, 폐기)은 격자 세계에
의존하지 않는다. 최소 성공이 확인되면: Rookery 직원의 경험 메모리에
동일 구조를 이식한다 — 작업 결과(매니저 승인/반려)가 α/β 증거가 되고,
`source=OBSERVED` 채택은 직원 간 지식 공유가 된다. 즉 이 실험의 1차
고객은 문화 연구가 아니라 **Rookery의 지능 코어**다.

---

## 검토가 필요한 열린 결정 3건

1. **개체 수와 세계 크기의 비율**: 20×20에 12개체는 밀도 3%. 목격 반경 3에서
   상호작용 빈도가 부족하면 사회 학습이 통계적으로 안 보일 수 있다.
   P4에서 밀도를 파라미터 스윕할 것을 전제로 12명 시작을 제안.
2. **ATTACK의 유인**: 자원이 풍족하면 공격할 이유가 없어 공격형이 안 나온다.
   겨울 자원 희소화가 유인을 만들 것으로 예상하지만, 안 나오면 그것대로
   보고한다 (억지로 유인을 심지 않는다).
3. **신뢰도 하한의 z값**과 분화 문턱(support 8, confidence 0.35~0.65)은
   임의 초기값이다. P2에서 민감도를 확인하고 decisions.md에 기록한다.
