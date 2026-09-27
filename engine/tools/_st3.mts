import { createServiceClient } from "../../src/lib/supabase/service";
const db = createServiceClient();
const { data: x } = await db.from("work_executions").select("status,current_step,created_at,error_message").order("created_at",{ascending:false}).limit(3);
for (const r of (x ?? []) as Record<string,string>[]) {
  const m = Math.round((Date.now() - Date.parse(r.created_at)) / 60000);
  console.log(`${r.created_at.slice(11,19)} (${m}분) ${r.status} ${r.current_step} ${r.error_message ? "ERR:"+String(r.error_message).slice(0,90) : ""}`);
}
const { data: a } = await db.from("assignments").select("title,status,created_at").order("created_at",{ascending:false}).limit(4);
console.log("업무:");
for (const r of (a ?? []) as Record<string,string>[]) console.log(`  ${r.created_at.slice(11,19)} [${r.status}] ${String(r.title).slice(0,40)}`);
