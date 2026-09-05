<!-- provenance: {"source_id": "docs/brief-for-gpt-20260827.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-27T16:22:47", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# 픽셀 아트 발주 사양서 (GPT에게 그대로 붙여넣기)

> 이 문서 하나만 읽고 프롬프트를 쓸 수 있게 썼습니다. 앞뒤 맥락 없이 통째로
> 붙여넣으셔도 됩니다.

---

## 0. 당신이 할 일

우리는 **PixelLab**(pixellab.ai)이라는 픽셀 아트 생성 API로 2D 탑다운 RPG의
자산을 만듭니다. 당신은 **주문서(프롬프트 + 파라미터)를 작성**합니다. 그림을
그리지 않습니다. 나온 결과는 우리 쪽 기계 심판이 수치로 판정합니다.

두 종류를 부탁드립니다:

1. **캐릭터** — 주인공(마녀), NPC
2. **배경(지형 타일셋)** — 풀·흙길·물·숲

---

## 1. 목표 (사장님이 정한 참고 화면에서 실측한 값)

목표는 파스텔 톤의 아늑한 탑다운 RPG입니다. 참고 화면을 프로그램으로 재서 나온
수치입니다. **이 수치가 합격선입니다.**

| 축 | 목표 | 지금 우리 것 | 뜻 |
|---|---|---|---|
| **명암폭** (밝기 5~95% 범위) | **172** | 타일 57 · 마녀 123 | 어두운 곳과 밝은 곳의 차이. **가장 중요합니다** |
| 밝기 중앙값 | 169~181 | 타일 87 | 전체적으로 밝다 |
| 채도 중앙값 | 35~37 | 타일 81 · 마녀 3 | 옅다. **단, 0이면 안 됩니다** |
| 캐릭터-바닥 대비 | 99 | 38 | 캐릭터는 바닥보다 **어둡습니다** (의도된 것) |
| 캐릭터 색 수 | 20 이상 | hero 10 · merchant 21 | 20 미만이면 실루엣처럼 보입니다 |
| 유채색 램프 | 색상대 3개 이상, 각 3단계 이상 | 마녀 **0개** | 아래 §2 참고 |

**핵심**: 파스텔 = **저채도 + 넓은 명암폭**입니다. 옅으면서도 어두운 곳과 밝은
곳이 확실히 갈립니다. 밋밋한 것이 아닙니다.

---

## 2. 램프 (픽셀 아트가 통일돼 보이는 진짜 이유)

좋은 픽셀 아트는 재질마다 **그림자 → 중간 → 하이라이트가 3~5단계로 묶인 램프**를
쓰고, 모든 자산이 **같은 램프에서** 색을 꺼내 씁니다. 평평한 색 목록은 팔레트가
아닙니다.

그래서 프롬프트에 **재질과 그 재질의 명암을 같이** 적어 주십시오. 예:

> "deep plum wool cloak with darker folds and a lighter worn sheen on the shoulders"

"plum cloak"만 쓰면 단색으로 옵니다.

---

## 3. 절대 쓰면 안 되는 표현 (실측으로 확인된 것)

우리 기계가 이 표현들을 **자동으로 거부**합니다. 실제로 당해서 만든 목록입니다.

| 금지 | 실제로 일어난 일 |
|---|---|
| `no harsh contrast` | 명암폭이 172 → **36**이 됐습니다. 죽 같은 그림 |
| `low saturation` | 캐릭터 채도가 **3**이 됐습니다. 완전 흑백 |
| `desaturated`, `muted` | 위와 같음 |
| `lineless` | 형태가 지워졌습니다 |
| `simple`, `minimal shading`, `flat colours` | 실루엣이 나옵니다 |

**규칙: 속성을 "낮춰라/없애라"로 요구하면 그 극단(0)이 옵니다.**
대신 **원하는 것을 지목**하십시오.

| 나쁨 | 좋음 |
|---|---|
| "low saturation" | "dusty sage and warm clay tones" (색을 이름으로) |
| "no harsh contrast" | "deep shadow under the brim, bright highlight on the crown" |
| "soft shading" | "three-step shading: dark base, mid tone, single bright rim" |

---

## 4. 쓸 수 있는 파라미터 (프롬프트와 별개로 넣는 값)

### 캐릭터: `POST /create-character-with-4-directions`

```json
{
  "description": "<당신이 쓸 문장>",
  "image_size": {"width": 48, "height": 48},
  "view": "low top-down",
  "proportions": {"type": "preset", "name": "chibi"},
  "shading": "highly detailed shading",
  "detail": "highly detailed",
  "outline": "selective outline",
  "text_guidance_scale": 8.0
}
```

- **`proportions`** — `default` / `chibi` / `cartoon` / `stylized` /
  `realistic_male` / `realistic_female` / `heroic`.
  또는 커스텀: `{"type":"custom","head_size":1.6,"legs_length":0.7,
  "shoulder_width":0.9}` (각 0.5~2.0, head_size는 1.7 권장 상한).
  **사장님 지시: "키 같은데 더 작고 귀엽게" → chibi 계열로 가 주십시오.**
  우리는 이 파라미터를 **한 번도 안 보냈습니다** — 그래서 지금 캐릭터가 전부
  밋밋한 기본 비율이고 "스타듀밸리 같다"는 지적을 받았습니다.
- `shading` — `flat` / `basic` / `medium` / `detailed` / `highly detailed shading`
- `detail` — `low detail` / `medium detail` / `highly detailed`
- `outline` — `single color black outline` / `single color outline` /
  `selective outline` / `lineless`
- `color_image` + `force_colors: true` — 팔레트를 **강제**합니다(64×64 PNG 필요).
  당신이 팔레트를 정해 주시면 우리가 이미지로 만들어 넣습니다.
  **색을 16진수로 목록화해 주시면 가장 좋습니다.**

### 배경(지형): `POST /create-tileset`

```json
{
  "lower_description": "<아래 지형>",
  "upper_description": "<위 지형>",
  "transition_description": "<둘이 만나는 경계>",
  "tile_size": {"width": 16, "height": 16},
  "view": "low top-down",
  "shading": "highly detailed shading",
  "detail": "highly detailed",
  "outline": "selective outline",
  "transition_size": 0.5,
  "text_guidance_scale": 8.0
}
```

- **Wang 타일셋입니다** — 두 지형의 모서리 조합 16장이 나옵니다. 그래서 항상
  **한 쌍**으로 주문합니다(풀↔흙길, 풀↔물, 풀↔숲).
- `mode`: `standard`(기본) / `pro`(더 비싸고 좋음, `spread_x`·`raggedness` 같은
  경계 제어가 붙음)
- **`lower_description` 은 세 쌍 모두에서 똑같이 써 주십시오.** 안 그러면 풀이
  쌍마다 달라져서 화면에서 어긋납니다. 이게 지금 우리의 가장 큰 문제입니다.

---

## 5. 지금 우리 게임의 상태 (당신이 맞춰야 할 것)

- **타일 16px, 캐릭터 48px** — 캐릭터가 땅 3칸을 차지해 너무 큽니다.
  (타일을 32px로 올릴지 검토 중입니다. 일단 16px 기준으로 써 주십시오.)
- 지형은 **밝은 초록 풀 + 갈색 흙길**. 참고 화면보다 훨씬 어둡고 쨍합니다.
- 물·나무·집은 아직 **프로그램이 그린 단색 블록**(자리표시자)입니다.
- 주인공은 **마녀**로 정해졌습니다.

---

## 6. 부탁드리는 산출물

아래 **6건**을 각각 JSON으로 주십시오.

| # | 무엇 | 엔드포인트 |
|---|---|---|
| 1 | 주인공 마녀 | character |
| 2 | 상인 NPC (마녀와 같은 세계로) | character |
| 3 | 풀 ↔ 흙길 | tileset |
| 4 | 풀 ↔ 물(연못가) | tileset |
| 5 | 풀 ↔ 숲(나무 지붕) | tileset |
| 6 | **마스터 팔레트** — 위 전부가 공유할 색 32~48개. 재질별 램프로 묶어서 (예: `grass: [#..., #..., #...]`) | — |

**6번이 제일 중요합니다.** 지금 우리 자산들이 서로 안 맞는 근본 원인이 공유 팔레트가
없다는 것입니다.

각 건마다 **3가지 변형**을 주시면 더 좋습니다. 우리는 여러 개 뽑아서 기계로 거른
뒤 사람이 고르는 방식으로 갑니다 — 지금까지는 하나씩만 뽑아 쓰느라 품질이
운에 맡겨져 있었습니다.

---

## 7. 우리가 검사할 것 (미리 알려드립니다)

받은 주문서는 발주 전에 자동 검사를 통과해야 합니다:

1. §3의 금지 표현이 없을 것
2. **명암을 지목**했을 것 (`shadow` / `highlight` / `light` 중 하나 이상)
3. **색을 이름이나 16진수로 지목**했을 것

나온 그림도 §1의 수치로 판정하고, **게임 바닥 위에 1:1로 올려서** 경계 대비가
40 이상인지 봅니다(따로 보면 괜찮은데 화면에 놓으면 묻히는 것을 막기 위해서입니다).
