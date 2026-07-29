# Rookery UX Audit v1

> **Day 1 — 코드 수정 없음.** 실제 화면을 열어 확인한 결과만 담았습니다.
> 추측과 확인을 구분해서 적었습니다.

**기준 사용자:** 김민수, 32세, 스타트업 대표. ChatGPT만 써봄. 프롬프트 잘 못 씀.
시장조사는 자주 함. **설명서를 읽지 않음.**

**판정 기준:** 모든 화면에서 5초 안에 네 질문에 답이 나오는가 —
①여긴 어디인가 ②뭘 해야 하는가 ③왜 해야 하는가 ④다음은 무엇인가.

---

## 0. 먼저 — 검증하지 않은 audit의 위험

이 문서를 쓰기 전에 다른 AI가 작성한 audit이 있었습니다. 그 문서는 화면을
본 적 없이 설명서만 읽고 쓴 것이었고, **10개 지적 중 최소 3개가 사실과
달랐습니다.** 그대로 따랐다면 이미 있는 기능을 다시 만드는 데 며칠을
썼을 겁니다.

| 그 audit의 주장 | 실제 |
|---|---|
| "Assign Work에 예시/템플릿이 없다" | **틀림.** 클릭 가능한 예시 4개 + 전 항목 placeholder + 글자수 안내가 이미 있음 |
| "작성 가이드라인이 없다" | **틀림.** "One sentence, 5–120 characters" 등 항목별 안내 존재 |
| "결과물에 요약이 없다" | **틀림.** Executive Summary가 맨 위에 있음 |
| "좌측 내비게이션" | **틀림.** 상단 가로 내비게이션임 |
| "메뉴가 10개에 육박" | **과소평가.** 실제 17개이고 화면 밖으로 잘림 |

**교훈: UI 판단은 화면을 본 사람만 할 수 있습니다.**

---

## 1. User Journey — 실측

### Step 1–2. 랜딩

```
Rookery
"Don't buy software. Hire employees."
Rookery gives you a team of AI employees who work for your
company—not another dashboard to babysit.
[Hire Your First Employee]

Alex — Market Research Analyst — Available to hire
Emma — Sales Development Representative — Available to hire
```

**5초 테스트: 통과.** 컨셉이 한 문장으로 전달되고, 실존하는 직원 두 명이
이름·역할·설명과 함께 보입니다. CTA도 하나입니다.

> ⚠️ 다만 이건 **제 판단**입니다. 30초 테스트는 제품을 모르는 사람에게
> 물어야 유효합니다. 이것만은 사람이 확인해야 합니다.

### Step 3. 가입 직후

가입 → 회사 생성 → **Dashboard로 던져짐.**

환영 화면도, 다음 행동 안내도 없습니다. **5초 테스트: 실패 (②④).**

### Step 4. Dashboard ← **가장 심각한 지점**

실측한 섹션 순서입니다.

```
1  My Company / Northstar AI
2  Workforce Overview       (숫자 타일 8개)
3  Current operation
4  Organization
5  How the company is running
6  Organizational Learning
7  Playbooks
8  Company Standards
9  1 recommendation for you
10 Your Workforce           ← 직원 카드가 여기
11 [Assign Work] 버튼
```

**사용자가 하러 온 단 하나의 행동이 9개 섹션 아래에 있습니다.**

화면에 있는 조작 12개 중 실제 행동은 `Assign Work` 2개뿐이고,
나머지 10개는 전부 `View` / `Open` — **보기만 하는 링크**입니다.

**5초 테스트: 실패 (②③④).**

### 내비게이션 — 실측

**17개.** 헤더 폭 1523px, 화면 폭 730px → **뒤쪽 메뉴는 잘려서 안 보입니다.**

```
Employees · Dashboard · Company · Operations · Intelligence ·
Planning · Evolution · Organization · Playbooks · Learning ·
Standards · Projects · Recommendations · Assignments ·
Recurring · Deliverables · Settings
```

폭이 좁을 때 브랜드와 첫 메뉴가 붙어 **"RookeryEmployees"** 로 읽힙니다.

**5초 테스트: 실패 (①②).**

### Step 5. Assign Work — **문제 없음**

```
Assign work to Alex
How often should this work happen?  [Once] [Recurring]

Need an example?
  · Compare our competitors' pricing
  · Research recent changes in our market
  · Analyze how competitors position their products
  · Find important industry trends from the last six months

What do you need Alex to do?      (One sentence, 5–120 characters)
  placeholder: "Research our three main competitors"
Add more context
  placeholder: "Focus on pricing, product features, target customers..."
What would a good result look like?
  placeholder: "A clear comparison of each competitor..."
```

**5초 테스트: 통과.** 예시가 클릭 가능하고, 세 항목 모두 placeholder가 있고,
길이 안내까지 있습니다. **여기는 고칠 것이 없습니다.**

### Step 6. Working

단계가 실시간으로 표시됩니다:
`업무 이해 → 조사 계획 → 검색 → 출처 읽기 → 분석 → 작성 → 근거 확인 → 제출`

**5초 테스트: 부분 통과.** 무엇을 하는지는 보이지만 **얼마나 남았는지 모릅니다.**
2~3분 걸리는데 진행률이 없어 "멈춘 건가" 하는 순간이 옵니다.

### Step 7. Deliverable

Executive Summary가 맨 위에 있고, 그 아래 섹션들, 출처가 번호로 붙습니다.
"Worked to Market Research v1", "12 sources cited"도 표시됩니다.

**5초 테스트: 부분 통과.** 요약은 있지만 **전체 길이의 압박**은 실재합니다.
실측한 결과물은 섹션 5개, limitations 8개, next steps 5개였습니다.

### Step 8. Review

`Approve` / `Request Changes` 두 버튼. 회사 기준 위반이 있으면
"Against your standards"가 위에 뜨고 필수 위반 시 승인이 막힙니다.

**5초 테스트: 실패 (③).** 왜 내가 승인해야 하는지, 승인하면 무엇이 달라지는지
설명이 없습니다. 실제로는 **승인해야 그 직원이 다시 일할 수 있습니다** —
이게 가장 중요한 사실인데 화면 어디에도 안 적혀 있습니다.

### Step 9. Learning

`Memory`(개인) vs `Organization Knowledge`(회사)의 구분이 화면에서
설명되지 않습니다. **5초 테스트: 실패 (①③).**

### Step 10. 재방문

이어서 할 것을 알려주는 곳이 없습니다. **5초 테스트: 실패 (②④).**

---

## 2. Pain Point Matrix

| 단계 | 김민수의 생각 | 근본 원인 | 확인 |
|---|---|---|---|
| 가입 직후 | "이제 뭐 누르지?" | 환영/첫 행동 안내 부재 | 확인됨 |
| Dashboard | "직원이 어디 있지?" | **직원 카드가 10번째 섹션** | **실측** |
| 내비게이션 | "메뉴가 왜 이렇게 많아" | **17개, 화면 밖으로 잘림** | **실측** |
| Dashboard | "볼 것만 많고 할 게 없네" | 조작 12개 중 10개가 View 링크 | **실측** |
| Working | "멈춘 건가" | 단계는 있으나 진행률/예상시간 없음 | 확인됨 |
| Deliverable | "길다" | 요약은 있음. 길이 자체가 부담 | 확인됨 |
| Review | "왜 내가 승인하지?" | **승인해야 직원이 풀린다는 사실이 안 보임** | 확인됨 |
| Learning | "Memory가 뭐지" | 내부 용어가 화면에 그대로 노출 | 확인됨 |
| 재방문 | "어디서 이어가지" | 이어하기 지점 없음 | 확인됨 |
| Assign | — | **문제 없음** | **반증됨** |

---

## 3. 막히는 지점 Top 10 — 심각도 순

심각도 = (막힐 확률) × (막혔을 때 이탈할 확률).

1. **Dashboard에서 직원이 10번째** — 하러 온 일이 스크롤 아래 숨어 있음
2. **내비게이션 17개가 화면 밖으로 잘림** — 첫인상에서 "복잡한 ERP"로 각인
3. **Dashboard가 읽기 전용** — 조작 12개 중 10개가 단순 View
4. **가입 후 안내 없음** — 시작점이 없음
5. **승인의 이유가 안 보임** — 승인 안 하면 직원이 계속 묶여 있는데 모름
6. **Working 진행률 없음** — 2~3분간 불안
7. **재방문 시 이어하기 없음** — 두 번째 세션에서 이탈
8. **빈 화면이 행동을 유도하지 않음** — "없습니다"로 끝남
9. **Memory / Organization Knowledge 용어** — 내부 개념이 그대로 노출
10. **결과물 길이** — 요약은 있으나 전체 분량이 부담

> 1~3번이 전체 이탈의 대부분을 차지할 것으로 봅니다. 4~7은 그 다음,
> 8~10은 그 다음입니다.

---

## 4. 고칠 순서

**Priority 1 — Dashboard 뒤집기 (Day 2)**
직원과 "오늘 할 일"을 맨 위로. 나머지 섹션은 아래로 밀거나 접기.
읽는 화면이 아니라 **행동하는 화면**으로.

**Priority 2 — 내비게이션 줄이기 (Day 2)**
17개 → 5개 이하. `Company / Intelligence / Planning / Evolution /
Organization / Playbooks / Learning / Standards / Operations`는
베타에서 숨겨도 됩니다. 이 화면들은 **모델을 안 쓰므로 지워도 비용 이득은
없지만**, 인지 부하는 확실히 줄어듭니다.

**Priority 3 — 첫 경험 (Day 3)**
가입 → Dashboard가 아니라 가입 → 첫 업무 안내.

**Priority 4 — 승인의 의미 설명**
"승인하면 Alex가 다시 일할 수 있습니다" 한 줄. 가장 싼 수정이고 5번을 해결.

**Priority 5 — Working 진행률 / 빈 화면 CTA / 용어 정리**

### 손대지 말 것

- **Assign Work 폼** — 예시·placeholder·안내 모두 이미 있음
- **결과물의 Executive Summary** — 이미 맨 위에 있음
- **랜딩 페이지** — 5초 테스트 통과. 다만 사람에게 확인 필요

---

## 5. 이 audit이 확인하지 못한 것

정직하게 남깁니다.

- **가입/온보딩 실제 흐름** — 이미 로그인된 상태라 신규 가입을 처음부터
  밟아보지 않았습니다. Step 3 판단은 코드 기준입니다.
- **모바일** — 데스크톱만 봤습니다. 내비게이션 17개는 모바일에서 더 나쁠 것이
  거의 확실합니다.
- **실제 사용자 반응** — 저도 이 제품을 만든 쪽이라 김민수가 아닙니다.
  랜딩의 30초 테스트만은 **제품을 모르는 사람**에게 물어야 합니다.

---

## 6. 결론

제품의 뼈대는 튼튼합니다. 문제는 기능이 아니라 **배치와 우선순위**입니다.

가장 큰 문제 세 개가 전부 Dashboard 한 화면에 있고, 셋 다 **기능을 새로 만들지
않고 순서를 바꾸는 것만으로** 해결됩니다. Day 2 하루면 1·2·3번이 끝납니다.
