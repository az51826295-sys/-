/** 이미 있는 지식 카드에서 "대화에서 알게 된 것" 을 회사 소개 칸에서 additional_context 로 옮긴다(218회차). 돈 0. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("employee_knowledge_profiles").select("company_employee_id, company_summary, additional_context");
let moved = 0;
for (const r of (data ?? []) as { company_employee_id: string; company_summary: string | null; additional_context: string | null }[]) {
  const s = r.company_summary ?? ""; const i = s.indexOf("대화에서 알게 된 것:");
  if (i < 0) continue;
  const head = s.slice(0, i).trim(); const learned = s.slice(i).trim();
  const { error } = await db.from("employee_knowledge_profiles").update({ company_summary: head, additional_context: r.additional_context ? r.additional_context + String.fromCharCode(10) + learned : learned }).eq("company_employee_id", r.company_employee_id);
  if (!error) moved++; else console.log("못 옮김", r.company_employee_id.slice(0, 8), error.message);
}
console.log(`옮김 ${moved}건 / 카드 ${data?.length ?? 0}개`);
