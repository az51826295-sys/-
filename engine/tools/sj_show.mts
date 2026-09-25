const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("content_json").eq("id", process.argv[2]).maybeSingle();
const c = (data?.content_json ?? {}) as Record<string, any>;
console.log("scriptJudge:", JSON.stringify(c.scriptJudge ?? null).slice(0, 900));
console.log("장면 수:", c.script?.scenes?.length, "· 제목:", c.script?.title);
for (const [i, s] of (c.script?.scenes ?? []).entries()) console.log(`  ${i + 1}. ${s.heading} | ${s.bullets?.join(" / ")} | ${s.narration}`);
