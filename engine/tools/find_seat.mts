const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name").eq("name", "권혁수");
const co = (cos ?? [])[0];
console.log(`회사: ${co?.name} ${co?.id}`);
const { data: emp } = await db.from("company_employees").select("id, status, employee:employees(name, role)").eq("company_id", co!.id as string);
for (const e of (emp ?? []) as unknown as {id:string;status:string;employee:{name:string;role:string}|null}[]) console.log(`  ${e.id} · ${e.status} · ${e.employee?.name} (${e.employee?.role})`);
