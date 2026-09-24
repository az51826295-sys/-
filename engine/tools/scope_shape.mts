const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: row, error } = await db.from("deliverables").select("*").eq("id","0b2b6f97-0036-4718-8632-63d261b4854b").maybeSingle();
if (error) { console.log("오류:", error.message); process.exit(1); }
const r = (row ?? {}) as Record<string, unknown>;
console.log("칸:", Object.keys(r).join(", "));
for (const k of Object.keys(r)) if (!["content_json","content_markdown"].includes(k)) console.log(`  ${k} = ${JSON.stringify(r[k])}`);
