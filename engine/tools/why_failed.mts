const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const asg = process.argv[process.argv.length - 1];
const { data: e } = await db.from("work_executions").select("*").eq("assignment_id", asg).order("created_at", { ascending: false });
for (const x of (e ?? []) as Record<string, unknown>[]) {
  console.log(`실행 ${String(x.id).slice(0,8)} · ${x.status} · ${x.current_step} · 시도 ${x.attempt_number}`);
  for (const k of ["error_message", "error", "failure_reason", "last_error", "notes", "result_json"]) {
    if (x[k]) console.log(`  ${k}: ${JSON.stringify(x[k]).slice(0, 400)}`);
  }
}
const { data: a } = await db.from("assignments").select("status, current_progress_step, updated_at").eq("id", asg).maybeSingle();
console.log(`일: ${JSON.stringify(a)}`);
