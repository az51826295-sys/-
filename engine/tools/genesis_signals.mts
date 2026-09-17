/** 자가진화에 쓸 수 있는 신호 (100회차 09-14): 대화 학습 저장고, 결과물 자동 판정. npx tsx engine/tools/rookery_env.mts engine/tools/genesis_signals.mts */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const ok = await svc.from("organization_knowledge").select("*", { count: "exact", head: true });
console.log("organization_knowledge rows:", ok.error ? "ERR " + ok.error.message : ok.count);
const { data: sample } = await svc.from("organization_knowledge").select("*").order("created_at", { ascending: false }).limit(5);
for (const r of (sample ?? []) as unknown as Record<string, unknown>[]) console.log(" -", JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !/id$|_at$/.test(k)).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 140) : v]))));
const cols = await svc.from("deliverables").select("*").limit(1);
const keys = Object.keys((cols.data?.[0] ?? {}) as object);
console.log("deliverables columns:", keys.join(", "));
const verdictCol = keys.find((k) => /verdict|checks|status/.test(k));
if (verdictCol) {
  const { data: all } = await svc.from("deliverables").select(keys.filter((k) => /verdict|status|checks/.test(k)).join(","));
  const tally: Record<string, number> = {};
  for (const r of (all ?? []) as unknown as Record<string, unknown>[]) for (const k of Object.keys(r)) { const v = r[k]; const key = `${k}=${typeof v === "object" ? (v ? "obj" : "null") : String(v)}`; if (key.length < 60) tally[key] = (tally[key] ?? 0) + 1; }
  console.log("deliverable signal tally:", JSON.stringify(tally));
}
const pc = await svc.from("work_predictions").select("*").limit(1);
console.log("work_predictions columns:", Object.keys((pc.data?.[0] ?? {}) as object).join(", "));
