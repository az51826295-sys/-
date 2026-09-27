import { createServiceClient } from "../../src/lib/supabase/service";
const db = createServiceClient();
for (let i = 0; i < 60; i++) {
  const { data } = await db.from("assignments").select("id,title,status,created_at").order("created_at",{ascending:false}).limit(6);
  const rows = (data ?? []) as Record<string,string>[];
  const fresh = rows.filter((r) => Date.now() - Date.parse(r.created_at) < 15*60000);
  if (fresh.length >= 3) {
    console.log(`업무 ${fresh.length}개:`);
    for (const r of fresh) console.log(`  ${r.created_at.slice(11,19)} [${r.status}] ${String(r.title).slice(0,46)}`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 20000));
}
console.log("조각 업무가 아직 안 생겼다");
