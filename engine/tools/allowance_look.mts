/**
 * 읽기만 한다 — 회사별 한도와 남은 몫.
 *
 * 226회차 09-26: 이 자가 거짓말을 했다. 자기가 직접 "최근 30일" 로 세느라 **세는 시작점**
 * (credits_started_at, 223회차)을 무시했고, 사장님 회사를 "$57.8 썼음·막힘" 으로 보여 줬다.
 * 진짜 문(checkAllowance)은 $0.19 썼고 열려 있었다. 이제 문과 같은 함수로 센다 — 자와 문이
 * 다른 셈을 하면 내가 매번 잘못 본다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { checkAllowance } = await import("../../src/lib/costs/allowance");
const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name, spend_window_days, credits_started_at");
for (const c of cos ?? []) {
  const a = await checkAllowance(db, c.id);
  const start = c.credits_started_at ? String(c.credits_started_at).slice(0, 10) : null;
  console.log(
    `${String(c.name).padEnd(16)} 한도 $${a.limitUsd.toFixed(2)}${a.prepaid ? " (충전식)" : `/${a.windowDays}일`} · ` +
    `쓴 것 $${a.spentUsd.toFixed(3)} · 남은 것 $${a.remainingUsd.toFixed(3)}` +
    (start ? ` · ${start} 부터 셈` : "") + (a.exhausted ? "  **막힘**" : ""),
  );
  if (!a.exhausted || a.prepaid) continue;
  // **언제 풀리나** — 창이 밀리면서 옛 지출이 빠진다. 시작점이 있으면 그 앞은 애초에 안 세니 그대로 둔다.
  const days = Number(c.spend_window_days ?? 30);
  const since = new Date(Math.max(Date.now() - days * 86400_000, c.credits_started_at ? Date.parse(String(c.credits_started_at)) : 0)).toISOString();
  const { data: rows } = await db.from("model_usage").select("cost_usd, created_at").eq("company_id", c.id).gte("created_at", since).order("created_at");
  const byDay = new Map<string, number>();
  for (const r of rows ?? []) byDay.set(String(r.created_at).slice(0, 10), (byDay.get(String(r.created_at).slice(0, 10)) ?? 0) + Number(r.cost_usd ?? 0));
  for (let ahead = 1; ahead <= days; ahead++) {
    const cut = new Date(Date.now() - (days - ahead) * 86400_000).toISOString().slice(0, 10);
    let left = a.limitUsd;
    for (const [d, v] of byDay) if (d >= cut) left -= v;
    if (left > 0.05) {
      console.log(`   → **${new Date(Date.now() + ahead * 86400_000).toISOString().slice(0, 10)}** 쯤 풀린다(${ahead}일 뒤) · 그때 남는 것 약 $${left.toFixed(2)}`);
      break;
    }
    if (ahead === days) console.log(`   → ${days}일 안에는 안 풀린다`);
  }
}
