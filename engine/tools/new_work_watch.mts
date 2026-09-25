/** 사장님이 대화로 넣은 새 업무(도구가 넣은 manual 아님)가 끝나면 한 줄. 감시용. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const since = process.argv[2] ?? new Date(Date.now() - 3600e3).toISOString();
const { data } = await db.from("assignments").select("id, title, status, source_type, created_at, updated_at").gte("created_at", since).neq("source_type", "manual").order("created_at", { ascending: false }).limit(20);
for (const a of (data ?? []) as Record<string, any>[]) console.log(`${String(a.created_at).slice(5, 16)} ${String(a.id).slice(0, 8)} ${a.status} · ${a.source_type} · ${String(a.title).slice(0, 50)}`);
console.log(`새 업무 ${data?.length ?? 0}건 (${since.slice(0, 16)} 뒤, 도구 제외)`);
