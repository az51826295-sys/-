const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const CO = "5925c03a-557f-46d7-8589-7388b769df40";
const { data } = await db.from("companies").select("spend_limit_usd, spend_window_days, name").eq("id", CO).maybeSingle();
console.log("한도:", JSON.stringify(data));
if (process.argv[2]) { const { error } = await db.from("companies").update({ spend_limit_usd: Number(process.argv[2]), spend_window_days: Number(process.argv[3] ?? 30) }).eq("id", CO); console.log(error ? "못 바꿈: " + error.message : `바꿈 → $${process.argv[2]}/${process.argv[3] ?? 30}일`); }
