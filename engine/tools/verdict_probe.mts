/**
 * **잠그기 전 가짜 판 판정** (203회차 09-21, 사장님 규칙).
 * 가짜 판 기록을 먹여 판정을 끝까지 돌린다. **모든 조건이 값을 내야** 잠근 기준이 쓸 수 있는 기준이다.
 * 모델 0, 돈 0, DB 안 건드림.
 *   npx tsx engine/tools/verdict_probe.mts
 */
const { judgeRun } = await import("../../src/lib/genesis/unattendedVerdict");
type Run = import("../../src/lib/genesis/unattended").UnattendedRun;
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got, null, 0)); };

const base = (o: Partial<Run> & { tally?: Run["tally"] }): Run => ({
  tests: "신뢰성", startedAt: new Date(Date.now() - 3600_000).toISOString(), hours: 6, usdCap: 2, usdPerDayCap: 5,
  maxSameFailStreak: 3, humanReviewCap: 3, stallMinutes: 30, nodeMeasurement: false, stopped: true, ...o,
});
const tally = (minutes: number, workMinutes: number, maxGapSec = 62) => ({ minutes, workMinutes, maxUnposted: 0, maxStall: 0, maxGapSec, firstAt: new Date().toISOString(), lastAt: new Date().toISOString() });
const ok0 = { userTurns: 0, attested: { 개입있었나: false, 배포했나: false } };

// ① 기본 시나리오 — 상한에 닿아 1시간 만에 멈춤
const capHit = base({ stopReason: "전체 상한 $2 도달($2.004)", tally: tally(61, 58), seen: { at: "", usd: 2, usdToday: 2, failStreak: 0, needHuman: 0, hasWork: true, stallMin: 1, unposted: 0 } as Run["seen"] });
const r1 = judgeRun(capHit, ok0);
console.log("\n① 상한 도달(기본 시나리오)");
for (const c of r1.conds) console.log(`   ${c.verdict === "통과" ? "통과 " : c.verdict} ${c.n}. ${c.name} — ${c.value}`);
check("① 모든 조건이 값을 낸다", r1.conds.every((c) => c.verdict !== "못 잼"), r1.conds.filter((c) => c.verdict === "못 잼"));
check("① 판정은 성공", r1.overall === "성공", r1.overall);
check("① 분모가 창(360분)이 아니라 본 분(61분)", /61분/.test(r1.conds[1].value), r1.conds[1].value);

// ② 1회차 재현 — 부하 없이 6시간
const idle = base({ stopReason: "계획한 시간이 다 됐다", tally: tally(360, 4), seen: { at: "", usd: 0.03, usdToday: 0.03, failStreak: 0, needHuman: 0, hasWork: false, stallMin: 0, unposted: 0 } as Run["seen"] });
const r2 = judgeRun(idle, ok0);
check("② 부하 없는 6시간은 실패", r2.overall === "실패" && r2.conds[1].verdict === "실패", r2.conds[1]);

// ③ 문지기가 죽은 판 — 공백 9분
const dead = base({ stopReason: "전체 상한 $2 도달", tally: tally(50, 48, 540), seen: { at: "", usd: 2, usdToday: 2, failStreak: 0, needHuman: 0, hasWork: true, stallMin: 0, unposted: 0 } as Run["seen"] });
check("③ 신호 공백 9분은 실패", judgeRun(dead, ok0).conds[0].verdict === "실패", judgeRun(dead, ok0).conds[0]);

// ④ 결과가 안 붙은 판
const unposted = base({ stopReason: "전체 상한 $2 도달", tally: tally(61, 58), seen: { at: "", usd: 2, usdToday: 2, failStreak: 0, needHuman: 0, hasWork: true, stallMin: 0, unposted: 3 } as Run["seen"] });
check("④ 못 붙은 산출물 3개는 실패", judgeRun(unposted, ok0).conds[3].verdict === "실패");

// ⑤ **못 잼이 못 잼으로 나오는가** — 누적 칸이 없던 옛 기록
const old = base({ stopReason: "전체 상한 $2 도달" });
const r5 = judgeRun(old, { userTurns: null });
check("⑤ 안 잰 것은 '통과' 가 아니라 '못 잼'", r5.overall === "못 잼" && r5.conds.filter((c) => c.verdict === "못 잼").length >= 3, r5.conds.map((c) => `${c.n}:${c.verdict}`));

// ⑥ 개입은 반쪽만 기계다 — 사람 증언이 없으면 통과로 적지 않는다
const r6 = judgeRun(capHit, { userTurns: 0 });
check("⑥ 배포 여부 증언이 없으면 개입 조건은 '못 잼'", r6.conds[4].verdict === "못 잼", r6.conds[4]);
check("⑥ 사람이 로키에 말을 걸었으면 실패", judgeRun(capHit, { userTurns: 2, attested: { 개입있었나: false, 배포했나: false } }).conds[4].verdict === "실패");

// ⑦ 표에 없는 이유로 끝나면 고르지 않고 '못 잼'
check("⑦ 표에 없는 끝맺음은 '못 잼'", judgeRun(base({ stopReason: "그냥 껐다", tally: tally(61, 58), seen: { at: "", usd: 0, usdToday: 0, failStreak: 0, needHuman: 0, hasWork: true, unposted: 0 } as Run["seen"] }), ok0).conds[2].verdict === "못 잼");

console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
