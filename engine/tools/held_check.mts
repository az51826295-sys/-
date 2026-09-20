const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("company_employees").select("id, company_id, employee_id, work_status, current_assignment_id").neq("work_status", "ready");
for (const e of data ?? []) {
  const { data: emp } = await db.from("employees").select("slug, name").eq("id", e.employee_id).maybeSingle();
  const { data: co } = await db.from("companies").select("name").eq("id", e.company_id).maybeSingle();
  console.log(`묶임: ${emp?.slug ?? e.employee_id.slice(0,8)} (${emp?.name}) · 회사 "${co?.name}" · 상태 ${e.work_status} · 붙은 업무 ${e.current_assignment_id ?? "없음"}`);
  const { data: last } = await db.from("assignments").select("title, status, created_at, updated_at").eq("company_employee_id", e.id).order("updated_at", { ascending: false }).limit(3);
  for (const a of last ?? []) console.log(`   최근: [${a.status}] ${a.title} · 갱신 ${a.updated_at}`);
}
