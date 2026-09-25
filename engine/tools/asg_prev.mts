const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("assignments").select("id, title, created_at, role_input_json").gte("created_at", "2026-09-22").ilike("title", "%판%회차%").order("created_at");
for (const a of (data ?? []) as Record<string, any>[]) {
  const ri = (a.role_input_json ?? {}) as Record<string, unknown>;
  console.log(String(a.created_at).slice(5, 16), String(a.id).slice(0, 8), a.title.slice(0, 40), "| 키:", Object.keys(ri).join(","), "| prev:", String(ri.previousDeliverableId ?? "없음").slice(0, 8));
}
// 워커와 같은 방식으로 원본 행을 읽어 본다
for (const id of ["c6c6db8e-eb11-44cc-8c49-4009af992e95", "0b2b6f97"]) {
  const { data: d, error } = await db.from("deliverables").select("title, content_json").eq("id", id).maybeSingle();
  console.log("읽기", id.slice(0, 8), error ? "오류 " + error.message : d ? `됨 · files ${(d.content_json as any)?.files?.length}` : "null");
}
