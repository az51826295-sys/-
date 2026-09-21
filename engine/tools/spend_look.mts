/** 30일 지출을 항목별로. 그리고 2단계 '0판' 을 **원본 기록에서 직접** 센다. 읽기만 한다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const CO = "5925c03a-557f-46d7-8589-7388b769df40";
const since = new Date(Date.now() - 30 * 86400_000).toISOString();
const { data: co } = await db.from("companies").select("id, name").eq("id", CO).maybeSingle();
console.log(`== ${co?.name} 30일 지출 ==`);
const { data: mu } = await db.from("model_usage").select("cost_usd, purpose, model, created_at").eq("company_id", CO).gte("created_at", since);
const sum = (rows: { cost_usd: unknown }[]) => rows.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
console.log(`합계 $${sum(mu ?? []).toFixed(2)} · 호출 ${mu?.length ?? 0}건`);
const byP = new Map<string, { usd: number; n: number }>();
for (const m of mu ?? []) { const k = String(m.purpose ?? "?"); const g = byP.get(k) ?? { usd: 0, n: 0 }; g.usd += Number(m.cost_usd ?? 0); g.n++; byP.set(k, g); }
console.log("\n쓰임새별 (큰 것부터)");
for (const [k, g] of [...byP].sort((a, b) => b[1].usd - a[1].usd).slice(0, 10)) console.log(`  ${k.padEnd(22)} $${g.usd.toFixed(2).padStart(6)} · ${String(g.n).padStart(4)}건 · 건당 $${(g.usd / g.n).toFixed(4)}`);
const byM = new Map<string, number>();
for (const m of mu ?? []) byM.set(String(m.model ?? "?"), (byM.get(String(m.model ?? "?")) ?? 0) + Number(m.cost_usd ?? 0));
console.log("\n모델별");
for (const [k, v] of [...byM].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${k.padEnd(22)} $${v.toFixed(2)}`);
const byD = new Map<string, number>();
for (const m of mu ?? []) byD.set(String(m.created_at).slice(0, 10), (byD.get(String(m.created_at).slice(0, 10)) ?? 0) + Number(m.cost_usd ?? 0));
const days = [...byD].sort();
console.log(`\n제일 비싼 날 셋: ${days.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, v]) => `${d} $${v.toFixed(2)}`).join(" · ")}`);

// ── 2단계 '0판' 을 원본으로 직접 센다 (도구를 의심한다 — 사장님 09-21)
console.log("\n== 2단계 0판 맞나: 원본에서 직접 ==");
const { data: raw } = await db.from("deliverables").select("id, created_at, cj:content_json").eq("deliverable_type", "app_build").gte("created_at", new Date(Date.now() - 60 * 86400_000).toISOString()).limit(1000);
let withSeats = 0, withFix = 0, withMode = 0; const shapes = new Map<string, number>(); const modes = new Map<string, number>();
for (const d of raw ?? []) {
  const s = (d.cj as { seats?: Record<string, unknown> } | null)?.seats;
  if (!s) continue; withSeats++;
  shapes.set(Object.keys(s).sort().join(","), (shapes.get(Object.keys(s).sort().join(",")) ?? 0) + 1);
  if (s.fix != null) withFix++;
  if (s.fixMode != null) { withMode++; modes.set(String(s.fixMode), (modes.get(String(s.fixMode)) ?? 0) + 1); }
}
console.log(`app_build 산출물 ${raw?.length ?? 0}개 · seats 있음 ${withSeats} · fix 있음 ${withFix} · **fixMode 있음 ${withMode}**`);
console.log(`seats 모양: ${[...shapes].map(([k, v]) => `[${k}] ${v}개`).join(" · ")}`);
if (modes.size) console.log(`fixMode 값: ${[...modes].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
