const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("content_json, content_markdown").eq("id", "7766b32f-bd26-4d05-baac-e118576ee06c").maybeSingle();
const c = (data?.content_json ?? {}) as Record<string, any>;
console.log("키:", Object.keys(c).join(","));
console.log("target:", c.target, "· loop:", JSON.stringify(c.loop).slice(0, 300));
console.log("끝까지못봄:", JSON.stringify(c.끝까지못봄 ?? c.notFinished ?? null).slice(0, 200));
console.log("summary:", String(c.summary ?? "").slice(0, 300));
console.log("markdown 앞:", String(data?.content_markdown ?? "").slice(0, 400));
