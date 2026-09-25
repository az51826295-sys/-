# 로키 혼자 돌리기 — 인수인계 (2026-09-25 20:3x, 사장님 "널 이제 안 쓸 거야, 로키만 쓸 거고")

## 사장님이 정한 것
- 돈: **한 달 3만원** → 회사 한도 `$21 / 30일`(companies.spend_limit_usd=21, spend_window_days=30). 한도에 닿으면 API 가 스스로 거부한다(안전장치).
- 지출은 **/ask 오른쪽 미리보기 판 맨 아래**: "이번 달 사용 $X · 한도 $21/30일". (web 배포 뒤부터)
- 로키가 스스로 학습할 것 · 스스로 UI 를 구성할 것(아래 "아직 안 된 것").

## 사람 손 없이 도는 것
| 무엇 | 언제 | 어디 | 값 |
|---|---|---|---|
| 자가진화 규칙 고리(Genesis) | 매일 새벽 | 서버(worker), `GENESIS_SPEND=i-approve` | 소액 |
| **데이터 수집 배치** — 손님 AI 주문 3개 → 접수 → 일 → 채점 | 매일 09:00 | 이 노트북, 작업 스케줄러 `RookeryDailyCollect` → `engine/tools/daily_collect.cmd`, 로그 `engine/work/anything/daily.log`, 표 `engine/docs/genesis/data-collection.md` | ≈$0.25/일 |
| **다음 일 제안** — 장부 사실을 루나·딥시크에 주고 자 있는 일 셋 받기 | 매주 일요일 09:30 | `RookeryWeeklyNextWork` → `engine/tools/weekly_next_work.cmd`, 결과 `engine/work/anything/next-work-weekly.log` | ≈$0.04/주 |
| 예측자·자·심판 | 판마다 | 서버 | 판값에 포함 |
노트북이 **켜져 있고 로그인돼 있어야** 스케줄러가 돈다(서버 쪽 고리는 늘 돈다).

## 보는 법 · 끄는 법
- 지출: /ask 판 아래 · `npx tsx engine/tools/rookery_env.mts engine/tools/week_spend.mts`
- 건강: `… engine/tools/health.mts` · 자 시험 전부: `… engine/tools/probe_all.mts`
- 수집 표: `engine/docs/genesis/data-collection.md` · 원장: `engine/docs/genesis/anything-runs.md`
- 배치 끄기: `schtasks /Delete /TN RookeryDailyCollect /F` · 주간 제안 끄기: `schtasks /Delete /TN RookeryWeeklyNextWork /F`
- 한도 바꾸기: `… engine/tools/limit_show.mts <달러> <일수>`

## 로키가 스스로 배우는 방향 (지금 있는 것)
1. **표본** — 매일 배치가 진짜 접수·직원·자를 거친 판을 쌓는다(오늘 5판 5/5, 자 46/46).
2. **자** — 결과물마다 기계가 재고(형식·개수·숫자·용어·길이·클리어…), 떨어진 자 이름별 건수가 장부에 남는다.
3. **제안** — 주간 `next_work` 가 그 장부에서 "자 있는 다음 일" 을 고른다(루나·딥시크 둘 다). **고치는 손은 아직 사람(코드) 이다** — 로키가 제안까지 하고 코드 고침은 못 한다.
4. **규칙** — Genesis 매일 고리가 실패 사례에서 규칙 후보를 뽑아 채택한다(일하는 방식만 바뀜, 자·코드는 안 바뀜).

## 아직 안 된 것 (정직하게)
- **스스로 UI 구성**: 안 됐다. 로키의 화면(/ask)은 사람이 짠 Next.js 다. 로키가 만들 수 있는 건 한 파일 HTML(발표 자료·게임)뿐. 길: 로키에게 "내 화면을 HTML 로 다시 그려" 를 시키고 그 결과를 /ask 안 미리보기로 붙이는 것 — 자(오류 0·글자 있음·클릭 반응)는 이미 있다. 사람이 한 번 배선해야 한다.
- **코드 자가 고침**: next_work 제안을 코드로 옮기는 건 아직 사람. (옛 Rookery Alpha 코드 고침 엔진은 08-22 뒤 잠들어 있다.)
- **취향**: 광고 "설명서 느낌"·"쫀득" 방향은 자가 없다. 사장님 반응(«reaction»)이 쌓이면 취향 자를 만드는 게 다음 칸.
