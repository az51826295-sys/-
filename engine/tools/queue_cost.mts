/**
 * 지난 판들의 **실측 값·시간** — 무인 대기열의 값·시간 추정에 쓰는 근거(203회차 09-21).
 * 실행 하나 = 판 하나(model_usage.work_execution_id 로 모은다).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/queue_cost.mts
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const since = new Date(Date.now() - 14 * 86400_000).toISOString();
const { data: ex, error } = await db.from("work_executions").select("id, created_at, started_at, completed_at, status").gte("created_at", since);
if (error) { console.log("실행 표를 못 읽음:", error.message); process.exit(1); }
const tally = new Map<string, number>();
for (const r of ex ?? []) tally.set(r.status as string, (tally.get(r.status as string) ?? 0) + 1);
console.log("상태:", [...tally].map(([k, v]) => `${k} ${v}`).join(" · "));

const { data: mu } = await db.from("model_usage").select("cost_usd, work_execution_id").gte("created_at", since);
const byEx = new Map<string, number>();
for (const m of mu ?? []) { const k = m.work_execution_id as string | null; if (k) byEx.set(k, (byEx.get(k) ?? 0) + Number(m.cost_usd ?? 0)); }
// **끝난 실행 전부**를 센다 — 실패한 판도 돈을 쓴다(무인 판의 상한은 성공만 세지 않는다).
const done = (ex ?? []).filter((r) => r.completed_at);
const rows = done.map((r) => ({ usd: byEx.get(r.id as string) ?? 0, min: (Date.parse(r.completed_at as string) - Date.parse((r.started_at ?? r.created_at) as string)) / 60000 })).filter((r) => r.usd > 0);
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const costs = rows.map((r) => r.usd), mins = rows.map((r) => r.min).filter((x) => x >= 0);
console.log(`끝난 실행 ${done.length} · 값이 붙은 것 ${rows.length} (14일)`);
console.log(`값   25% $${q(costs, .25).toFixed(3)} · 중앙 $${q(costs, .5).toFixed(3)} · 75% $${q(costs, .75).toFixed(3)} · 95% $${q(costs, .95).toFixed(3)} · 합 $${costs.reduce((a, b) => a + b, 0).toFixed(2)}`);
console.log(`시간 25% ${q(mins, .25).toFixed(1)}분 · 중앙 ${q(mins, .5).toFixed(1)}분 · 75% ${q(mins, .75).toFixed(1)}분 · 95% ${q(mins, .95).toFixed(1)}분`);
