const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("employees").select("*").order("created_at").limit(20);
for (const e of (data ?? []) as Record<string, any>[]) console.log(e.slug, "|", e.name, "|", e.role, "|", Object.keys(e).filter((k) => e[k] != null).join(","));
