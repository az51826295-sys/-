/** 결과물 id 로 파일을 꺼낸다 (--id --out). 원본을 덮지 않게 따로 둔다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { writeFileSync, mkdirSync } = await import("node:fs");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const { data: d } = await db.from("deliverables").select("id, title, created_at, content_json").eq("id", arg("--id")!).maybeSingle();
if (!d) { console.log("없음"); process.exit(1); }
const files = ((d.content_json ?? {}) as { files?: { path: string; contents: string }[] }).files ?? [];
mkdirSync(arg("--out")!, { recursive: true });
for (const f of files) writeFileSync(`${arg("--out")}/${f.path.replace(/[\/]/g, "_")}`, f.contents, "utf8");
console.log(`${d.title} · ${String(d.created_at).slice(0, 16)} · 파일 ${files.length}`);
