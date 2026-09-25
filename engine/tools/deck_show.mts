const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("content_json").eq("id", process.argv[2]).maybeSingle();
const c = (data?.content_json ?? {}) as Record<string, any>;
for (const k of c.verdict?.cases ?? []) console.log(k.result === "Passed" ? "✅" : "❌", k.name, "—", k.message);
console.log("제목:", c.outline?.title, "| 부제:", c.outline?.subtitle, "| 보는 사람:", c.outline?.audience);
for (const [i, s] of (c.outline?.slides ?? []).entries()) console.log(`${i + 1}. ${s.heading} — ${s.bullets.join(" · ")}`);
