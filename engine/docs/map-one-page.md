# 로키 한 장 지도 (2026-09-18)

사장님이 "지금 구조는 어떤 건지" 물으셨을 때 드린 그림. 400개 파일은 전부 이 뼈대에 붙은 살이다.
최종 결과물: **감독 AI — AI를 잘 다루는 AI** (`final-product-and-plan-2026-09-18.md`).

```
[사람]  브라우저 /ask  (또는 안드로이드 앱)
   │ 말
   ▼
① 접수 (웹 서버 rookery-web)                                  src/lib/chat/everydayService.ts · routing.ts
   · 싼 모델이 가른다: 그냥 답할까 / 검색할까 / 일로 맡길까
   · "고쳐 줘"는 규칙 — 지난 결과물을 만든 직원에게 (도는 중이어도)
   ▼
② 직원에게 넘김 → 업무(assignments) 한 줄                      src/lib/chat/delegate.ts · service.ts
   · 직원 = 역할별 프롬프트+절차: Dev(앱·게임) Vox(3D) Vid(영상) Ana(분석) Nova(그림)
   · 머리(판단자): 어느 AI로, 어디서, 얼마나 크게               src/lib/genesis/head.ts · providers/place.ts
   · 예측을 먼저 잠근다: 한 번에 통과할 확률                     src/lib/genesis/predict.ts
   ▼
③ 실행 (일꾼 서버 rookery-worker) — 화면을 꺼도 돈다            src/worker · src/lib/skills/*
   Dev: 계획 → [큰 일이면 '시작' 묻기] → 만들기(처음: 파일 전체 / 고침: 조각만 patch.ts)
        → 부탁 심판자 "시킨 만큼 했나"(askJudge.ts) → 결과물(deliverables)
   쓰는 AI: gpt-5 · DeepSeek · Sora · Meshy · Tavily — 호출마다 장부(model_usage)에 돈이 적힌다
   ▼
④ 돌아옴: 대화 한 칸 + 미리보기(버전·파일·심판자 말)           src/lib/chat/workReturns.ts · app/ask/PreviewPanel.tsx
   ▼
⑤ 사람의 다음 말 → 다시 ①

매일 새벽 4시 (일꾼 서버, 혼자)                                 src/lib/genesis/daily.ts
   · 결과를 받고 사장님이 한 말 → 판정(물렸다/받아들였다/모름)    implicit.ts · reaction.ts
   · 판정 + 유니티·기계 검사로 예측 채점 → 예측 유전자 진화       evolve.ts
   · 실패 사례 → 규칙 제안 → 가려 둔 사례로 검증 → 통과만 프롬프트에   ruleLoop.ts
   · 계기판: 살아 있나 / 굶나 / 멈췄나                          vitals.ts

저장: Supabase 2개(rookery-main · dugeun-dot) · 서버: Railway 4개(웹/일꾼 × 2제품)
열쇠: 저장소 밖 %LOCALAPPDATA%\rookery-dot\ · 결제: Dodo 시험 모드에 세워 둠(src/lib/billing)
```

감독 AI의 세 눈: **머리**(시작 전에 고른다) · **심판자**(나온 뒤에 본다) · **예측**(맞혔는지 채점받는다).
"잘 만든다"의 뜻은 이 셋이 각각 숫자로 나아지는 것이다: 머리가 고른 AI가 더 자주 이긴다 · 심판자의 말이 사장님 판정과 맞는다 · 예측 오차가 준다.
