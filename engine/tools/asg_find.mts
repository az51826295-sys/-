const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("assignments").select("id, title, description, created_at, role_input_json").ilike("title", `%${process.argv[2]}%`).order("created_at", { ascending: false }).limit(Number(process.argv[3] ?? 2));
for (const a of (data ?? []) as Record<string, any>[]) { console.log(`--- ${String(a.created_at).slice(5, 16)} ${String(a.id).slice(0, 8)} ${a.title}`); console.log(String(a.description ?? "").slice(0, 900)); }
