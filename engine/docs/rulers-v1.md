# 로키의 자 목록 — 인수인계 v1 (2026-09-27/28)

사장님: *"자 제시해줘 쫌있으면 클로드 코드가 종료되고 난 못 써."*

**이 문서 하나만 있으면 로키를 계속 잴 수 있다.** 전부 `engine/tools/` 안에 있고,
앞에 `npx tsx engine/tools/rookery_env.mts` 를 붙여야 DB·열쇠가 붙는다.

---

## 0. 먼저 알 것 — 자를 볼 때의 규칙 넷

오늘 하루에 내 자가 **일곱 번** 틀렸다. 그래서 이 넷을 먼저 적는다.

1. **0 은 "없다" 가 아니라 "못 본다" 일 수 있다.** 세기 전에 그 칸에 값이 들어가는 길이
   코드에 있는지 본다. (장부 "잘림 0건" 이 실은 분기가 없어서였다)
2. **한 판은 점수가 아니다.** 답이 하나인 것은 여러 번 재고 분포를 본다.
   (수학 "6/6" 이 다섯 번 재니 3/10 이었다)
3. **받은 줄 수를 전체와 대 본다.** 정확히 1000·500 같은 둥근 수가 나오면 상한에 걸린 것이다.
4. **차이가 작으면 "한 건 값"(1/N)과 견준다.** 그보다 작으면 **못 가른다**고 적는다.

---

## 1. 대화가 제대로 말하나 — `chat_bench.mts`

```
npx tsx engine/tools/rookery_env.mts engine/tools/chat_bench.mts
npx tsx engine/tools/rookery_env.mts engine/tools/chat_bench.mts --only 한계
npx tsx engine/tools/rookery_env.mts engine/tools/chat_bench.mts --mini     # 싼 자리를 gpt-5-mini 로 바꿔 재 본다
```
**10칸.** 잡담을 잡담으로 받나 · 오늘 늘어난 일을 아나 · 자기 결과물을 아나 ·
빈손으로 되묻지 않나 · 스스로 진화하는지 아나 · 수학을 풀이까지 알려 주나 ·
**한계를 숫자로 아나** · **안 해 본 것을 모른다고 하나** · (반대편) 진짜 일은 맡기나 ·
(반대편) 자세히 달라면 길게 쓰나.

- 지금 상태: **10/10 통과**
- 이 파일이나 `persona.ts`·`limits.ts` 를 고치면 **반드시 먼저 돌린다.**
- `--mini` 는 **바꾸지 말라는 증거**다: 수학은 179점인데 이 자에서 6/8 로 떨어진다.

## 2. 수학·과학 실력 — `suneung_bench.mts` + `suneung_key.py`

```
python engine/tools/suneung_key.py                      # 정답을 코드가 센다(먼저 돌린다)
npx tsx engine/tools/rookery_env.mts engine/tools/suneung_bench.mts 1 --lanes 1,2
npx tsx engine/tools/rookery_env.mts engine/tools/suneung_bench.mts 1 --lanes 2,3 --시험지 engine/data/suneung-killer-v0.json
npx tsx engine/tools/rookery_env.mts engine/tools/suneung_bench.mts 1 --lanes 1 --맨   # 로키 지시문을 떼고 재 본다
```
시험지 `engine/data/suneung-v0.json`(53문항 183점: 수학·물리·화학·생명·지구),
킬러 `suneung-killer-v0.json`(12문항 48점). **정답은 사람이 적지 않는다** — `검산` 칸에
세는 코드를 적으면 `suneung_key.py` 가 채운다. 어긋나면 멈춘다.

- 지금 상태: 싼 자리 **137/183** · 판단 자리 **183/183**(두 판 연속) · gpt-5 동점
- 결과 원장 `engine/data/suneung-runs.md` — **같은 것을 두 번 사지 않게 여기부터 읽는다**
- `검산방식` 칸을 읽어라: **"셈"** 은 정답이 사람 풀이와 독립, **"식"** 은 사람 계산을 옮긴 것.
  `[식]` 에서 틀림이 나오면 **모델보다 사람 계산을 먼저 본다.**

## 3. 자리를 고르는 눈 — `gate_look.mts`

```
npx tsx engine/tools/rookery_env.mts engine/tools/gate_look.mts 40
```
사장님이 실제로 친 말에 `깊게`(판단 자리로 올리기)가 켜지나. **헛켜짐 0/40** 이 지금 상태.
- 안 켜야 할 때 켜면 **대화마다 값이 샌다**. 켜야 할 때 안 켜면 **학생이 틀린 답을 받는다**(더 나쁘다).
- **정답표가 없다.** 목록을 사람이 보고 짚으면 그때 정답표가 된다.

## 4. 한계 — `limits_look.mts`

```
npx tsx engine/tools/rookery_env.mts engine/tools/limits_look.mts    # → engine/docs/limits-v0.md
```
장부에서 "해낸 최대치 · 끝까지 못 간 것 · 안 해 봤다" 를 센다.
대화에 실리는 것은 `src/lib/chat/limits.ts`(690자, 회사별 10분 기억).
- **최대치는 한계가 아니다.** 더 큰 걸 시도한 적 없으면 벽은 그보다 뒤다 — 그 문장도 프롬프트에 들어간다.
- 리포트는 **모든 회사**, 대화용은 **그 회사만** 센다(영상 69.6 vs 57).

## 5. 스스로 얼마나 진화하나 — `evolution_ceiling.mts`

```
npx tsx engine/tools/rookery_env.mts engine/tools/evolution_ceiling.mts   # → engine/docs/evolution-ceiling-v0.md
```
1층 혼자(규칙 17개 2,297자) · 2층 사람 손 한 번(자가 고침 커밋 3건, 배포는 사람) ·
3층 구조상 못 함(자·예산·성격·판정). **채택률 5/58 = 9%** 가 지금 병목.

## 6. 규칙 후보가 어느 문에서 죽나 — `rule_funnel.mts`

```
npx tsx engine/tools/rookery_env.mts engine/tools/rule_funnel.mts
```
**지금은 못 읽는다.** `learning_candidates.reason` 에 후보 본문이 들어 있고 **판정 이유가 저장되지 않는다.**
→ **다음에 할 일 1번**(아래).

## 7. 값·한도 — `spend_look` · `allowance_look` · `truncation_look`

```
npx tsx engine/tools/rookery_env.mts engine/tools/spend_look.mts        # 어디에 돈이 갔나
npx tsx engine/tools/rookery_env.mts engine/tools/allowance_look.mts    # 한도와 남은 것 (문을 직접 부른다)
npx tsx engine/tools/rookery_env.mts engine/tools/truncation_look.mts 14 # 어느 자리가 상한에 물리나
```
- `allowance_look` 은 **문(`checkAllowance`)을 직접 부른다** — 스스로 창을 계산하면 거짓 보고가 난다(09-26).
- `truncation_look` 은 09-27 부터 쌓이는 것만 셀 수 있다(그 전엔 잘림을 `other` 로 뭉갰다).

## 8. 예측자 — `judge_predict.mts` + `predict_calibrate.mts`

```
npx tsx engine/tools/rookery_env.mts engine/tools/judge_predict.mts --run --팔 30
npx tsx engine/tools/predict_calibrate.mts      # 호출 0번 — 이미 산 답을 고쳐 쓴다
```
Brier 로 잰다. 넘어야 하는 선은 **밑바탕 0.250**.
- 지금: 900토큰 0.369 → 16000 **0.299** · gpt-5-mini 0.335 · 엮음 0.301 → **아무 팔도 못 넘었다**
- 보정해도 밑바탕과 **못 가른다**(차이 0.004 < 한 건 값 0.067), 손잡이 k=0.18
- **재료가 쌓일 때까지 판을 더 사지 않는다.**

## 9. 배포 — `deploy_safe.mts`

```
npx tsx engine/tools/rookery_env.mts engine/tools/deploy_safe.mts rookery-web      # 문만 보고 멈춤
npx tsx engine/tools/rookery_env.mts engine/tools/deploy_safe.mts rookery-web --up # 실제로 올림
```
서버는 넷: `rookery-worker`(사장님 회사 일) · `rookery-worker-dev` · `rookery-web`(대화·결과 붙이기) · `rookery-web-dev`.
- **어느 서버가 그 일을 하는지 먼저 정한다.** 결과 붙이기는 **워커와 웹 둘 다** 한다.
- 올린 **직후엔 "못 잰다"** 가 나올 수 있다(새 컨테이너가 아직 안 떴다). 1~2분 뒤 `service_heartbeat` 를 본다.
- 09-27 부터 **웹도 자기 커밋을 알린다**(`src/instrumentation.ts`).

---

## 오늘(09-27) 바뀐 것 — 붙인 것 여섯

| 무엇 | 근거 |
|---|---|
| 수학·과학을 판단 자리에서 푼다 | /ask 가 3/10 → 두 판 연속 만점 |
| 예측자 900 → 16000 토큰 | Brier 0.369 → 0.299 |
| 같은 결과물 두 번 붙는 것 차단 | 222줄 중 12줄(5%)이 겹쳐 있었다 |
| 장부가 잘림을 적게 함 | "잘림 0건" 이 실은 "못 본다" 였다 |
| 웹이 자기 커밋을 알림 | 웹 배포 네 번이 다 "못 잰다" 였다 |
| **로키가 자기 한계를 안다** | "어디까지 돼?" 에 지어내고 있었다 |

## 재서 접은 것 넷 — **다시 하지 말 것**

- **싼 모델 둘 엮기(수학)**: 점수 0, 값 **+21%**. "비싼 호출 79% 아낌" 은 **횟수**였고 돈이 아니다.
- **엮기(예측)**: 0.301 vs 0.299 — 값 없음.
- **싼 자리를 gpt-5-mini 로**: 수학 +39 인데 **대화 자 6/8**(지금 flash 는 8/8).
- **판단 자리 상한 넷 올리기**(`seatBench` 2000·`askJudge` 6000·`head` 6000·`judge` 8000):
  **장부에 근거가 없다.** 09-27 부터 쌓이는 기록을 보고 다시 판단한다.

---

## 다음에 할 일 (순서대로)

1. **규칙 후보의 판정 이유를 저장한다.** `ruleLoop.ts` 의 `RuleTrial.reason` 이 어디에도 안 남아
   "왜 9% 만 채택되나" 를 못 읽는다. `learning_candidates` 에 칸을 하나 더하거나 `genesis_runs` 에 적는다.
   → 그 뒤 `rule_funnel.mts` 가 답을 준다.
2. **겹친 옛 줄 12개** — 지울지는 사장님 결정. 안 지워도 새로 겹치지 않는다.
3. **게이트 정답표** — `gate_look` 목록에서 잘못 켜진/꺼진 줄을 사장님이 짚어 주면 그게 정답표가 된다.
4. **두근도트 캐릭터 4종** — 만들어져 있고 앱에 안 올라갔다(옛것 내려받기 먼저).
5. **3D 조각 이어달리기** — 코드는 고쳤고 **끝까지 본 적이 없다.**

## 사장님 손가락이 필요한 것

- **배포**: 코드가 실제로 도는 순간
- **한도 숫자**: 지금 사장님 $14 + 개발 $7 = 3만원/30일
- **판정**: 결과물이 좋은지 나쁜지의 마지막 칸 — 이게 진화의 연료다(최근 30일 202건)
- **Play 내부 테스트**: 콘텐츠 등급·타겟층·데이터 보안 선언
- **카드 번호·계좌·비밀번호**: 내가 넣지 않는다. 사장님이 직접

---

## 09-28 · 채택률 9% 의 원인 — 찾았고, 한 줄 고쳤고, **예측을 잠갔다**

`rule_funnel.mts` 가 답을 줬다(처음엔 내가 `reason` 칸을 봐서 "저장 안 된다" 고 했는데,
판정 이유는 **`manager_note`** 에 있었다 — 오늘 세 번째로 없는 게 아니라 내가 안 본 것이었다).

| 어디서 죽나 | 개수 |
|---|---|
| ① 어긴 사례 3건 미만 (판정까지 갔다) | **24개 (41%)** |
| ① 제안자가 어긴 사례를 못 댔다 (판정 호출 안 함) | **22개 (38%)** |
| 통과 | 6개 (10%) |
| ② 어기고 실패한 사례가 적다 | 3개 (5%) |
| ③ 효과가 작다 (lift) | 3개 (5%) |

**79% 가 "아무도 안 어긴다" 로 죽는다. 통계 문(lift·p)에서 죽은 것은 5% 뿐이다.**
→ **문턱이 아니라 규칙이 너무 드문 것**이 병목이다. 문턱을 낮추면 안 된다.

그리고 **산수가 어긋나 있었다**: 제안자가 대는 3건은 **보여 준 사례(약 60%)** 안에서인데,
검증은 **보류분(약 40%)** 에서 다시 3건을 요구한다. 보여 준 데서 딱 3건이면 보류분 기대값이
2건이라 **거의 반드시 떨어진다.**

**고친 것**(`ruleLoop.ts` 의 `PROPOSE_SYS`): 그 셈을 제안자에게 알려 주고 **"여기서 6건 이상
대지 못할 만큼 드문 것이면 아직 규칙으로 낼 때가 아니다"** 를 넣었다. 문턱은 그대로 둔다.

**잠근 예측** (다음 고리가 돈 뒤 `rule_funnel.mts` 로 재고, 맞았는지 그대로 적는다):
- ① 로 죽는 비율 **79% → 50% 이하**
- 채택률 **10% → 20% 이상**
- 후보 수는 **줄어도 된다**(덜 내는 것이 목적이다). 판정 호출 수도 줄어야 한다.
- **틀릴 수 있는 쪽**: 제안자가 아예 후보를 못 내서 0개가 될 수 있다. 그러면 6건이 너무 높다는 뜻이고,
  4~5건으로 내린다. **"좋아졌다" 를 사후에 맞추지 않으려고 미리 적는다.**

재는 명령:
```
npx tsx engine/tools/rookery_env.mts engine/tools/rule_funnel.mts
```

---

## 09-28 · 자를 의심하는 자를 돌렸다 — 그리고 그 자도 틀려 있었다

```
npx tsx engine/tools/rookery_env.mts engine/tools/ruler_audit.mts
npx tsx engine/tools/rookery_env.mts engine/tools/ruler_audit.mts --selftest   # 사람이 손으로 찾은 것을 스스로 찾나 (전부 통과)
```

**자 30개 중 18개가 수상하다**고 나왔다 — 이빨 없는 자 5개, 한쪽만 막힌 자 3개,
떨어진 값이 전부 같은 상수인 자 3개, **한 번도 통과 못 한 자 1개**(`컴파일이_된다`),
같은 값이 통과도 실패도 한 자 6개.

**그런데 그 재료가 18일 전 것이었다.** 유니티 검사 기록은 **09-05 ~ 09-09** 에서 끝났고
그 뒤로 한 줄도 없다. 나는 그 목록을 **지금 상태**로 읽었다 — 죽은 시스템에 대한 경고였다.
오늘 여덟 번째 같은 모양이다(**자가 자기가 언제 것을 봤는지 안 말했다**).

**고친 것**: 이 자가 이제 맨 위에 재료의 날짜 창을 적고, 최근 것이 3일보다 오래되면
**"이건 지금 도는 판에 대한 경고가 아니다"** 를 같이 적는다.

**그래서 그 18개는 지금 고칠 거리가 아니다.** 유니티 쪽을 다시 돌리게 되면 그때 이 목록부터 본다.
남아 있는 진짜 의심거리는 `컴파일이_된다`(5번 재서 통과 0) 하나인데, 그것도 같은 창 안의 기록이다.

**자가 수상하다고 말할 때 물을 것 셋**
1. 재료가 **언제** 것인가 (이 자는 이제 스스로 적는다)
2. 그 자가 **아직 쓰이나** (안 쓰이면 고칠 거리가 아니다)
3. 이빨이 없다고 지우기 전에 **고장을 일부러 넣어 잡는지** 본다
   (`engine/tools/standing_checks_probe.mts`)
