const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("*").eq("deliverable_type", "app_build").order("created_at", { ascending: false }).limit(1).single();
const d = data as Record<string, unknown>;
for (const [k, v] of Object.entries(d)) {
  if (k === "content_json" || k === "content_markdown") { console.log(k, "= (길다)"); continue; }
  console.log(k, "=", JSON.stringify(v)?.slice(0, 80));
}
