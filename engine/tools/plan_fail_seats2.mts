const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
for (const id of ["c7f0e239", "ee0e72fb"]) {
  const { data: rows } = await db.from("work_executions").select("id, metrics_json").gte("created_at", new Date(Date.now() - 2 * 864e5).toISOString()); const data = (rows ?? []).find((r: { id: string }) => r.id.startsWith(id));
  const m = ((data?.metrics_json ?? {}) as Record<string, unknown>);
  console.log(id, "placement:", String(JSON.stringify(m.placement)).slice(0, 400));
  console.log(id, "decision:", String(JSON.stringify(m.decision)).slice(0, 300));
}
const since = new Date(Date.now() - 14 * 864e5).toISOString();
const { data: led } = await db.from("cost_ledger").select("model, label").gte("created_at", since);
const tally: Record<string, number> = {};
for (const l of (led ?? []) as { model: string; label: string }[]) { const k = `${l.model} · ${l.label}`; tally[k] = (tally[k] ?? 0) + 1; }
console.log("14일 장부(성공한 호출) 모델·자리별:");
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log("  ", v, k);
