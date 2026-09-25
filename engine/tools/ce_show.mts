const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const CO = "5925c03a-557f-46d7-8589-7388b769df40";
const { data } = await db.from("company_employees").select("*, employees(slug)").eq("company_id", CO);
for (const r of (data ?? []) as Record<string, any>[]) console.log(r.employees?.slug, "|", r.onboarding_status, "|", r.work_status, "| 키:", Object.keys(r).filter((k) => r[k] != null && !["id","company_id","employee_id","created_at","updated_at","employees"].includes(k)).map((k) => `${k}=${JSON.stringify(r[k]).slice(0, 60)}`).join(" "));
