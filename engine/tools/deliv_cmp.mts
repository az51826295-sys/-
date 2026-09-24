const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
for (const pre of process.argv.slice(2)) {
  const { data: rows } = await db.from("deliverables").select("*").gte("created_at", "2026-09-01").order("created_at", { ascending: false }).limit(400);
  const r = ((rows ?? []) as Record<string, any>[]).find((x) => String(x.id).startsWith(pre));
  if (!r) { console.log(pre, "없음"); continue; }
  const c = (r.content_json ?? {}) as Record<string, any>;
  console.log(`--- ${pre} · status=${r.status} · type=${r.deliverable_type ?? r.type} · 일=${String(r.assignment_id).slice(0, 8)} · 회사=${String(r.company_id).slice(0, 8)} · 직원=${String(r.company_employee_id ?? "").slice(0, 8)}`);
  console.log("  행 키:", Object.keys(r).filter((k) => r[k] != null).join(","));
  console.log("  content 키:", Object.keys(c).join(","));
  console.log("  target:", c.target, "· files:", Array.isArray(c.files) ? c.files.length + "개 " + c.files.map((f: any) => f.path).join(",") : typeof c.files, "· criteria:", c.criteria?.length, "· title:", c.title);
}
