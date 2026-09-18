# AI 모델 시장조사 — 2026-09-18 (181회차)

사장님 주제: "시장조사할까? 에이아이 모델". 우리 장부(14일 지출·모델 감시 스냅샷·실측)를 깔고, 그 위에 지금 시장을 얹었다.
**값은 전부 100만 토큰당 입력/출력 달러.** "우리 실측" 은 로키 안에서 실제로 잰 것만 적었다 — 남의 벤치마크는 참고일 뿐이다(모델 선택 표 09-14: 라우팅이 만든 착시가 있었다).

## 0. 급한 것 하나 — **Sora 2 API 가 9월 24일에 사라진다**

OpenAI 공식 폐기표: Videos API · `sora-2` · `sora-2-pro` 를 **2026-09-24 제거**(3월 24일 예고). 대체 모델 없음.
우리 영상 직원(Vid)의 장면 만들기가 `sora-2` 다(`src/lib/providers/sora.ts`). 14일간 7회 $2.80 썼다. **엿새 뒤부터 영상의 "실제 장면" 이 죽는다.**
후보(초당 값): Veo 3.1 Lite 1080p $0.05 · Veo 3.1 720p 무음 $0.03 · Kling 3.0 $0.09~0.14(선불 패키지) · Sora 2 는 Together 등 대행에서 $0.10 으로 남을 수 있음(공식 아님).
→ 결정 필요: ① Veo 3.1(Gemini API, 키 하나 더) ② Kling ③ 영상 장면을 끄고 글자 카드로 되돌림(09-16 이전 상태). 값·품질을 한 판씩 재 보고 정한다.

## 1. 우리가 지금 쓰는 자리와 값 (14일 지출 $52.0)

| 자리 | 지금 모델 | 값(입/출) | 14일 지출 | 실측 |
|---|---|---|---|---|
| 판단·유니티 만들기 | gpt-5 | 1.25 / 10 | **$28.47** (263회) | 유니티 C# 은 아직 이 자리 |
| 3D 메시 | Meshy-6 | 크레딧 $0.02 | $6.36 | 2,184 크레딧 남음 |
| 그림 | gpt-image-2 | 5 / 40 | $5.89 (40회) | |
| 판단 기본 | deepseek-v4-pro | 1.32 / 3.96 | $3.73 (118회) | 22판 중 검사 탈락 1 |
| 영상 장면 | sora-2 | 초당 $0.10 | $2.80 (7회) | **9/24 폐기** |
| 제일 비싼 자리 | gpt-6-astra | 10 / 50 | $2.78 (10회) | 실속 4~5배·값 4배(09-15) |
| 대화·읽기 | deepseek-v4-flash | 0.44 / 1.32 | $0.15 (163회) | |
| 웹 만들기·고치기·고리 심판 | **gpt-5.6-luna** | **0.2 / 1.2** | $0.10 (40회) | 고침 4/8/47줄 맞음, 그림 봄, 고리 5바퀴 $0.005 |
| 목소리 | gpt-4o-mini-tts | 분당 ≈$0.015 | $0.27 | |
| 옆자리 | claude-sonnet-5 / haiku-4-5 | 2/10 · 1/5 | $0 | **Anthropic 잔액 0** — 라우터가 OpenAI 로 비껴감 |

돈의 55% 가 gpt-5 한 자리다. 그중 대부분은 초기 유니티 통째 다시 쓰기(09-08~13). 지금은 웹 판이 luna 로 가서 하루 지출이 크게 줄었다.

## 2. 시장에 있는 것 (2026-09, 글 모델)

| 모델 | 값(입/출) | 남들이 말하는 강점 | 우리와의 관계 |
|---|---|---|---|
| gpt-5.6-luna | 0.2 / 1.2 (7/30 80% 인하) | 값 대비 최고 | **지금 주력.** 그림도 본다(실측) |
| gpt-5.6-terra | 2 / 12 | 균형 | 만들기 자리 후보 — 09-18 실측 39초·190줄·$0.05, luna 와 큰 차이 없었음 |
| gpt-5.6-sol | 5 / 30 (8/21 20% 인하, 3개월) | OpenAI 최상위 | 안 씀. 비싼 판 하나에만 |
| gpt-6-astra | 10 / 50 | 9/3 출시 | 우리 실측: 실속 4~5배지만 값도 4배 |
| claude-opus-5 | 5 / 25 | 코딩 1위(실제 GitHub 이슈) | 잔액 0. 유니티 C# 자리 후보 |
| claude-sonnet-5 | 2 / 10 | | 잔액 0 |
| claude-fable-5.1 | (9/1 출시) | 일부 순위표 1위 | 이 대화의 저(Claude)가 그것 |
| deepseek-v4-pro | 1.32 / 3.96 | SWE-bench 80.6% | 지금 판단 기본 |
| deepseek-v4-flash | 0.44 / 1.32 | SWE-bench 88.8%(0731) — Opus 4.8 을 1/10 값에 | **고치는 자리 A/B 후보** |
| gemini-3.8-flash | 0.75 / 3.75 (연말까지, 이후 1.5/7.5) | 8/13 출시 | 키 없음. 영상(Veo) 붙이면 같은 키 |
| gemini-3.1-pro | 2 / 12 | 3.5 Pro 는 무기한 연기 | |
| glm-5.2 (오픈) | 자체 호스팅 | SWE-bench Pro 62.1% > gpt-5.5 | 우리 규모엔 GPU 가 없다 |

## 3. 그림·영상·3D·목소리

| 자리 | 지금 | 시장 | 판단 |
|---|---|---|---|
| 그림 | gpt-image-2 (5/40) | **gpt-image-2.5 flare(빠름)·sunburst(정밀 편집)** 9/8 출시, 8/30 · Gemini 이미지(나노바나나) 장당 ≈$0.039 · Flux 3 이미지는 아직 API 없음 | 2.5 sunburst 를 편집(같은 캐릭터 유지)에 한 판 시험 |
| 영상 | sora-2 (초당 0.10) | **9/24 폐기.** Veo 3.1 Lite 0.05 · Kling 3.0 0.09~0.14 | 0번 항목 |
| 3D | Meshy-6 | Tripo 3.0(8초, 자동 리깅, 게임 토폴로지) · Meshy(PBR·리깅·전체 파이프라인) · Hunyuan3D(무료지만 GPU $2,000+) | 지금 것 유지. 09-05 "오디션 안 함" 그대로 — 크레딧 2,184 남음 |
| 목소리 | gpt-4o-mini-tts | (안 찾음 — $0.27/14일, 바꿀 이유 없음) | 유지 |

## 4. 갈아탈 것 / 시험할 것 / 두는 것

**바로(엿새 안):** 영상 장면 모델 — Sora 2 대체 결정. 제일 싼 길은 Veo 3.1 Lite(Gemini 키 하나). 안 하면 9/24 부터 영상 직원이 글자 카드로 돌아간다(죽진 않는다 — 09-16 이전 길이 남아 있다).

**시험(값 싼 것부터, 사장님이 "해" 하면):**
1. 고치는 자리 A/B: luna vs deepseek-v4-flash — 같은 고장 셋, 심판자가 봄(2단계 "섞어 보내기" 와 같은 일). 값 ≈ $0.02.
2. 그림 편집: gpt-image-2 vs gpt-image-2.5-sunburst — 같은 캐릭터 옷 바꾸기 한 장씩. 값 ≈ $0.3.
3. 유니티 C# 자리: gpt-5 vs luna vs terra — 사장님 PC 유니티가 있어야 재진다. 주말.

**두는 것:** Meshy(크레딧 남음), TTS, deepseek 판단 자리, astra(값 4배).
**안 하는 것:** Anthropic 충전 — 라우터가 비껴가서 지금은 필요 없다. 오픈 모델 자체 호스팅 — GPU 없음.

## 출처
- OpenAI GPT-5.6 값·인하: https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/ , https://codersera.com/blog/gpt-5-6-sol-terra-luna/
- OpenAI 폐기표(Sora 2, 9/24): https://developers.openai.com/api/docs/deprecations , https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation
- 코딩 순위·DeepSeek V4: https://www.getaiperks.com/en/blogs/38-best-ai-models-for-coding-2026 , https://ofox.ai/blog/best-ai-models-complete-guide-2026/
- Gemini 값: https://kunavo.com/guides/gemini-api-pricing-2026 , https://benchlm.ai/google/api-pricing
- 영상 값: https://www.cometapi.com/ai-video-api-pricing/ , https://modelslab.com/blog/api/veo-3-1-vs-kling-3-sora-2-ai-video-api-cost-2026
- 3D: https://www.3daistudio.com/blog/best-3d-model-generation-apis-2026 , https://www.meshy.ai/compare/meshy-vs-tripo
- 그림: https://www.orcarouter.ai/blog/gpt-image-2-5-vs-flux-3 , https://intuitionlabs.ai/articles/ai-image-generation-pricing-google-openai
