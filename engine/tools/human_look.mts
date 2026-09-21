/** 읽기만 한다 — '사장님 볼 것' 칸에 무엇이 들어갔나. 아무것도 바꾸지 않는다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: run } = await db.from("genesis_runs").select("result").eq("kind", "unattended").order("run_date", { ascending: false }).limit(1).maybeSingle();
const since = (run?.result as { startedAt: string }).startedAt;
const { data } = await db.from("deliverables").select("title, created_at").gte("created_at", since).is("content_json->>askJudge", null).is("content_json->>loop", null).order("created_at");
console.log(`사장님 볼 것 ${data?.length ?? 0}개 (상한 3)`);
for (const d of data ?? []) console.log(`  · ${d.title} · ${d.created_at.slice(11, 19)}`);
const { data: all } = await db.from("deliverables").select("id").gte("created_at", since);
console.log(`판 시작 이후 산출물 전체 ${all?.length ?? 0}개`);
