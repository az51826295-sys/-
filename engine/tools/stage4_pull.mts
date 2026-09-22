/** 회차 결과물을 꺼낸다. --asg <일id> --out <폴더> */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { writeFileSync, mkdirSync } = await import("node:fs");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const { data: d } = await db.from("deliverables").select("id, title, created_at, content_json").eq("assignment_id", arg("--asg")!).order("created_at", { ascending: false }).limit(1).maybeSingle();
if (!d) { console.error("결과물이 없다"); process.exit(1); }
const cj = (d.content_json ?? {}) as Record<string, unknown>;
const files = (cj.files ?? []) as { path: string; contents: string }[];
const out = arg("--out")!;
mkdirSync(out, { recursive: true });
let total = 0;
for (const f of files) { const n = f.contents.split("\n").length; total += n; writeFileSync(`${out}/${f.path.replace(/[\/]/g, "_")}`, f.contents, "utf8"); }
console.log(`결과물 ${d.id} · ${d.title}`);
console.log(`파일 ${files.length}개 · 전체 ${total}줄`);
console.log(`조각 경로(patched): ${JSON.stringify(cj.patched ?? null)}`);
const loop = cj.loop as { rounds?: { met: number; unmet: number; broken: number }[] } | null;
console.log(`고리 바퀴: ${loop?.rounds?.length ?? 0} · 마지막 ${JSON.stringify(loop?.rounds?.[(loop?.rounds?.length ?? 1) - 1] ?? null)}`);
