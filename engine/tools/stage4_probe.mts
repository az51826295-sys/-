/** 4단계 본판 자 (2판) — **판을 열기 전에** 가짜 기록으로 끝까지 돌린다. 모델 0, 돈 0. */
const { judgeStage4, judgeStage4Runs, TARGET_ROUNDS, WHOLE_REWRITE } = await import("../../src/lib/genesis/stage4Verdict");
type FixRound = import("../../src/lib/genesis/stage4Verdict").FixRound;
type Stage4Run = import("../../src/lib/genesis/stage4Verdict").Stage4Run;
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
// 회차마다 고친 시각과 확인 시각을 순서대로 준다(5판: 다음 회차는 앞 회차 확인 뒤에만).
const t = (n: number, kind: "fix" | "ok") => new Date(Date.UTC(2026, 8, 22, 9 + n * 2, kind === "fix" ? 0 : 30)).toISOString();
const r = (o: Partial<FixRound> = {}): FixRound => ({ n: 1, request: "여기 점프가 안 돼", patched: true, changedLines: 5, totalLines: 300, asked: true, askedBy: "사람", broke: false, brokeBy: "사람", redone: false, fixedAt: t(o.n ?? 1, "fix"), confirmedAt: t(o.n ?? 1, "ok"), ...o });
const run = (o: Partial<Stage4Run> = {}): Stage4Run => ({ rounds: Array.from({ length: 5 }, (_, i) => r({ n: i + 1 })), cumulative: { changedLines: 25, originalLines: 300 }, ownerSaidDone: true, ...o });
const swap = (i: number, o: Partial<FixRound>) => { const rs = run().rounds.slice(); rs[i] = r({ n: i + 1, ...o }); return rs; };

check("**다시 한 회차가 있으면 무효**(안 된 회차를 다시 해 통과로 못 만든다)", judgeStage4(run({ rounds: swap(2, { redone: true }) })).kind === "무효", judgeStage4(run({ rounds: swap(2, { redone: true }) })));
check("고침이 모자라면 못 잼", judgeStage4(run({ rounds: run().rounds.slice(0, 3) })).kind === "못 잼");
check("사장님 말이 없으면 못 잼", judgeStage4(run({ ownerSaidDone: null })).kind === "못 잼");
check("누적 diff 가 없으면 못 잼", judgeStage4(run({ cumulative: null })).kind === "못 잼");
check("**요청 원문이 없으면 못 잼**", judgeStage4(run({ rounds: swap(1, { request: "  " }) })).kind === "못 잼");
check("**기계만 봤으면 못 잼**(2·3번은 사람 칸)", judgeStage4(run({ rounds: swap(3, { brokeBy: "기계" }) })).kind === "못 잼", judgeStage4(run({ rounds: swap(3, { brokeBy: "기계" }) })));
check("안 본 회차가 있으면 못 잼", judgeStage4(run({ rounds: swap(4, { broke: null }) })).kind === "못 잼");
check("**다 갖추면 통과**", judgeStage4(run()).kind === "통과", judgeStage4(run()));
// 4판에서 분모가 두 배가 됐다. 옛 숫자(150/300)는 이제 0.25 라 절반이 아니다 — **숫자를 새 셈에 맞춘다.**
check("한 회차라도 절반 이상 바뀌면 실패", judgeStage4(run({ rounds: swap(2, { changedLines: 300, totalLines: 300 }) })).kind === "실패");
check("조각 경로를 안 탔으면 실패", judgeStage4(run({ rounds: swap(0, { patched: false }) })).kind === "실패");
check("되던 것이 깨지면 실패", judgeStage4(run({ rounds: swap(1, { broke: true }) })).kind === "실패");
check("사장님이 아직 아니라고 하면 실패", judgeStage4(run({ ownerSaidDone: false })).kind === "실패");
// **누적**: 회차마다 40% 씩 다섯 번이면 회차 기준은 통과하지만 원본은 통째로 바뀐다
check("**회차마다 40%씩이어도 누적이 절반을 넘으면 실패**", judgeStage4(run({ rounds: run().rounds.map((x, i) => r({ n: i + 1, changedLines: 240, totalLines: 300 })), cumulative: { changedLines: 350, originalLines: 300 } })).kind === "실패", judgeStage4(run({ rounds: run().rounds.map((x, i) => r({ n: i + 1, changedLines: 240, totalLines: 300 })), cumulative: { changedLines: 350, originalLines: 300 } })));
check("누적이 절반 미만이면 통과", judgeStage4(run({ cumulative: { changedLines: 149, originalLines: 300 } })).kind === "통과");
check("잠근 값이 그대로다", TARGET_ROUNDS === 5 && WHOLE_REWRITE === 0.5);
check("실패 이유가 여럿이면 다 적는다", (judgeStage4(run({ ownerSaidDone: false, rounds: swap(0, { patched: false, broke: true }) })) as { why: string }).why.split(" · ").length === 3);
// ── **연 판을 전부 적는다** (3판, 사장님): 통과할 때까지 판을 열고 성공한 하나만 남기는 길을 막는다
{
  const pass = run();
  const fail = run({ ownerSaidDone: false });
  const invalid = run({ rounds: swap(2, { redone: true }) });
  const unmeasured = run({ rounds: swap(1, { broke: null }) });
  const led = judgeStage4Runs([invalid, fail, unmeasured, pass]);
  check("**4판 중 1판 통과로 적힌다**(무효·실패도 안 지운다)", led.line.startsWith("4판 중 1판 통과") && led.void_ === 1 && led.failed === 1 && led.unmeasured === 1, led);
  check("한 판만 열고 통과하면 1판 중 1판", judgeStage4Runs([pass]).line.startsWith("1판 중 1판 통과"));
  check("**못 잼 회차가 있는 판은 통과가 될 수 없다**", (judgeStage4(unmeasured) as { why: string }).why.includes("통과가 될 수 없다"), judgeStage4(unmeasured));
}

// ── **분모는 원본의 두 배** (4판): 통째로 다시 쓰기가 정확히 1.0 이 되는지
{
  const whole = run({ rounds: swap(0, { changedLines: 400, totalLines: 200 }) });      // 200줄 전부 교체 = 400
  check("**통째로 다시 쓰기는 1.0 → 실패**", judgeStage4(whole).kind === "실패", judgeStage4(whole));
  const half = run({ rounds: swap(0, { changedLines: 200, totalLines: 200 }) });        // 100줄 교체 = 200 → 0.5
  check("**파일의 절반을 다시 쓰면 실패**(0.5)", judgeStage4(half).kind === "실패");
  const under = run({ rounds: swap(0, { changedLines: 198, totalLines: 200 }) });       // 99줄 교체 → 0.495
  check("절반 바로 아래는 통과", judgeStage4(under).kind === "통과");
  const added = run({ rounds: swap(0, { changedLines: 100, totalLines: 200 }) });       // 순수 추가 100줄 → 0.25
  check("**덧붙이기 100줄은 통과**(옛 셈이면 걸렸다)", judgeStage4(added).kind === "통과");
  const cumWhole = run({ cumulative: { changedLines: 400, originalLines: 200 } });
  check("누적도 통째로면 실패", judgeStage4(cumWhole).kind === "실패");
}

// ── **회차는 어디서 끝나나** (5판, 사장님 09-22): 확인까지다. 다만 순서를 지켜야 한다.
{
  const rs = run().rounds.slice();
  rs[2] = r({ n: 3, confirmedAt: null });
  check("**확인 안 된 회차를 뒤에 두고 앞서 가면 무효**", judgeStage4(run({ rounds: rs })).kind === "무효", judgeStage4(run({ rounds: rs })));
  const rs2 = run().rounds.slice();
  rs2[3] = r({ n: 4, fixedAt: t(1, "fix") });   // 4번째 고침이 3번째 확인보다 먼저
  check("**순서가 어긋나면 무효**", judgeStage4(run({ rounds: rs2 })).kind === "무효", judgeStage4(run({ rounds: rs2 })));
  check("아침에 고치고 저녁에 확인해도 된다(같은 회차다)", judgeStage4(run()).kind === "통과");
}

console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
