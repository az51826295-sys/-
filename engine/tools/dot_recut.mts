/**
 * 저장된 시트에서 다시 자르기 — 그림값 안 내고, 자르는 법이 바뀌었을 때(09-11 보라 테두리).
 *
 * 인물마다 보통 시트(`<slug>-sheet.png`)와 멘헤라 시트(`<slug>-menhera-sheet.png`)를 다시 자르고 재고,
 * 자를 다 통과하면 저장소의 그 자리에 덮어쓴 뒤(캐시 깨는 ?v=) 표의 sprites/faces 를 갱신한다.
 *
 *   npx tsx engine/tools/dot_recut.mts <slug…>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ||= l.slice(i+1).trim(); }
import sharp from "sharp";
import { createServiceClient } from "../../src/lib/supabase/service";
import { cutSheet, measureCells, SHEET_ORDER } from "../../src/lib/dot/sprites";
import { faceCrop } from "./dot_faces_lib";

const OUT = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
mkdirSync(OUT + "/faces", { recursive: true });
const db = createServiceClient();
let failed = 0;
for (const slug of process.argv.slice(2)) {
  const { data: ch } = await db.from("dot_characters").select("name, sprites, faces").eq("slug", slug).maybeSingle();
  if (!ch) throw new Error(`${slug} 없음`);
  const sprites = { ...(ch.sprites as Record<string, string>) }, faces = { ...((ch.faces ?? {}) as Record<string, string>) };
  for (const [tag, file, keyPre, dir] of [["보통", `${slug}-sheet.png`, "", ""], ["멘헤라", `${slug}-menhera-sheet.png`, "menhera:", "menhera/"]] as const) {
    if (!existsSync(`${OUT}/${file}`)) { console.log(`${ch.name} ${tag}: 시트 파일 없음, 건너뜀`); continue; }
    const cells = await cutSheet("data:image/png;base64," + readFileSync(`${OUT}/${file}`).toString("base64"));
    const { cases } = await measureCells(cells);
    const bad = cases.filter((c) => c.result === "Failed");
    console.log(`${ch.name} ${tag}: ${bad.length ? "❌ " + bad.map((c) => `${c.name} — ${c.message}`).join(" / ") : "✅ 자 " + cases.length + "개 통과 · " + cases.find((c) => c.name === "보라_테두리")?.message}`);
    if (bad.length) { failed++; continue; }
    const v = "?v=" + Date.now();
    for (const c of cells) {
      const localPre = keyPre ? "menhera-" : "";
      writeFileSync(`${OUT}/${slug}-${localPre}${c.emotion}.png`, c.png);
      const face = await faceCrop(c.png); writeFileSync(`${OUT}/faces/${slug}-${localPre}${c.emotion}-face.png`, face);
      for (const [path, body, into] of [[`${slug}/${dir}${c.emotion}.png`, c.png, sprites], [`${slug}/${dir}face/${c.emotion}.png`, face, faces]] as const) {
        const { error } = await db.storage.from("dot-sprites").upload(path, body, { contentType: "image/png", upsert: true });
        if (error) throw new Error(`${path}: ${error.message}`);
        into[`${keyPre}${c.emotion}`] = db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl + v;
      }
    }
  }
  const { error } = await db.from("dot_characters").update({ sprites, faces }).eq("slug", slug);
  if (error) throw new Error(error.message);
}
// 나란히 보기: 인물 × (보통 6 + 멘헤라 6), 2배로
const slugs = process.argv.slice(2);
const tiles: { input: Buffer; left: number; top: number }[] = [];
for (const [r, s] of slugs.entries()) for (const [c, e] of SHEET_ORDER.entries()) for (const [k, pre] of [["", 0], ["menhera-", 1]] as const) {
  const f = `${OUT}/${s}-${k}${e}.png`; if (!existsSync(f)) continue;
  tiles.push({ input: await sharp(readFileSync(f)).resize(120, 120, { fit: "contain", background: "#b2c7d9" }).png().toBuffer(), left: c * 120 + pre * 740, top: r * 120 });
}
await sharp({ create: { width: 1480, height: 120 * slugs.length, channels: 3, background: "#b2c7d9" } }).composite(tiles).png().toFile(`${OUT}/recut-strip.png`);
console.log(`→ ${OUT}/recut-strip.png · 떨어진 시트 ${failed}`);
process.exit(failed ? 1 : 0);
