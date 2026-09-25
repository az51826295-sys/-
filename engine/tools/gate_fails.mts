const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("work_executions").select("id, created_at, status, error_code, error_message, assignment_id").ilike("error_message", "%사장님 확인을 기다린다%").gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString());
for (const r of (data ?? []) as Record<string, any>[]) console.log(String(r.created_at).slice(5, 16), String(r.id).slice(0, 8), r.status, r.error_code, "| 업무", String(r.assignment_id).slice(0, 8));
