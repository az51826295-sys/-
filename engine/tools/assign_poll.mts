// 주문 하나의 상태·최신 실행 단계를 한 줄로. Monitor 가 45초마다 부른다.
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const id = process.argv[2];
const { data: a } = await db.from("assignments").select("status, current_progress_step").eq("id", id).maybeSingle();
const { data: ex } = await db.from("work_executions").select("id, status, current_step, attempt_number, error_message").eq("assignment_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
const { count } = await db.from("deliverables").select("id", { count: "exact", head: true }).eq("assignment_id", id);
console.log(`주문 ${a?.status ?? "?"}/${a?.current_progress_step ?? "?"} · 실행 ${ex ? `${String(ex.id).slice(0, 8)} ${ex.status} ${ex.current_step} 시도${ex.attempt_number ?? 1}${ex.error_message ? " 오류:" + String(ex.error_message).slice(0, 60) : ""}` : "없음"} · 결과물 ${count ?? 0}`);
