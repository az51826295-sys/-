// 예산 문지기 자 시험 (200회차) — 고장을 심어 잡히는지. 모델 0, 돈 0.
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { planFor, startRun, stopRun, activeRun, blockedByUnattended } = await import("../../src/lib/genesis/unattended");
const db = createServiceClient();
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

const before = await activeRun(db);
if (before && !before.run.stopped) { console.error("지금 도는 무인 판이 있다 — 시험을 안 한다"); process.exit(1); }

// 칸 실측 표기가 구조로 막히는가 (사장님 제약 1)
check("6시간 판은 칸 실측 아님", planFor(6).nodeMeasurement === false, planFor(6));
check("48시간 판도 칸 실측 아님", planFor(48).nodeMeasurement === false, planFor(48));
check("72시간 판만 칸 실측", planFor(72).nodeMeasurement === true, planFor(72));
check("상한이 시간에 비례", planFor(6).usdCap < planFor(48).usdCap, [planFor(6).usdCap, planFor(48).usdCap]);
check("첫 판들은 신뢰성만", planFor(6).tests === "신뢰성");

// 깃발이 실제로 로키를 막는가
const day = new Date(Date.now() + 9*3600_000).toISOString().slice(0,10);
await db.from("genesis_runs").delete().eq("kind","unattended").eq("run_date", day);
const opened = await startRun(db, planFor(6));
if (!opened.ok) { console.error("판을 못 열었다:", opened.why); process.exit(1); }
try {
  check("판이 도는 동안은 안 막힌다", (await blockedByUnattended(db)) === null, await blockedByUnattended(db));
  const a = (await activeRun(db))!;
  await stopRun(db, a.id, a.run, "시험: 하루 상한 도달");
  const why = await blockedByUnattended(db);
  check("멈추면 로키가 막힌다", typeof why === "string" && /멈춤/.test(why), why);
  check("막힌 이유가 전해진다", typeof why === "string" && /하루 상한/.test(why), why);
  // 시간이 다 된 판도 막혀야 한다
  await db.from("genesis_runs").update({ result: { ...planFor(6), startedAt: new Date(Date.now() - 7*3600_000).toISOString() } }).eq("id", a.id);
  const why2 = await blockedByUnattended(db);
  check("시간이 다 되면 막힌다", typeof why2 === "string" && /시간이 다/.test(why2), why2);
} finally {
  await db.from("genesis_runs").delete().eq("kind","unattended").eq("run_date", day);
  console.log("치움");
}
check("판이 없으면 평소대로 안 막힌다", (await blockedByUnattended(db)) === null);
console.log(`\n${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
