/**
 * 피드 사진 주소를 **앱이 내는 주소**로 바꾼다 (10-24).
 *
 * 이사 뒤 `dot_posts.image_url` 156개가 전부 죽은 옛 프로젝트를 가리켰다.
 * 로컬에 있는 3장(haru·nabi·yeonu 의 photo/1)을 `public/` 에 넣었으니 그것만 먼저 돌린다.
 * 나머지 12장은 옛 스토리지에만 있어 10-27 에 가져온다 — **없는 것을 있는 척 바꾸지 않는다.**
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const k = JSON.parse(readFileSync(뿌리 + "/.keys/dot-new.json", "utf8"));
const db = createClient(k.url, k.service, { auth: { persistSession: false } });
const 새터 = "https://dot-web-production-7e03.up.railway.app";

const { data, error } = await db.from("dot_posts").select("id, image_url");
if (error) { console.error("못 읽었다:", error.message); process.exit(1); }

let 고침 = 0, 못함 = 0;
const 못한것 = new Set();
for (const r of data ?? []) {
  const m = String(r.image_url ?? "").match(/\/object\/public\/dot-sprites\/([^?]+)/);
  if (!m) continue;                                   // 이미 새 주소거나 모르는 꼴
  const 경로 = decodeURIComponent(m[1]);
  if (!existsSync(뿌리 + "/public/dot-sprites/" + 경로)) { 못함++; 못한것.add(경로); continue; }
  const 새주소 = `${새터}/dot-sprites/${경로}`;
  const { error: e2 } = await db.from("dot_posts").update({ image_url: 새주소 }).eq("id", r.id);
  if (e2) { 못함++; 못한것.add(경로 + " (" + e2.message.slice(0, 40) + ")"); } else 고침++;
}
console.log(`고친 글 ${고침}개 · 아직 못 고친 글 ${못함}개`);
console.log("10-27 에 가져올 사진: " + [...못한것].sort().join(", "));
