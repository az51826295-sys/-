const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("content_json").eq("id", process.argv[2]).maybeSingle();
const c = (data?.content_json ?? {}) as Record<string, any>;
console.log("bestRound:", c.loop?.bestRound, "· stoppedBy:", c.loop?.stoppedBy, "· note:", String(c.note ?? "").slice(0, 300));
for (const r of c.loop?.rounds ?? []) console.log(`  바퀴 ${r.n}: best ${r.best} · errors ${r.errors} · edits ${r.edits} · 깨짐 ${r.broken} · measured ${JSON.stringify(r.measured ?? r.facts?.measured ?? null)?.slice(0, 160)}`);
console.log("끝까지못봄:", JSON.stringify(c.끝까지못봄));
