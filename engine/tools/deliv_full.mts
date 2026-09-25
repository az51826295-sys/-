const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("id").gte("created_at", "2026-09-20").limit(1000);
console.log(((data ?? []) as { id: string }[]).find((r) => r.id.startsWith(process.argv[2]))?.id ?? "없음");
