/** 업무 설명 원문을 파일로. asg_desc <업무 id 앞글자> <저장 경로> */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { writeFileSync } = await import("node:fs");
const db = createServiceClient();
const { data } = await db.from("assignments").select("id, title, description").gte("created_at", "2026-09-01").limit(2000);
const a = ((data ?? []) as { id: string; title: string; description: string }[]).find((x) => x.id.startsWith(process.argv[2]));
if (!a) { console.error("없음"); process.exit(1); }
writeFileSync(process.argv[3], a.description, "utf8");
console.log(a.title, "·", a.description.length, "자 →", process.argv[3]);
