/**
 * 2단계 남은 조각이 얼마나 찼나 — 섞어 보내기 채점표. **읽기만 한다.**
 * 자는 `src/lib/genesis/stage2Verdict.ts` 에 판 쌓기 전에 잠갔다(204회차 09-21).
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { seatRecords, headWins, fixCandidates } = await import("../../src/lib/skills/appBuild/seats");
const { judgeStage2, stage2Done } = await import("../../src/lib/genesis/stage2Verdict");
const db = createServiceClient();

// 채점표가 세는 것은 **고치는 판**뿐이다 — `content_json.seats.fixMode` 가 있는 산출물.
const wins = await headWins(db, 60);
console.log(`섞어 보내기 채점표 (60일): best ${wins.best.ok}/${wins.best.n} · explore ${wins.explore.ok}/${wins.explore.n} · fill ${wins.fill.ok}/${wins.fill.n}`);
const v = judgeStage2(wins);
console.log(`판정: **${v.kind}** — ${v.why}`);
console.log(`잰 것은 ${stage2Done(v) ? "끝났다" : "**아직 안 끝났다**"}`);

// 재료가 얼마나 있나 — 고칠 수 있는 산출물(app_build) 과 그중 실제로 고쳐진 판
const since = new Date(Date.now() - 60 * 86400_000).toISOString();
const { count: builds } = await db.from("deliverables").select("id", { count: "exact", head: true }).eq("deliverable_type", "app_build").gte("created_at", since);
const { count: fixed } = await db.from("deliverables").select("id", { count: "exact", head: true }).eq("deliverable_type", "app_build").gte("created_at", since).not("content_json->seats->>fixMode", "is", null);
console.log(`\n재료: 만든 판 ${builds}개 · 그중 **고친 판 ${fixed}개**`);
console.log(`후보 자리: ${fixCandidates().join(", ")}`);
const recs = await seatRecords(db, fixCandidates(), 60);
for (const r of recs) console.log(`  ${r.model.padEnd(20)} n=${r.n} · 심판 본 것 ${r.judged} · 통과 ${r.ok} · 되돌림 ${r.sentBack} · $${r.usd.toFixed(3)}`);
