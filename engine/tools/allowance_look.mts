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
  if (used < lim) continue;
  // **언제 풀리나** — 창이 밀리면서 옛 지출이 빠진다. 하루씩 밀어 보며 남은 것이 양수가 되는 날을 찾는다.
  const { data: rows } = await db.from("model_usage").select("cost_usd, created_at").eq("company_id", c.id).gte("created_at", since).order("created_at");
  const byDay = new Map<string, number>();
  for (const r of rows ?? []) byDay.set(String(r.created_at).slice(0, 10), (byDay.get(String(r.created_at).slice(0, 10)) ?? 0) + Number(r.cost_usd ?? 0));
  for (let ahead = 1; ahead <= days; ahead++) {
    const cut = new Date(Date.now() - (days - ahead) * 86400_000).toISOString().slice(0, 10);
    let left = lim;
    for (const [d, v] of byDay) if (d >= cut) left -= v;
    if (left > 0.05) {
      const when = new Date(Date.now() + ahead * 86400_000).toISOString().slice(0, 10);
      console.log(`   → **${when}** 쯤 풀린다(${ahead}일 뒤) · 그때 남는 것 약 $${left.toFixed(2)}`);
      break;
    }
    if (ahead === days) console.log(`   → ${days}일 안에는 안 풀린다`);
  }
}
