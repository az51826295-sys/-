/** 광고(7ff661ec)·분석(7a0594c1) 두 업무의 상태 한 줄씩. 끝났으면 줄 끝에 "끝". */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: rows } = await db.from("assignments").select("id, status, current_progress_step").gte("created_at", "2026-09-25").limit(200);
for (const [name, pre] of [["광고", "7ff661ec"], ["분석", "7a0594c1"]] as const) {
  const a = ((rows ?? []) as { id: string; status: string; current_progress_step: string }[]).find((r) => r.id.startsWith(pre));
  if (!a) { console.log(`${name} 없음 끝`); continue; }
  const { data: ex } = await db.from("work_executions").select("status, current_step, error_message").eq("assignment_id", a.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { count } = await db.from("deliverables").select("id", { count: "exact", head: true }).eq("assignment_id", a.id);
  const done = ["completed", "failed", "cancelled", "submitted"].includes(a.status) || ["completed", "failed", "cancelled"].includes(ex?.status ?? "");
  console.log(`${name} ${a.status}/${a.current_progress_step} · 실행 ${ex?.status ?? "-"} ${ex?.current_step ?? ""}${ex?.error_message ? " 오류:" + String(ex.error_message).slice(0, 60) : ""} · 결과물 ${count ?? 0}${done ? " 끝" : ""}`);
}
