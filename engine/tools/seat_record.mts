// 섞어 보내기 성적표 보기 (183회차). 돈 0.  npx tsx engine/tools/rookery_env.mts engine/tools/seat_record.mts [--days 30] [--pick]
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { seatRecords, fixCandidates, recordLine, pickFixSeat, MIN_N } = await import("../../src/lib/skills/appBuild/seats");
const db = createServiceClient();
const di = process.argv.indexOf("--days");
const days = di > 0 ? Number(process.argv[di + 1]) : 30;
const rec = await seatRecords(db, fixCandidates(), days);
console.log(`고치는 자리 성적표 (최근 ${days}일, 후보 ${fixCandidates().join(" · ")}, 채우기 기준 ${MIN_N}판)`);
for (const r of rec) console.log("  " + recordLine(r));
if (process.argv.includes("--pick")) {
  const counts: Record<string, number> = {};
  for (let i = 0; i < 20; i++) { const p = await pickFixSeat(db); counts[p.model] = (counts[p.model] ?? 0) + 1; if (i === 0) console.log(`지금 고르면: ${p.model} — ${p.why}`); }
  console.log("20번 골라 보면:", JSON.stringify(counts));
}
