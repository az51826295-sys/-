/**
 * **Gram 게시물을 파일로 받는다** (227회차 09-30). 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/dot_gram_fetch.mts <업무id앞자리> <이름>
 * 본문·해시태그·첫 줄 후보는 `<이름>-본문.txt`, 그림은 `<이름>-1.png`… 로 `두근도트-인스타` 에.
 * 오류는 **읽는다** — 09-30 에 조회 오류를 안 읽어 결과물이 "없는 것" 처럼 보인 적이 있다.
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const [앞, 이름] = [process.argv[2], process.argv[3]];
if (!앞 || !이름) { console.error("사용: <업무id앞자리> <이름>"); process.exit(1); }
const { data: asg, error: ae } = await db.from("assignments").select("id, status").order("created_at", { ascending: false }).limit(30);
if (ae) { console.error("업무 못 읽음:", ae.message); process.exit(1); }
const a = (asg ?? []).find((r) => String(r.id).startsWith(앞));
if (!a) { console.error("그 업무가 없다"); process.exit(1); }
if (a.status !== "completed" && a.status !== "submitted") { console.error(`아직 ${a.status}`); process.exit(3); }
const { data: ds, error } = await db.from("deliverables").select("id, content_json").eq("assignment_id", a.id);
if (error) { console.error("결과물 못 읽음:", error.message); process.exit(1); }
const out = "C:/Users/az518/Desktop/두근도트-인스타";
for (const d of ds ?? []) {
  const p = ((d.content_json ?? {}) as Record<string, any>).plan;
  if (p?.caption) {
    writeFileSync(`${out}/${이름}-본문.txt`, "\uFEFF" + [p.caption, "", (p.hashtags ?? []).join(" "), "", "--- 첫 줄 후보 ---", ...(p.hookAlts ?? [])].join("\r\n"), "utf8");
    console.log(p.caption);
  }
  const { data: fs, error: fe } = await db.from("deliverable_files").select("storage_path").eq("deliverable_id", d.id);
  if (fe) { console.error("그림 목록 못 읽음:", fe.message); continue; }
  let n = 0;
  for (const f of fs ?? []) {
    const { data: dl, error: de } = await db.storage.from("deliverable-files").download(String(f.storage_path));
    if (de || !dl) { console.error("그림 못 받음:", de?.message); continue; }
    writeFileSync(`${out}/${이름}-${++n}.png`, Buffer.from(await dl.arrayBuffer()));
  }
  if (n) console.log(`\n그림 ${n}장 → ${out}/${이름}-*.png`);
}
