/** 회사 한도를 바꾼다. **지금 쓴 것보다 낮게 걸면 즉시 막히므로** 먼저 견준다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const CO = arg("--co") ?? "5925c03a-557f-46d7-8589-7388b769df40";
const usd = Number(arg("--usd")), days = Number(arg("--days") ?? 7);
if (!usd) { console.error("--usd 필요"); process.exit(1); }
const { data: mu } = await db.from("model_usage").select("cost_usd").eq("company_id", CO).gte("created_at", new Date(Date.now() - days * 86400_000).toISOString());
const used = (mu ?? []).reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
console.log(`새 창 ${days}일에 이미 쓴 것 $${used.toFixed(2)} · 걸려는 한도 $${usd.toFixed(2)}`);
if (used >= usd) { console.error(`**즉시 막힌다** — 지금 걸면 로키가 바로 멈춘다. 더 높은 값으로 걸거나 창이 지나가길 기다려야 한다.`); process.exit(2); }
const { error } = await db.from("companies").update({ spend_limit_usd: usd, spend_window_days: days }).eq("id", CO);
if (error) { console.error("못 바꿈:", error.message); process.exit(1); }
console.log(`바꿈: $${usd.toFixed(2)}/${days}일 · 남은 것 $${(usd - used).toFixed(2)}`);
