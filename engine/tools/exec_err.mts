const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("work_executions").select("id, status, current_step, attempt_number, error_code, error_message, created_at, updated_at").eq("assignment_id", process.argv[2]).order("created_at");
for (const r of (data ?? []) as Record<string, any>[]) console.log(String(r.id).slice(0, 8), r.status, r.current_step, `시도${r.attempt_number}`, String(r.created_at).slice(11, 19), "→", String(r.updated_at).slice(11, 19), r.error_code ?? "", (r.error_message ?? "").slice(0, 160));
