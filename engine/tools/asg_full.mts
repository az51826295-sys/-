const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("assignments").select("id").gte("created_at", "2026-09-25").limit(500);
const hit = ((data ?? []) as { id: string }[]).find((r) => r.id.startsWith(process.argv[2]));
console.log(hit?.id ?? "없음");
