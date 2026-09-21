/** 4단계 본판 자 (2판) — **판을 열기 전에** 가짜 기록으로 끝까지 돌린다. 모델 0, 돈 0. */
const { judgeStage4, judgeStage4Runs, TARGET_ROUNDS, WHOLE_REWRITE } = await import("../../src/lib/genesis/stage4Verdict");
type FixRound = import("../../src/lib/genesis/stage4Verdict").FixRound;
type Stage4Run = import("../../src/lib/genesis/stage4Verdict").Stage4Run;
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const r = (o: Partial<FixRound> = {}): FixRound => ({ n: 1, request: "여기 점프가 안 돼", patched: true, changedLines: 5, totalLines: 300, asked: true, askedBy: "사람", broke: false, brokeBy: "사람", redone: false, ...o });
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
check("한 회차라도 절반 이상 바뀌면 실패", judgeStage4(run({ rounds: swap(2, { changedLines: 150, totalLines: 300 }) })).kind === "실패");
check("조각 경로를 안 탔으면 실패", judgeStage4(run({ rounds: swap(0, { patched: false }) })).kind === "실패");
check("되던 것이 깨지면 실패", judgeStage4(run({ rounds: swap(1, { broke: true }) })).kind === "실패");
check("사장님이 아직 아니라고 하면 실패", judgeStage4(run({ ownerSaidDone: false })).kind === "실패");
// **누적**: 회차마다 40% 씩 다섯 번이면 회차 기준은 통과하지만 원본은 통째로 바뀐다
check("**회차마다 40%씩이어도 누적이 절반을 넘으면 실패**", judgeStage4(run({ rounds: run().rounds.map((x, i) => r({ n: i + 1, changedLines: 120, totalLines: 300 })), cumulative: { changedLines: 280, originalLines: 300 } })).kind === "실패", judgeStage4(run({ rounds: run().rounds.map((x, i) => r({ n: i + 1, changedLines: 120, totalLines: 300 })), cumulative: { changedLines: 280, originalLines: 300 } })));
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

console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
