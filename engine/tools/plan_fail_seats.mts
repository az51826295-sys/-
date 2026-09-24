// 모양 고장(OFF_SCHEMA·UNPARSEABLE·TRUNCATED)으로 죽은 실행 — 어느 단계·몇 번째 시도·어느 자리. 최근 14일.
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const since = new Date(Date.now() - 14 * 864e5).toISOString();
const { data, error } = await db.from("work_executions")
  .select("id, created_at, current_step, error_message, attempt_number, metrics_json")
  .gte("created_at", since).eq("status", "failed").ilike("error_message", "MODEL_OUTPUT_%")
  .order("created_at", { ascending: false });
if (error) console.log("오류:", error.message);
for (const r of (data ?? []) as Record<string, any>[]) {
  const m = (r.metrics_json ?? {}) as Record<string, unknown>;
  const keys = Object.keys(m).join(",");
  console.log(String(r.created_at).slice(5, 16), String(r.id).slice(0, 8), r.current_step, `시도${r.attempt_number ?? 1}`, String(r.error_message ?? "").slice(0, 60), "| metrics:", keys || "(없음)", m.seat ? JSON.stringify(m.seat).slice(0, 120) : "");
}
console.log("건수:", data?.length ?? 0);
// 같은 시각대 원장: 실패 실행에 붙은 호출이 있나(실패한 호출은 장부에 안 남는지 확인)
const ids = ((data ?? []) as { id: string }[]).map((r) => r.id).slice(0, 12);
if (ids.length) {
  const { data: led } = await db.from("cost_ledger").select("work_execution_id, model, label, created_at").in("work_execution_id", ids);
  console.log("장부에 남은 호출(실패 실행에 붙은 것):", (led ?? []).length);
  for (const l of (led ?? []) as Record<string, any>[]) console.log("  ", String(l.work_execution_id).slice(0, 8), l.model, l.label, String(l.created_at).slice(11, 19));
}
