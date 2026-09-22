const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: co } = await db.from("companies").select("id, name, owner_id").in("id", ["00add05a-e81d-4e04-9980-34bb412a8780"]);
for (const c of co ?? []) console.log(`데모 회사 ${c.name} · 주인 ${c.owner_id}`);
const { data: all } = await db.from("companies").select("id, name, owner_id").order("created_at");
console.log(`회사 ${all?.length ?? 0}개:`);
for (const c of all ?? []) console.log(`  ${c.id.slice(0,8)} ${c.name} · 주인 ${String(c.owner_id).slice(0,8)}`);
const { data: d } = await db.from("deliverables").select("company_id").eq("id","5f46773e-1cc0-4d5d-a231-f4243244746d").maybeSingle();
console.log(`이 결과물의 회사: ${d?.company_id}`);
