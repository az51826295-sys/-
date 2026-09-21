const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const CO = "5925c03a-557f-46d7-8589-7388b769df40";
for (const d of [7, 14, 30]) {
  const { data } = await db.from("model_usage").select("cost_usd").eq("company_id", CO).gte("created_at", new Date(Date.now() - d * 86400_000).toISOString());
  console.log(`최근 ${String(d).padStart(2)}일: $${(data ?? []).reduce((a, x) => a + Number(x.cost_usd ?? 0), 0).toFixed(2)} (${data?.length ?? 0}건)`);
}
const { data: co } = await db.from("companies").select("spend_limit_usd, spend_window_days").eq("id", CO).maybeSingle();
console.log(`지금 한도: $${co?.spend_limit_usd}/${co?.spend_window_days}일`);
