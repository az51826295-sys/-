// 10종 걷기를 한 화면에서 같이 재생(11-26 사장님 "영상으로 보여줘 걷는 거"). 돈 0.
//   PACK_ROOT=... npx tsx engine/work/realdot/motion/walk_video.mts  → <ROOT>/walk-all.gif
import sharp from "sharp";
const ROOT = process.env.PACK_ROOT || "C:/Users/az518/Desktop/두근도트-스레드/itch-pack2";
const NAMES = ["knight", "mage", "archer", "rogue", "priest", "merchant", "slime", "goblin", "skeleton", "bat"];
const S = 4, CW = 76 * S, CH = 80 * S, COLS = 5;
const sheets = await Promise.all(NAMES.map(async (n) => { const p = `${ROOT}/${n}/walk-1x.png`; const m = await sharp(p).metadata(); return { p, w: m.width!, h: m.height!, cw: Math.floor(m.width! / 4) }; }));
const W = CW * COLS, H = CH * Math.ceil(NAMES.length / COLS);
const frames: Buffer[] = [];
for (let f = 0; f < 4; f++) {
  const comp: sharp.OverlayOptions[] = [];
  for (const [i, s] of sheets.entries()) {
    const img = await sharp(s.p).extract({ left: f * s.cw, top: 0, width: s.cw, height: s.h }).resize(s.cw * S, s.h * S, { kernel: "nearest" }).png().toBuffer();
    const col = i % COLS, row = Math.floor(i / COLS);
    const left = col * CW + Math.round((CW - s.cw * S) / 2), top = row * CH + (CH - 28) - s.h * S; // 발을 같은 바닥선에
    comp.push({ input: img, left: Math.max(0, left), top: Math.max(0, top) });
    comp.push({ input: Buffer.from(`<svg width="${CW}" height="24"><text x="${CW / 2}" y="18" text-anchor="middle" font-size="18" font-family="sans-serif" fill="#ccc">${NAMES[i]}</text></svg>`), left: col * CW, top: row * CH + CH - 24 });
  }
  frames.push(await sharp({ create: { width: W, height: H, channels: 4, background: { r: 60, g: 63, b: 70, alpha: 1 } } }).composite(comp).png().toBuffer());
}
// 두 바퀴 분량(8장)으로 이어 붙여 GIF
const seq = [...frames, ...frames];
await sharp(seq, { join: { animated: true } }).gif({ delay: seq.map(() => 160), loop: 0 }).toFile(`${ROOT}/walk-all.gif`);
console.log("ok", W, H);
