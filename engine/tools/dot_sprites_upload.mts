/** 잘라 낸 표정 여섯 장을 저장소에 올리고 dot_characters.sprites 에 적는다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ||= l.slice(i+1).trim();
}
import { createServiceClient } from "../../src/lib/supabase/service";
import { SHEET_ORDER } from "../../src/lib/dot/sprites";

const slug = process.argv[2] ?? "yuna";
const DIR = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
const db = createServiceClient();
const sprites: Record<string, string> = {};

for (const emotion of SHEET_ORDER) {
  const body = readFileSync(`${DIR}/${slug}-${emotion}.png`);
  const path = `${slug}/${emotion}.png`;
  const { error } = await db.storage.from("dot-sprites").upload(path, body, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`${path}: ${error.message}`);
  sprites[emotion] = db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl;
  console.log(`↑ ${emotion} ${Math.round(body.length / 1024)} KB`);
}
const { error } = await db.from("dot_characters").update({ sprites, is_public: true }).eq("slug", slug);
if (error) throw new Error(error.message);
console.log(`\n${slug} 스프라이트 6장 올림 · is_public=true`);
console.log(sprites.neutral);
