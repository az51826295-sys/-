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

## 221회차(09-25 18:2x~19:1x) — "아니 되게 만들어라" 뒤에 된 것
- **스스로 UI 구성 → 됐다.** Deck 직원의 능력 `self_board`: 대화창에 "내 화면 만들어 줘 / 현황판 그려 줘 / 지출 보이는 화면" 이라 하면 로키가 **DB 에서 지출·한도·직원·최근 일·수집 판을 읽고** 칸·이름·문구를 **스스로 정해** 한 파일 HTML 현황판을 내고, /ask 미리보기(iframe)에 그대로 뜬다. 자 4개(칸 3개 이상·재료 숫자 다 보임·지어낸 달러 없음·브라우저 오류 0), `board_probe` 11/11. 매일 09:00 배치가 그날 숫자로 **다시 짠다**(`daily_collect.cmd` 끝줄). 접수 자에도 한 줄(`routing_test` 화면).
- **제안 → 코드 손 → 됐다.** `engine/tools/self_fix.mts`: 제안 하나 → 로키가 손댈 파일 ≤3 을 목록에서 고름 → 조각(find/replace)으로 고침 → 문 셋(`tsc` · `probe_all --fast` · 부탁 심판자 "제안 크기만큼 고쳤나") → 다 지나면 **로컬 커밋만**(push·배포 안 함, 안 지나면 되돌림). 첫 실전: 커밋 `571d452`(health.mts 에 ⑥ 줄, 7줄, 137초) — 로키가 스스로 고친 첫 코드. 매주 일요일 09:30 배치 끝에 `--auto`(사람손=false·값 0 인 첫 제안). 원장 `engine/docs/genesis/self-fix.md`.
- **구멍 하나 막음**: 도구(손님 AI·제안·자가 고침)의 지출이 회사 장부(model_usage)에 안 적혀 한도가 못 봤다 → `seatProviderForCompany` 로 적히고, 한도에 닿으면 도구도 멈춘다. 화면·현황판·order_gen 의 숫자도 **문이 재는 숫자(최근 N일 창)** 로 통일(전엔 화면 "이번 달 $9" 인데 문은 "$21 다 씀").

## 222회차(09-25 19:3x~19:5x) — 개발 계정을 따로 (사장님 "개발자 계정 따로 만들어 줘")
- **개발 계정** `dev@rookery.local` · 회사 "로키 개발" (`c4c1aef6…`) · 한도 **$7/30일**(내가 실측에서 제안한 숫자: 매일 배치 ≈$0.2×30 + 주간 ≈$0.2×4; 바꾸려면 `ROOKERY_ACCOUNT=dev` 없이 `dev_account.mts --limit N` 이 아니라 아래 한 줄). 직원 10명 채용·지식 카드 채움. 비밀번호는 무작위라 아무도 모른다 — 화면에서 보려면 /login 매직 링크로 dev@rookery.local (메일이 안 가는 주소라 사실상 도구 전용).
- **배치·자가 고침·시험은 전부 개발 계정에서 돈다**: order_gen · next_work · self_fix · ask_for · emp_seed · board_probe 가 `engine/tools/company.mts` 의 `account()` 를 쓴다. 사장님 회사로 돌리려면 `ROOKERY_ACCOUNT=owner`. 지출 보기·한도 바꾸기(week_spend·limit_show·spend_look)는 그대로 사장님 회사.
- **사장님 회사의 $21/30일은 사장님이 시킨 일에만** 나간다. 개발 계정 $7 은 별도 지갑(둘 합치면 $28 ≈ 4만원 — 3만원 안에 두려면 사장님 회사 한도를 $14 로: `npx tsx engine/tools/rookery_env.mts engine/tools/limit_show.mts 14 30`).
- 첫 실전: 개발 계정에서 현황판 주문 → 서버 워커가 self_board 를 돌려 **자 4/4, $0.02** (사장님 회사에선 한도로 못 돌던 것). `board_probe` 개발 계정에서 11/11.
- 개발 계정 한도 바꾸기: `engine/tools/limit_show.mts` 는 사장님 회사 전용이라, 개발 계정은 `ROOKERY_ACCOUNT` 와 무관하게 DB 에서 companies.spend_limit_usd 를 고친다(도구: `dev_limit.mts <달러> <일수>`).

## 222회차(09-25 20:0x~) — 서버도 따로 (사장님 "서버는 따로 두고")
- Railway 같은 프로젝트에 **개발 서비스 둘**: `rookery-worker-dev` · `rookery-web-dev`(https://rookery-web-dev-production.up.railway.app). 같은 DB(Supabase rookery-main), 다른 서버.
- **가르는 줄**(worker.mts `ROOKERY_SCOPE`): 개발 워커(`dev`)는 개발 계정 회사(`ROOKERY_DEV_COMPANY_ID`)의 일만 집고, 본 워커(`prod`)는 그 일을 건너뛴다. 자가진화 매일·주간 고리는 본 워커만. 심장 소리는 서비스 이름으로 따로.
- **결과 돌려놓기·쓸기 고리는 두 워커가 다 돈다** — 이미 붙은 것은 표시를 보고 거르지만 잠금은 아니다(화면 폴링과 워커가 같이 돌던 것과 같은 정도의 겹침). 겹쳐 붙은 턴이 보이면 여기가 원인.
- 변수: 본 서비스 것을 복사(RAILWAY_*·결제 DODO/PADDLE/BILLING·GENESIS_SPEND 은 뺌) + `ROOKERY_SCOPE=dev`, `ROOKERY_DEV_COMPANY_ID`. 본 워커에도 `ROOKERY_SCOPE=prod`·DEV id 를 넣었다(그래야 건너뛴다).
- 배포: 개발 서버는 `sh engine/tools/deploy.sh rookery-worker-dev` / `rookery-web-dev`. **자가 고침이 커밋한 코드는 개발 서버에 먼저 올려 보고, 본 서버는 사람이.** 개발 서비스 둘의 Railway 사용료가 붙는다(작은 서비스 둘, 달 $2~5 어림 — 사장님 청구서에서 확인).

## 223회차(09-25 20:5x~21:2x) — 폰 알림 (사장님 "편하게 자동으로 하고 알람 받고 싶은데")
- **켜는 법(한 번)**: 폰의 로키 앱(또는 크롬)에서 /ask → 왼쪽 위 메뉴 → **알림 켜기** → 허용. 기기마다 한 번. 컴퓨터 크롬에서도 된다.
- **오는 것 셋**: ① 시킨 일이 대화에 붙을 때 "로키 — 끝났어요/못 끝냈어요: 제목"(누르면 그 대화) ② 매일 09:00 배치 끝에 "아침 정리: 오늘 수집 N판 · 사장님 지갑 $x/21 · 개발 $y/7" ③ 자가 고침이 커밋하면 "스스로 고쳤어요(배포는 아직)".
- 부품: 두근도트 푸시(web-push·VAPID·sw.js)를 공용으로. 구독 표는 로키 프로젝트에 남아 있던 `dot_push_subs` 재사용(DDL 통로가 없어서 — 관리 토큰·psql·pg 셋 다 손에 없음). 코드: `src/lib/push/{send,client}.ts`, `/api/push`, `engine/tools/notify.mts`.
- 안 되는 경우: 아이폰 사파리는 홈 화면에 추가한 뒤에만; 알림을 한 번 거절한 브라우저는 설정에서 풀어야 다시 묻는다.

## ⚠ 지금 상태: 한도에 닿아 있다 (사장님이 정할 것)
`$21/30일` 은 **지나간 30일**을 센다. 09-25 19:00 기준 최근 30일 지출 **$64.82**(9월 초 3D·게임 판이 큼) → 새 일은 하나도 못 시작한다(현황판 첫 주문도 `SPEND_LIMIT_REACHED` 로 취소됨). 앞으로 지출 0 이면 **10-10** 에 창 합이 $21 아래로 내려가 저절로 풀린다.
- 그대로 두면: 10-10 까지 로키는 쉬고, 매일·매주 배치는 "한도" 한 줄만 남기고 끝난다(돈 0).
- 지금부터 세고 싶으면(사장님 결정): 창을 30일 → 15일로 하면 지금 $15.6 이라 바로 열린다 — `npx tsx engine/tools/rookery_env.mts engine/tools/limit_show.mts 21 15`. 숫자는 사장님 것이라 내가 안 바꿨다.

## 아직 안 된 것 (정직하게)
- **자가 고침의 배포**: 로키가 고친 코드는 로컬 커밋까지다. 서버에 올리는 건 사람 손가락 하나(`sh engine/tools/deploy.sh rookery-worker`). 자동 배포는 한 번 잘못 올리면 20분 죽는 걸 09-24 에 봤기에 일부러 안 열었다.
- **자가 고침의 범위**: 제안이 "Railway 이주" 처럼 코드 밖이면 파일을 잘못 고르고 문에서 떨어진다(되돌리니 해는 없다). 되는 건 자·프롬프트·도구 손질 크기.
- **취향**: 광고 "설명서 느낌"·"쫀득" 방향은 자가 없다. 사장님 반응(«reaction»)이 쌓이면 취향 자를 만드는 게 다음 칸.
