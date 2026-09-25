const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: rows } = await db.from("deliverables").select("id, content_json").gte("created_at", "2026-09-24").order("created_at", { ascending: false }).limit(300); const data = (rows ?? []).find((r: { id: string }) => r.id.startsWith(process.argv[2]));
const c = (data?.content_json ?? {}) as Record<string, any>;
console.log("scriptJudge:", JSON.stringify(c.scriptJudge ?? null).slice(0, 900));
console.log("장면 수:", c.script?.scenes?.length, "· 제목:", c.script?.title);
for (const [i, s] of (c.script?.scenes ?? []).entries()) console.log(`  ${i + 1}. ${s.heading} | ${s.bullets?.join(" / ")} | ${s.narration}`);
