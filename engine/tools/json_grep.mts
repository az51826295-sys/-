const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: rows } = await db.from("deliverables").select("id, content_json").gte("created_at", "2026-09-24").order("created_at", { ascending: false }).limit(300); const data = (rows ?? []).find((r: { id: string }) => r.id.startsWith(process.argv[2]));
const s = JSON.stringify(data?.content_json ?? {});
const i = s.indexOf(process.argv[3]);
console.log(i < 0 ? "없음" : s.slice(Math.max(0, i - 40), i + 500));
