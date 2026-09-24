const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("assignments").select("id, title, role_input_json").gte("created_at", "2026-09-22").ilike("title", "%판_ 1회차%").order("created_at");
for (const a of (data ?? []) as Record<string, any>[]) {
  const v = String((a.role_input_json ?? {}).previousDeliverableId ?? "");
  console.log(String(a.id).slice(0, 8), a.title.match(/판\d+/)?.[0], "prev =", v, "(길이", v.length + ")");
}
