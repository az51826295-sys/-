const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const u = (users?.users ?? []).find((x) => x.email === "demo-rookery@rookery.local")!;
const { data: co } = await db.from("companies").select("id").eq("owner_id", u.id).maybeSingle();
const cid = (co as any)?.id;
for (let i = 0; i < 20; i++) {
  const { data: ex } = await db.from("work_executions").select("status, current_step").eq("company_id", cid).order("created_at",{ascending:false}).limit(1).maybeSingle();
  const { data: d } = await db.from("deliverables").select("id").eq("company_id", cid);
  console.log(`${i*25}s ${(ex as any)?.status ?? "-"} ${(ex as any)?.current_step ?? ""} · 결과물 ${(d ?? []).length}`);
  if ((d ?? []).length) { console.log("나왔다"); break; }
  await new Promise(r => setTimeout(r, 25000));
}
