/**
 * **심판이 죽는 것을 심어서 잰다** (205회차 09-23, 사장님: *"tsc 통과는 시험이 아닙니다"*).
 * 한 번 죽으면 다시 불러 이어 가는가 · 두 번 죽으면 멈추는가 · 그 사실이 결과물 말에 남는가.
 * 모델 0 · 돈 0.
 */
const { judgeTwice, notFinished } = await import("../../src/lib/skills/appBuild/loop");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

const 판정 = { met: [], unmet: [], unknown: [], broken: [], toPerson: "봤다", toWorker: "", nextActions: [], done: true };
/** N 번 죽고 그다음엔 사는 가짜 심판. */
const 가짜심판 = (죽을횟수: number) => { let n = 0; return { name: "fake", model: "fake",
  async generateStructuredOutput() { if (n++ < 죽을횟수) throw new Error("MODEL_OUTPUT_OFF_SCHEMA: 심어 놓은 고장"); return { output: 판정, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, model: "fake" }; } }; };
const 인자 = { ask: "x", criteria: [], facts: { ran: true, ms: 0, consoleErrors: [], blankAtStart: false, movesByItself: false, changesOnTap: false, changesOnKeys: false, text: "", shots: { start: "", mid: "", after: "" }, did: [] }, mobile: false, round: 3 };

// ① 안 죽으면 그냥 본다
{
  const r = await judgeTwice(가짜심판(0) as never, 인자 as never);
  check("안 죽으면 한 번에 본다", r.retried === 0, r.retried);
}
// ② 한 번 죽으면 **다시 불러 이어 간다**
{
  const r = await judgeTwice(가짜심판(1) as never, 인자 as never);
  check("**한 번 죽으면 다시 불러 이어 간다**", r.verdict.toPerson === "봤다", r);
  check("**다시 부른 것이 숫자로 남는다**", r.retried === 1, r.retried);
}
// ③ 두 번 죽으면 멈춘다
{
  let 던졌나 = false;
  try { await judgeTwice(가짜심판(2) as never, 인자 as never); } catch { 던졌나 = true; }
  check("**두 번 죽으면 멈춘다**", 던졌나);
}
// ④ 끝까지 못 본 판이 사람 말로 남는가
{
  check("심판이 두 번 죽은 판", notFinished("judge_failed", 2)?.말?.includes("심판자가 두 번 다 못 봐서") === true, notFinished("judge_failed", 2));
  check("바퀴를 다 쓴 판도 남는다", notFinished("rounds", 4)?.말?.includes("바퀴를 다 써서") === true, notFinished("rounds", 4));
  check("끝까지 본 판은 안 남는다", notFinished("done", 3) === null, notFinished("done", 3));
  // **다시 불러 살아난 판도 남아야 한다** — 조용히 넘어가면 심판이 자주 죽는지를 못 본다(사장님 09-23)
  const 살아남 = notFinished("done", 3, 1);
  check("**다시 불러 살아난 판도 남는다**", 살아남?.심판재시도 === 1, 살아남);
}
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
