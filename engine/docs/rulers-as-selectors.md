# 재는 자 → 고르는 자 — 재고 (11-23)

사장님(11-23): *"판단만 하면 안 되구나 — 결정·선택도 해야지." "해 보기 전에 다 확정하자, 그전에 만든 것도."*

## 세는 법

- `engine/tools` 파일 643개 중 머리말·이름에 자/점검/시험/probe/check 가 있는 것 **267개**.
- 기계(모델 0)로 보이는 것 219 · AI 를 부르는 것 48. **머리말과 코드 낱말로 가른 것이라 돌려서 확인한 숫자가 아니다.**
- 목록 원본: 이 문서를 만든 스크립트 출력(세션 임시 폴더), 필요하면 다시 뽑는다.

## 세 갈래

| 갈래 | 대략 | 고르는 자가 될 수 있나 |
|---|---|---|
| **AI 가 만든 결과물을 재는 자** | 약 40 | **된다** — 후보 여럿 중 고를 수 있다 |
| 앱·배관·결제·배포가 살았나 보는 자 | 약 180 | 안 된다 — 고를 후보가 없다(문으로 쓴다) |
| 자를 재는 자(이빨·심은 고장·잠그기 전 가짜 판) | 약 45 | 안 된다 — 다른 자를 지킨다 |

### 고르는 자 후보 (결과물을 재는 것)

**글**
- `src/lib/chat/voice.ts` checkVoice — 비서 말투(대조군 있음)
- dot_shape_probe(카톡 글 모양) · dot_politeness_test · dot_voice/en_voice/stage_voice_test(단계별 말투) · dot_drift_probe(15턴 뒤에도 그 사람인가) · dot_memo_probe(지어내기 미끼) · dot_name_probe · dot_time_probe · translate_probe · ash_토씨 · dot_posts_variety

**그림**
- dot_art_check · dot_sprite_edge_check / dot_edge_local(잘림) · 도트 크기 자(dot_regrid·texel) · dot_character_spec(열 명 같은 자) · dot_결자(한 결인가) · dot_face_probe(42px 에서 표정 구별)

**게임·코드**
- ash_문법(1초) · ash_살았나 · ash_글자_시험 · ash_전세계화 · ash_난이도 · ash_체감 · jump_measure · play_probe · motion_probe · clear_probe

**정답이 있는 것**
- math_probe · suneung_bench — 답지가 있을 때만

## 확정할 것 (사장님)

1. **첫 대상 갈래**: 글 / 그림 / 게임 중 하나.
2. **비교 판**: 싼 AI ×N + 자가 고름 vs 비싼 AI ×1 (+ 싼 AI ×1 대조군).
3. **이긴 것의 정의**: 잠금 전에 숫자로.
4. **돈 상한**: 충전금이 필요하다.

정해지면 `*-design.md` 로 잠그고, 그다음에 돌린다.
