const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("id, created_at, updated_at, submitted_at, status, content_json").eq("id", "c6c6db8e-eb11-44cc-8c49-4009af992e95").maybeSingle();
const c = (data?.content_json ?? {}) as Record<string, any>;
console.log("created", data?.created_at, "updated", data?.updated_at, "status", data?.status);
console.log("files[0] 키:", Object.keys(c.files?.[0] ?? {}).join(","), "· 내용 길이:", String(c.files?.[0]?.content ?? "").length, "· origin:", JSON.stringify(c.origin).slice(0, 200));
