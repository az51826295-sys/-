# 로키 혼자 돌리기 — 인수인계 (2026-09-25 20:3x, 사장님 "널 이제 안 쓸 거야, 로키만 쓸 거고")

## 사장님이 정한 것
- 돈: **한 달 3만원** → 사장님 회사 `$14 / 30일` + 개발 계정 `$7 / 30일` = $21(09-25 21:3x 사장님 "하지"). 한도에 닿으면 API 가 스스로 거부한다(안전장치).
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

## 225회차(09-25 23:0x~23:4x) — 인스타 담당 Gram (사장님 "하자")
- 로키가 인스타 자동화 가능성을 조사해 옴(공식 API 하루 25개·심사 1~4주·사업자 인증 필요·브라우저 봇은 정지 사유). 내 판단으로 **순서를 뒤집었다**: 심사는 사장님 신분 확인이 걸려 내가 못 하고, 올릴 게 없으면 권한도 소용없다 → **만드는 쪽부터**.
- **Gram**(`src/lib/skills/socialPost/`, slug gram): 주제 한 줄 → 정사각 PNG 1~3장 + 본문 + 해시태그 + 첫 줄 후보 3개 + 올리는 법. 자 10개(본문 2,200자·첫 줄 125자·첫 줄이 본문 맨 앞·해시태그 개수/모양·지어낸 숫자 없음·준 사실 사용·그림 장 수·빈 그림·정사각). `gram_probe` 14/14(probe_all 에 넣음), 접수 `routing_test` 2/2.
- 첫 실전(개발 계정, 결과물 c965f297): 자 10/10, 값 ≈$0.02. 본문이 설명서 톤인 것이 사람 칸의 숙제.
- **자 시험이 내 자 버그를 잡았다**: 해시태그 "#1인창업" 의 1 을 "지어낸 숫자" 로 셌다 → 숫자는 본문만 본다. 심은 고장 하나는 덜 심겨 있었다(첫 줄이 이미 사실을 되뇜) → 제대로 심어 다시.
- **매일 자동으로**(사장님 "너도 자동으로 돌려"): 사장님 서버가 매일 09시 뒤 게시물 한 벌을 만든다(`runDailyPost`, 스위치 `ROOKERY_DAILY_POST=1`). 재료는 고정 사실 4줄(날마다 순서를 돌린다) + **그 주에 로키가 실제로 만든 결과물 제목** — 지어내는 칸이 없다. 끝나면 평소 길로 대화에 붙고 폰 알림. 값 하루 $0.02 ≈ 달 $0.6, 한도에 닿으면 만들기 전에 멈춘다. 자물쇠는 **성한 판만** 센다(실패는 하루 3번까지 다시).
- **자동 업로드는 아직**: 결과물의 `content_json.uploadReady`(캡션+해시태그 합친 글·그림 수·posted:false)가 나중에 API 를 꽂을 자리. 붙이려면 인스타 Business/Creator 계정 + 페이스북 페이지 + Meta 앱 심사·사업자 인증이 먼저다(사장님 손).

## 224회차(09-25 22:1x~22:4x) — 연습 고리를 서버 안으로 (사장님 "자동으로 만들고 싶은데 자동 몰라?")
- 매일 연습(손님 AI 주문 3개 → 접수 → 일 → 자)이 **개발 워커 안에서** 돈다: `src/lib/genesis/practice.ts`, 스위치 `ROOKERY_PRACTICE=1`·`ROOKERY_PRACTICE_N=3`(개발 워커 변수). 한국 09시 뒤 첫 시간 눈금에 주문, 12시 뒤 첫 눈금에 "오늘 정리" 를 사장님 폰으로. **노트북이 꺼져 있어도 돈다.**
- 자물쇠: 연습은 "오늘 만든 연습 업무가 있나", 정리는 service_heartbeat 의 `practice_summary` 줄(genesis_runs 의 kind 가 check 제약이라 새 종류를 못 넣음 — DDL 통로 없음).
- 손 시험 `practice_probe.mts 1`: 주문 1 → Ana, 두 번째 부르면 "오늘 이미 돌았다"/"이미 보냈다". 값 $0.05.
- 노트북 작업 스케줄러 `RookeryDailyCollect` 는 **껐다**(둘 다 돌면 하루 6판 = 두 배). 주간 `RookeryWeeklyNextWork`(제안 + 자가 고침 커밋)는 git 이 필요해 노트북에 남는다.
- 아직 손: 자가 고침 코드의 배포(개발 서버 → 본 서버).

## 한도는 오늘부터 센다 (09-25 21:5x 폰 화면 "이번 기간 지출 한도에 걸려 있습니다" 뒤)
`$14/30일` 이 지난 30일 지출($64)을 잡아 인사 한 줄도 못 보냈다. 숫자는 그대로 두고 **세는 시작점**을 오늘로: limit 모드에서 `companies.credits_started_at` 을 "한도 시작일" 로 쓴다(allowance.ts, 새 열을 만들 통로가 없어 빈 열을 빌림). 도구: `ROOKERY_ACCOUNT=owner … limit_start.mts`(시작점을 지금으로). 결과: 사장님 회사 $0.00/$14 열림. 다음 달에도 저절로 30일 창으로 굴러간다(시작점은 창보다 오래되면 무시).
## 아직 안 된 것 (정직하게)
- **자가 고침의 배포**: 로키가 고친 코드는 로컬 커밋까지다. 서버에 올리는 건 사람 손가락 하나(`sh engine/tools/deploy.sh rookery-worker`). 자동 배포는 한 번 잘못 올리면 20분 죽는 걸 09-24 에 봤기에 일부러 안 열었다.
- **자가 고침의 범위**: 제안이 "Railway 이주" 처럼 코드 밖이면 파일을 잘못 고르고 문에서 떨어진다(되돌리니 해는 없다). 되는 건 자·프롬프트·도구 손질 크기.
- **취향**: 광고 "설명서 느낌"·"쫀득" 방향은 자가 없다. 사장님 반응(«reaction»)이 쌓이면 취향 자를 만드는 게 다음 칸.

---

## 2026-09-27/28 — 자 목록은 `engine/docs/rulers-v1.md` 로

사장님 *"자 제시해줘 쫌있으면 클로드 코드가 종료되고 난 못 써."*

**로키를 계속 재려면 `engine/docs/rulers-v1.md` 하나를 읽으면 된다.** 자 아홉 개의
정확한 명령과 "통과가 무슨 뜻인지", 그리고 **재서 접은 것 넷(다시 하지 말 것)** 이 적혀 있다.

그날 붙인 것 여섯: 수학·과학을 판단 자리에서 푼다 · 예측자 900→16000 · 같은 결과물
두 번 붙는 것 차단 · 장부가 잘림을 적게 함 · 웹이 자기 커밋을 알림 · **로키가 자기 한계를 안다**.

한계와 진화 천장은 따로 적혀 있다: `engine/docs/limits-v0.md` · `engine/docs/evolution-ceiling-v0.md`.
