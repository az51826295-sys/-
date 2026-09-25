const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const CO = "5925c03a-557f-46d7-8589-7388b769df40";
const { data } = await db.from("company_employees").select("id, company_summary, customer_summary, problem_summary, employees(slug)").eq("company_id", CO);
for (const r of (data ?? []) as Record<string, any>[]) if (["deck", "ana"].includes(r.employees?.slug)) console.log(r.employees?.slug, "| 회사:", String(r.company_summary ?? "").slice(0, 160), "| 고객:", String(r.customer_summary ?? "").slice(0, 80), "| 문제:", String(r.problem_summary ?? "").slice(0, 80));
