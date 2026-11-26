// 에셋팩 10종을 한 장에: 줄마다 [번호 · 4방향 4칸 · 걷기 4칸], 3배 확대, 회색 바탕(투명 테두리 보이게). 돈 0.
import sharp from "sharp";
const ROOT = process.env.PACK_ROOT || "C:/Users/az518/Desktop/두근도트-스레드/itch-pack";
const NAMES = ["knight", "mage", "archer", "rogue", "priest", "merchant", "slime", "goblin", "skeleton", "bat"];
const S = Number(process.env.BOARD_S || 3), ROW = Number(process.env.BOARD_ROW || 72) * S, GAP = 12; // 96칸 캔버스가 섞이면 BOARD_ROW=100
const rows: { input: Buffer; top: number; left: number }[] = [];
let width = 0;
for (const [i, n] of NAMES.entries()) {
  let x = 0;
  const label = Buffer.from(`<svg width="150" height="${ROW}"><text x="8" y="${ROW / 2}" font-size="26" font-family="sans-serif" fill="#fff">${i + 1}. ${n}</text></svg>`);
  rows.push({ input: label, top: i * (ROW + GAP), left: 0 }); x = 160;
  for (const k of ["turn", "walk"]) {
    const p = `${ROOT}/${n}/${k}-1x.png`;
    const m = await sharp(p).metadata();
    const buf = await sharp(p).resize(m.width! * S, m.height! * S, { kernel: "nearest" }).png().toBuffer();
    rows.push({ input: buf, top: i * (ROW + GAP) + Math.max(0, (ROW - m.height! * S) >> 1), left: x });
    x += m.width! * S + 40;
  }
  width = Math.max(width, x);
}
const height = NAMES.length * (ROW + GAP);
await sharp({ create: { width, height, channels: 4, background: { r: 60, g: 63, b: 70, alpha: 1 } } }).composite(rows).png().toFile(`${ROOT}/${process.env.BOARD_OUT || "board.png"}`);
console.log("ok", width, height);
