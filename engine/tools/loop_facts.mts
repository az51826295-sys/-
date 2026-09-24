const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("content_json").eq("id", process.argv[2]).maybeSingle();
const facts = ((data?.content_json ?? {}) as { loop?: { facts?: Record<string, any> } }).loop?.facts ?? {};
console.log("facts 키:", Object.keys(facts).join(","));
for (const k of Object.keys(facts)) { if (["did", "text", "shots", "ran"].includes(k)) continue; const s = JSON.stringify(facts[k]); console.log(`  ${k}: ${s.slice(0, 500)}`); }
