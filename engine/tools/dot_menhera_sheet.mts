/**
 * 멘헤라 얼굴 — 사장님 "멘헤라 모드는 얼굴도 바뀜" (77회차 09-11).
 *
 * 그 캐릭터의 표정 시트를 **본으로**(edit) 같은 사람·같은 화풍으로 멘헤라 판 여섯 칸을 뽑는다:
 *   neutral→초점 없는 눈으로 빤히, happy→집착하는 미소(눈은 안 웃음), shy→홍조·눈물 글썽, sad→울음, angry→질투(눈 그늘), surprised→놀라서 매달림
 * 같은 파이프라인(cutSheet → 자 → faceCrop)을 타고 `<slug>/menhera/<e>.png`, `<slug>/menhera/face/<e>.png` 에 올린다.
 * 표엔 `sprites["menhera:<e>"]`, `faces["menhera:<e>"]` 로 붙는다 — 화면은 모드가 멘헤라일 때 그 키를 먼저 본다.
 *
 *   npx tsx engine/tools/dot_menhera_sheet.mts <slug…> [--reuse] [--quality medium]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ||= l.slice(i+1).trim(); }
import sharp from "sharp";
import { createServiceClient } from "../../src/lib/supabase/service";
import { createImageProvider } from "../../src/lib/providers/images";
import { cutSheet, measureCells, SHEET_ORDER } from "../../src/lib/dot/sprites";
import { faceCrop } from "./dot_faces_lib";

const OUT = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
mkdirSync(OUT + "/faces", { recursive: true });
const args = process.argv.slice(2);
const reuse = args.includes("--reuse");
const qAt = args.indexOf("--quality"); const quality = (qAt > 0 ? args[qAt + 1] : "medium") as "low" | "medium" | "high";
const slugs = args.filter((a) => !a.startsWith("--") && a !== quality);

const MENHERA_FACE: Record<string, string> = {
  neutral: "blank unfocused stare, eyes wide and dull with tiny highlights, faint smile — unsettling calm",
  happy: "obsessive clingy smile, eyes NOT smiling (half-lidded, shadowed), slight blush",
  shy: "heavy blush, teary glistening eyes, hands near face, biting lip",
  sad: "crying, big tears streaming, trembling mouth",
  angry: "jealous glare, eyes shadowed dark under the bangs, tight frown",
  surprised: "startled and desperate, eyes huge with tiny pupils, mouth open, reaching toward viewer",
};

const db = createServiceClient();
const drawer = createImageProvider();
for (const slug of slugs) {
  const { data: ch } = await db.from("dot_characters").select("name, look, sprites, faces").eq("slug", slug).maybeSingle();
  if (!ch) throw new Error(`${slug} 없음`);
  const cells = SHEET_ORDER.map((e, i) => `${i + 1}. ${MENHERA_FACE[e]}`).join(" ");
  const prompt = [
    `Redraw this expression sheet with the SAME character (same face, same hair, same clothes, same colors) in the SAME pixel-art style,`,
    `but every expression becomes a "menhera / yandere" version — clingy, obsessive, emotionally unstable. Keep it cute, not gory: no blood, no weapons.`,
    `Keep: the same 3x2 grid of 6 cells, same chunky low-resolution pixel art, crisp hard pixel edges, same limited flat palette, same bust framing and size per cell,`,
    `same super-deformed chibi proportions. Background: one flat solid pure magenta (#FF00FF) behind everything including gutters — NOT transparent, NOT a checkerboard.`,
    `Cells in order: ${cells}`,
    `No text, no labels, no numbers, no grid lines, no borders, no speech bubbles, no motion lines.`,
  ].join(" ");

  let dataUrl: string;
  const sheetPath = `${OUT}/${slug}-menhera-sheet.png`;
  if (reuse) dataUrl = "data:image/png;base64," + readFileSync(sheetPath).toString("base64");
  else {
    const t0 = Date.now();
    const made = await drawer.edit("data:image/png;base64," + readFileSync(`${OUT}/${slug}-sheet.png`).toString("base64"), prompt, "1536x1024", quality);
    console.log(`${ch.name} 멘헤라 시트 · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    dataUrl = made.dataUrl; writeFileSync(sheetPath, Buffer.from(made.dataUrl.split(",")[1], "base64"));
  }
  const cut = await cutSheet(dataUrl);
  const { cases } = await measureCells(cut);
  for (const c of cases) console.log(`  ${c.result === "Passed" ? "✅" : c.result === "Failed" ? "❌" : "◻︎"} ${c.name} — ${c.message}`);
  if (cases.some((c) => c.result === "Failed")) { console.log(`  → ${slug} 자 떨어짐, 표에 안 올린다`); continue; }

  const sprites = { ...(ch.sprites as Record<string, string>) }, faces = { ...((ch.faces ?? {}) as Record<string, string>) };
  for (const c of cut) {
    writeFileSync(`${OUT}/${slug}-menhera-${c.emotion}.png`, c.png);
    const face = await faceCrop(c.png); writeFileSync(`${OUT}/faces/${slug}-menhera-${c.emotion}-face.png`, face);
    const v = "?v=" + Date.now();
    for (const [path, body, into] of [[`${slug}/menhera/${c.emotion}.png`, c.png, sprites], [`${slug}/menhera/face/${c.emotion}.png`, face, faces]] as const) {
      const { error } = await db.storage.from("dot-sprites").upload(path, body, { contentType: "image/png", upsert: true });
      if (error) throw new Error(`${path}: ${error.message}`);
      into[`menhera:${c.emotion}`] = db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl + v;
    }
  }
  const { error } = await db.from("dot_characters").update({ sprites, faces }).eq("slug", slug);
  if (error) throw new Error(error.message);
  // 나란히 보기: 위 원래 · 아래 멘헤라
  const row = async (pre: string) => Promise.all(SHEET_ORDER.map(async (e, i) => ({ input: await sharp(readFileSync(`${OUT}/${slug}-${pre}${e}.png`)).resize(200, 200, { fit: "contain", background: "#b2c7d9" }).png().toBuffer(), left: i * 200, top: pre ? 200 : 0 })));
  const strip = await sharp({ create: { width: 1200, height: 400, channels: 3, background: "#b2c7d9" } }).composite([...(await row("")), ...(await row("menhera-"))]).png().toBuffer();
  writeFileSync(`${OUT}/${slug}-menhera-strip.png`, strip);
  console.log(`  → ${slug}: 멘헤라 6장 + 얼굴 6장 올림 · ${OUT}/${slug}-menhera-strip.png`);
}
