/** 최근 결과물을 종류별로 — 실행 값·시간. recent_by_type [종류=video] [개수=5] */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const kind = process.argv[2] ?? "video", n = Number(process.argv[3] ?? 5);
const { data } = await db.from("deliverables").select("id, title, deliverable_type, created_at, work_execution_id, assignment_id").ilike("deliverable_type", `%${kind}%`).order("created_at", { ascending: false }).limit(n);
for (const d of (data ?? []) as Record<string, any>[]) {
  const { data: u } = await db.from("model_usage").select("cost_usd, model, purpose").eq("work_execution_id", d.work_execution_id ?? "");
  const usd = (u ?? []).reduce((a: number, r: any) => a + Number(r.cost_usd ?? 0), 0);
  const models = [...new Set((u ?? []).map((r: any) => r.model))].join(",");
  const { data: ex } = await db.from("work_executions").select("created_at, updated_at, status").eq("id", d.work_execution_id ?? "").maybeSingle();
  const min = ex ? Math.round((new Date(ex.updated_at).getTime() - new Date(ex.created_at).getTime()) / 60000) : null;
  console.log(String(d.created_at).slice(5, 16), String(d.id).slice(0, 8), d.deliverable_type, `$${usd.toFixed(3)}`, `${min}분`, models, "·", String(d.title).slice(0, 50));
}
