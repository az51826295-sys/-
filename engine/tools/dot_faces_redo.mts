/**
 * 얼굴 크롭만 다시 — 자르는 법이 바뀌었을 때(09-11 3판). 저장된 칸 PNG 에서 얼굴을 다시 잘라 재고 올린다.
 *   npx tsx engine/tools/dot_faces_redo.mts <slug…>
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ||= l.slice(i+1).trim(); }
import sharp from "sharp";
import { createServiceClient } from "../../src/lib/supabase/service";
import { SHEET_ORDER } from "../../src/lib/dot/sprites";
import { faceCrop, faceCropCheck, FACE_PX } from "./dot_faces_lib";

const OUT = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
const db = createServiceClient();
const dry = process.argv.includes("--dry");
const slugs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
let bad = 0;
for (const slug of slugs) {
  const { data: ch } = await db.from("dot_characters").select("name, faces").eq("slug", slug).maybeSingle();
  if (!ch) throw new Error(`${slug} 없음`);
  const faces = { ...((ch.faces ?? {}) as Record<string, string>) };
  const v = "?v=" + Date.now();
  const report: string[] = [];
  for (const [pre, keyPre, dir] of [["", "", ""], ["menhera-", "menhera:", "menhera/"]] as const) {
    for (const e of SHEET_ORDER) {
      const f = `${OUT}/${slug}-${pre}${e}.png`; if (!existsSync(f)) continue;
      const face = await faceCrop(readFileSync(f));
      const c = await faceCropCheck(face);
      if (!c.ok) bad++;
      report.push(`${c.ok ? "✅" : "❌"}${pre ? "멘" : ""}${e} ${Math.round(c.centerY * 100)}%/${Math.round(c.skinRatio * 100)}%`);
      writeFileSync(`${OUT}/faces/${slug}-${pre}${e}-face.png`, face);
      const path = `${slug}/${dir}face/${e}.png`;
      if (dry) continue;
      const { error } = await db.storage.from("dot-sprites").upload(path, face, { contentType: "image/png", upsert: true });
      if (error) throw new Error(`${path}: ${error.message}`);
      faces[`${keyPre}${e}`] = db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl + v;
    }
  }
  if (!dry) { const { error } = await db.from("dot_characters").update({ faces }).eq("slug", slug); if (error) throw new Error(error.message); }
  console.log(`${ch.name}: ${report.join(" · ")}`);
}
const tiles: { input: Buffer; left: number; top: number }[] = [];
for (const [r, s] of slugs.entries()) for (const [c, e] of SHEET_ORDER.entries()) for (const [k, off] of [["", 0], ["menhera-", 6]] as const) {
  const f = `${OUT}/faces/${s}-${k}${e}-face.png`; if (!existsSync(f)) continue;
  tiles.push({ input: await sharp(readFileSync(f)).resize(FACE_PX, FACE_PX, { kernel: "nearest" }).png().toBuffer(), left: (c + off) * (FACE_PX + 4) + (off ? 12 : 0), top: r * (FACE_PX + 4) });
}
await sharp({ create: { width: 12 * (FACE_PX + 4) + 12, height: slugs.length * (FACE_PX + 4), channels: 4, background: "#b2c7d9" } }).composite(tiles).png().toFile(`${OUT}/faces-redo.png`);
console.log(`→ ${OUT}/faces-redo.png · 자 떨어진 얼굴 ${bad}`);
