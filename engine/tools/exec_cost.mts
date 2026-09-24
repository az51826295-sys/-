const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: ex } = await db.from("work_executions").select("id").eq("assignment_id", process.argv[2]).order("created_at", { ascending: false }).limit(1).maybeSingle();
const { data } = await db.from("model_usage").select("model, purpose, cost_usd, created_at").eq("work_execution_id", ex!.id).order("created_at");
let usd = 0; const t: Record<string, number> = {};
for (const r of (data ?? []) as Record<string, any>[]) { usd += Number(r.cost_usd ?? 0); t[r.purpose] = (t[r.purpose] ?? 0) + 1; }
console.log(`호출 ${data?.length ?? 0}건 · $${usd.toFixed(3)} · ${Object.entries(t).map(([k, v]) => `${k} ${v}`).join(" · ")} · 첫 ${String(data?.[0]?.created_at ?? "").slice(11, 16)} 끝 ${String(data?.at(-1)?.created_at ?? "").slice(11, 16)} UTC`);
