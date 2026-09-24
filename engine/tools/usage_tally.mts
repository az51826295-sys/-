const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const since = new Date(Date.now() - 14 * 864e5).toISOString();
const { data, error } = await db.from("model_usage").select("model, purpose").gte("created_at", since).limit(5000);
if (error) console.log("오류:", error.message);
const t: Record<string, number> = {};
for (const r of (data ?? []) as { model: string; purpose: string }[]) { const k = `${r.model} · ${r.purpose}`; t[k] = (t[k] ?? 0) + 1; }
for (const [k, v] of Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log("  ", v, k);
