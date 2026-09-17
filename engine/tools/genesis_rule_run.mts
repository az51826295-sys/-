/**
 * 검증된 규칙 고리 — 실제 모델로 지금 한 번 (사장님 09-14 "켜"). 기록까지 한다(dryRun 아님).
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/rookery_env.mts engine/tools/genesis_rule_run.mts
 */
const { runRuleLoop } = await import("../../src/lib/genesis/ruleLoop");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { createServiceClient } = await import("../../src/lib/supabase/service");

const db = createServiceClient();
const ai = defaultProviders().ai;
console.log("모델:", ai.name, "· 지출 승인:", process.env.GENESIS_SPEND === "i-approve");
const t0 = Date.now();
const { data: cos } = await db.from("companies").select("id, name");
for (const co of (cos ?? []) as { id: string; name: string | null }[]) {
  const r = await runRuleLoop(db, ai, co.id, { forceRecheck: process.argv.includes("--recheck"), maxRules: process.argv.includes("--recheck") ? 0 : 3 });
  for (const rc of r.rechecks) console.log(`- [재검증 ${rc.keep ? "유지" : "내림"}] ${rc.title}
    표 a=${rc.counts.a} b=${rc.counts.b} c=${rc.counts.c} d=${rc.counts.d} (판정 ${rc.judged}건, 보류 ${rc.holdoutBefore}→${rc.holdoutNow}) · ${rc.reason}`);
  console.log(`\n== ${co.name} · 호출 ${r.calls} · 채택 ${r.adopted} · 기록 ${r.wrote}${r.skipped ? ` · 건너뜀: ${r.skipped}` : ""}`);
  for (const t of r.trials) {
    console.log(`- [${t.adopt ? "채택" : "기각"}] ${t.title}\n    규칙: ${t.rule}\n    판별: ${t.violation_test}\n    표 a=${t.counts.a} b=${t.counts.b} c=${t.counts.c} d=${t.counts.d} (판정 ${t.judged}건) · ${t.reason}`);
  }
}
console.log(`\n소요 ${((Date.now() - t0) / 1000).toFixed(0)}초`);
