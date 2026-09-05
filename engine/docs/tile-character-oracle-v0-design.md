<!-- provenance: {"source_id": "docs/tile-character-oracle-v0-design.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-27T09:19:54", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# 타일·캐릭터 반입 오라클 v0 (사전 등록, 지출 0)

작성 2026-08-27 08:2x. 상속: `judge-bench-v1.2`.
게이트 ①(`docs/engine-ready-gate-v0-design.md`)의 "자산 종류 3종" 중 나머지 둘.

## 0. 지금 오라클이 재는 것 — 그리고 못 재는 것

`pixel_art_style` 원자는 다섯을 잰다: 파일 무결성 · 논리 크기(가로·세로) ·
색 수 · 알파 이진. **전부 한 장짜리 속성**이다.

그런데 타일과 캐릭터의 결함은 **한 장 안에 없다**:

| 매체 | 한 장으로는 안 보이는 결함 |
|---|---|
| 타일 | 이어 붙였을 때 **이음새가 보인다**(가장자리 불연속) |
| 캐릭터 | 방향마다 **팔레트가 다르다**, 걷기 **프레임 수가 다르다**, 방향별 **키가 들쭉날쭉** |

즉 지금 오라클은 타일을 타일로, 캐릭터를 캐릭터로 보지 않는다. 크기·색만 맞으면
통과한다. 이 문서는 그 구멍을 메운다.

## 1. 타일 — 이음새 (새 원자 `tile_seam`)

타일은 자기 자신과 이어 붙는다. 그러므로 **오른쪽 끝 열과 왼쪽 끝 열이 만난다**
(세로도 같다). 그 만나는 자리의 색 차이가 **타일 내부의 이웃 열 차이보다 유난히
크면** 이음새가 보인다.

- `seam_dx` = 오른쪽 끝 열과 왼쪽 끝 열의 평균 채널 차(0~255)
- `interior_dx` = 내부 이웃 열 쌍들의 평균 차의 **중앙값**
- **`seam_ratio_x = seam_dx / interior_dx`** (세로도 같은 방식으로 `seam_ratio_y`)

`interior_dx`가 0이면(단색 타일) 비율이 정의되지 않는다 → **undefined**.
지어내지 않는다.

**문턱은 지금 정하지 않는다.** 값을 재서 `tools/threshold_sheet.py`에 올리고
사장님이 동결한다(`docs/measurement-rules.md` §4: 근거 없이 내가 정하지 않는다).
그때까지 이 규칙은 **measured·미판정**이다.

## 2. 캐릭터 — 방향 사이의 일관성 (새 원자 `character_set_consistency`)

캐릭터 폴더는 `rotations/{south,west,east,north}.png` 와
`walking/{dir}/frame_*.png` 구조다(`genesis/sprite_lib` 규약과 같다).

| 규칙 | 종류 | 기준 |
|---|---|---|
| `frame_count_equal` | **계약**(문턱 없음) | 네 방향의 걷기 프레임 수가 **같다** |
| `direction_bbox_height` | **계약**(자연 단위) | 방향별 불투명 bbox 높이 차 **≤ 1픽셀** |
| `palette_overlap` | **measured·미판정** | 방향들 색 집합의 자카드 유사도 최솟값 |

앞의 둘은 문턱을 고를 필요가 없다 — "같다"와 "1픽셀"은 자연 단위다.
세 번째는 값을 재서 문턱표에 올린다.

방향 파일이 하나라도 없으면 그 규칙은 **undefined**(fail 아님)다.

## 3. 3값과 이빨 (심판대 규율 그대로)

- 못 재면 fail이 아니라 **undefined**(단색 타일, 방향 누락, 파일 파손).
- **자기 반례를 거절해야 등록한다**: 이음새를 일부러 어긋낸 타일, 한 방향만
  프레임을 하나 뺀 캐릭터, 한 방향만 팔레트를 바꾼 캐릭터. 반례는 positive에서
  **한 곳만** 바꾼 변이다(짚인형 방지).
- 증거 등급은 전부 `measured.*` — 자기신고 없음.

## 4. 이 문서가 하지 않는 것

- **통과율을 재는 것.** 그건 생성이 필요하고(PixelLab·Retro Diffusion) 지출과
  사장님 승인이 붙는다. 여기서는 **자를 만든다.**
- 문턱을 정하는 것(§1·§2의 미판정 둘).
- "예쁜 타일인가" — 취향 층이고 심판이 없다.
