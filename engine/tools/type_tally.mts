const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("deliverable_type").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(2000);
const t: Record<string, number> = {}; for (const r of (data ?? []) as { deliverable_type: string }[]) t[r.deliverable_type] = (t[r.deliverable_type] ?? 0) + 1;
console.log(Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
