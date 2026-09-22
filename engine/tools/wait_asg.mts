const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const id = process.argv[process.argv.length - 1];
const { data } = await db.from("assignments").select("status, current_progress_step").eq("id", id).maybeSingle();
console.log(`${data?.status ?? "없음"} · ${data?.current_progress_step ?? "-"}`);
