/** 자가진화 현황 (100회차 09-14) — 실서버 DB 에서 센다. npx tsx engine/tools/rookery_env.mts engine/tools/genesis_status.mts */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
async function count(table: string, filter?: (q: any) => any) {
  let q = svc.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  return error ? `ERR ${error.message.slice(0, 60)}` : n;
}
const rows: [string, unknown][] = [
  ["work_predictions (예측)", await count("work_predictions")],
  ["deliverables (결과물)", await count("deliverables")],
  ["deliverable_reviews (판정)", await count("deliverable_reviews")],
  ["  └ approved", await count("deliverable_reviews", (q) => q.eq("decision", "approved"))],
  ["  └ needs_changes", await count("deliverable_reviews", (q) => q.eq("decision", "needs_changes"))],
  ["work_prediction_scores (채점된 예측)", await count("work_prediction_scores")],
  ["prediction_genomes (진화 기록)", await count("prediction_genomes")],
  ["conversations (대화)", await count("conversations")],
  ["conversation_messages (대화 줄)", await count("conversation_messages")],
  ["model_usage (API 호출)", await count("model_usage")],
];
for (const t of ["employee_lessons", "lessons", "memories", "employee_memories", "knowledge_cards", "learned_rules"]) rows.push([`${t}?`, await count(t)]);
for (const [k, v] of rows) console.log(String(k).padEnd(40), v);
const { data: last } = await svc.from("prediction_genomes").select("*").order("created_at", { ascending: false }).limit(3);
console.log("최근 진화 기록:", JSON.stringify(last ?? []).slice(0, 600));
const { data: lr } = await svc.from("deliverable_reviews").select("decision, created_at").order("created_at", { ascending: false }).limit(5);
console.log("최근 판정:", JSON.stringify(lr ?? []));
