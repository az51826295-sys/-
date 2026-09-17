/**
 * 68회차 — 프로필용 **얼굴 크롭**을 따로 만든다.
 *
 * 채팅 말풍선 옆 42px 칸에 512px 흉상을 CSS 로 1.5배 확대해 억지로 넣고 있었다. 재 보니 린은
 * 머리카락이 칸을 다 채우고 눈은 맨 아래에 걸려 입이 잘렸다. 표정 6장이 42px 에선 헛것이 된다.
 *
 * 그림에 부탁하지 않고 **얼굴 상자를 재서 자른다**: 살색 화소의 경계 → 위로 35%(머리), 옆 25%,
 * 아래 15%(턱) 여백 → 정사각형 → 96px 최근접. 화면은 이걸 그대로 쓴다(확대·이동 없음).
 *
 *   npx tsx engine/tools/dot_faces.mts            (세 캐릭터 · 저장소 올리고 dot_characters.faces 에 적는다)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import sharp from "sharp";
import { faceCrop, FACE_PX } from "./dot_faces_lib";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const SHEET = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
const OUT = SHEET + "/faces"; mkdirSync(OUT, { recursive: true });
const EMO = ["neutral", "happy", "shy", "sad", "angry", "surprised"];
const isSkin = (r: number, g: number, b: number, a: number) => a > 128 && r > 180 && g > 130 && b > 100 && r > g && g > b && (r - b) > 40;

/** 살색 상자(원본 좌표). 못 찾으면 null — 그때는 위쪽 60% 를 쓴다(있는 것보다 없는 게 낫진 않다). */
async function faceBox(png: Buffer): Promise<{ x0: number; y0: number; x1: number; y1: number } | null> {
  const G = 128;
  const { data, info } = await sharp(png).resize(G, G, { kernel: "nearest", fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const meta = await sharp(png).metadata(); const S = meta.width ?? 512;
  let top = G, bot = -1, left = G, right = -1, n = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const p = (y * G + x) * info.channels;
    if (isSkin(data[p], data[p+1], data[p+2], data[p+3])) { n++; top = Math.min(top, y); bot = Math.max(bot, y); left = Math.min(left, x); right = Math.max(right, x); }
  }
  if (n < 20) return null;
  const k = S / G;
  return { x0: left * k, y0: top * k, x1: (right + 1) * k, y1: (bot + 1) * k };
}

const db = createServiceClient();
for (const slug of ["yuna", "seoha", "rin"]) {
  const faces: Record<string, string> = {};
  for (const e of EMO) {
    const crop = await faceCrop(readFileSync(`${SHEET}/${slug}-${e}.png`));
    writeFileSync(`${OUT}/${slug}-${e}-face.png`, crop);
    const path = `${slug}/face/${e}.png`;
    const { error } = await db.storage.from("dot-sprites").upload(path, crop, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`${path}: ${error.message}`);
    faces[e] = db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl;
  }
  const { error } = await db.from("dot_characters").update({ faces }).eq("slug", slug);
  if (error) throw new Error(`${slug}: ${error.message}`);
  console.log(`${slug}: 얼굴 6장 (${FACE_PX}px) 올림`);
}
// 나란히 보기(2배)
const strip = await sharp({ create: { width: FACE_PX * 6, height: FACE_PX * 3, channels: 4, background: "#b2c7d9" } })
  .composite((await Promise.all(["yuna","seoha","rin"].flatMap((s, r) => EMO.map(async (e, c) => ({ input: readFileSync(`${OUT}/${s}-${e}-face.png`), left: c * FACE_PX, top: r * FACE_PX }))))))
  .png().toBuffer();
writeFileSync(`${OUT}/faces-strip.png`, strip);
console.log("→ faces/faces-strip.png");
