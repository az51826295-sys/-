// 에셋팩 묶기(11-26 사장님 통과): itch 에 올릴 zip · 표지(630x500) · 미리보기 시트. 돈 0.
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const SRC = process.env.PACK_SRC || "C:/Users/az518/Desktop/두근도트-스레드/itch-pack2"; // 11-26 v2: itch-pack4(정면·6장 걷기·키 맞춤)
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/itch-upload";
const PACK = `${OUT}/pixel-rpg-characters-10`;
const NAMES = ["knight", "mage", "archer", "rogue", "priest", "merchant", "slime", "goblin", "skeleton", "bat"];
mkdirSync(PACK, { recursive: true });
for (const n of NAMES) {
  const D = `${PACK}/${n}`; mkdirSync(D, { recursive: true });
  copyFileSync(`${SRC}/${n}/turn-1x.png`, `${D}/${n}_4dir.png`);
  copyFileSync(`${SRC}/${n}/walk-1x.png`, `${D}/${n}_walk.png`);
  copyFileSync(`${SRC}/${n}/turn.gif`, `${D}/${n}_4dir_preview.gif`);
  copyFileSync(`${SRC}/${n}/walk.gif`, `${D}/${n}_walk_preview.gif`);
}
writeFileSync(`${PACK}/README.txt`, [
  "Pixel RPG Characters - 10 pack",
  "",
  "10 characters: knight, mage, archer, rogue, priest, merchant, slime, goblin, skeleton, bat",
  "Each: 4 directions (front, right, back, left) + walk cycle (6 frames; slime and bat: 4-frame bounce).",
  "",
  "Files (per character):",
  "  <name>_4dir.png   - 1x sprite sheet, 4 frames left to right: front / right / back / left",
  "  <name>_walk.png   - 1x sprite sheet, walk cycle (6 frames, slime/bat 4)",
  "  *_preview.gif     - enlarged previews",
  "Transparent PNG, true 1x pixel grid (one colour per pixel). Frames are square and equal width: frame count = sheet width / sheet height.",
  "The 4-direction and walk sheets of a character use the same canvas and the same character height.",
  "",
  "License: free for personal and commercial projects. Credit appreciated, not required.",
  "Please don't resell or redistribute this pack as-is.",
  "",
  "Need a character that isn't here? Make your own from one line of text:",
  "https://dugeundot.com/pixel?from=itch",
  "",
].join("\r\n"));
// 표지 630x500: 걷기 첫 프레임 10개를 2줄로, 정수배 확대
const S = 3, W = 630, H = 500;
const tiles: { input: Buffer; left: number; top: number }[] = [];
for (const [i, n] of NAMES.entries()) {
  const p = `${SRC}/${n}/walk-1x.png`; const m = await sharp(p).metadata(); const cw = m.height!; // 칸은 정사각
  // 칠한 범위로 잘라 키운다(96칸 캔버스가 섞여 있어 캔버스째 키우면 줄을 넘는다)
  const one = await sharp(p).extract({ left: 0, top: 0, width: cw, height: m.height! }).png().toBuffer();
  const fr = await sharp(one).trim({ threshold: 0 }).png().toBuffer({ resolveWithObject: true });
  const f = await sharp(fr.data).resize(fr.info.width * S, fr.info.height * S, { kernel: "nearest" }).png().toBuffer();
  const col = i % 5, row = Math.floor(i / 5);
  const cx = 63 + col * 126, by = row === 0 ? 235 : 465;
  tiles.push({ input: f, left: Math.max(0, Math.round(cx - (fr.info.width * S) / 2)), top: Math.max(0, by - fr.info.height * S) });
}
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 46, g: 49, b: 58, alpha: 1 } } }).composite(tiles).png().toFile(`${OUT}/cover-630x500.png`);
copyFileSync(`${SRC}/${process.env.BOARD_FILE || "board.png"}`, `${OUT}/preview-all.png`);
console.log("ok");
