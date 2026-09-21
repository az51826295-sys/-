/** 읽기만 한다 — 회사별 30일 한도와 남은 몫. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name, spend_limit_usd, spend_window_days, billing_mode");
for (const c of cos ?? []) {
  const days = Number(c.spend_window_days ?? 30);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data: mu } = await db.from("model_usage").select("cost_usd").eq("company_id", c.id).gte("created_at", since);
  const used = (mu ?? []).reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
  const lim = Number(c.spend_limit_usd ?? 0);
  console.log(`${String(c.name).padEnd(16)} 한도 $${lim.toFixed(2)}/${days}일 · 쓴 것 $${used.toFixed(3)} · 남은 것 $${(lim - used).toFixed(3)}${used >= lim ? "  **막힘**" : ""}`);
}
