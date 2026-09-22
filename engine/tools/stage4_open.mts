/**
 * **판을 열 때 원본을 못 박는다** (개정판 6 ⑩): 그때의 파일과 줄 수를 장부에 적어
 * 나중에 "원본이 뭐였나" 를 다시 고를 수 없게 한다.
 *   (인자 없음)      후보를 보여 준다
 *   --pin <id>       그 결과물을 판 1 의 원본으로 박고, 파일을 작업판으로 꺼낸다
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { writeFileSync, mkdirSync } = await import("node:fs");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const id = arg("--pin");

if (!id) {
  const { data } = await db.from("deliverables").select("id, title, created_at, content_json")
    .ilike("title", "%플랫포머%").order("created_at", { ascending: false }).limit(8);
  for (const d of data ?? []) {
    const files = ((d.content_json ?? {}) as { files?: { path: string; contents: string }[] }).files ?? [];
    const lines = files.reduce((a, f) => a + String(f.contents).split("\n").length, 0);
    console.log(`${String(d.created_at).slice(5, 16)} ${d.id} · 파일 ${files.length} · ${lines}줄 · ${d.title}`);
  }
  process.exit(0);
}
const { data: d } = await db.from("deliverables").select("id, title, created_at, content_json, company_id").eq("id", id).maybeSingle();
if (!d) { console.error("그 결과물이 없다"); process.exit(1); }
const files = ((d.content_json ?? {}) as { files?: { path: string; contents: string }[] }).files ?? [];
mkdirSync("engine/work/stage4-run1/origin", { recursive: true });
let total = 0;
for (const f of files) {
  const n = String(f.contents).split("\n").length; total += n;
  writeFileSync(`engine/work/stage4-run1/origin/${f.path.replace(/[\/]/g, "_")}`, f.contents, "utf8");
  console.log(`  ${f.path} · ${n}줄`);
}
console.log(`\n원본 못 박음: ${d.id} · ${d.title}\n파일 ${files.length}개 · **전체 ${total}줄** · 분모(2배) ${2 * total}`);
console.log(`만든 시각 ${d.created_at}`);
