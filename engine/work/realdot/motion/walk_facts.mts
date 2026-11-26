// 걷기 시트 진단(11-26 사장님 "기사 걷는 게 어색해"): 프레임별 머리 높이(출렁임)·발 폭·프레임끼리 다른 칸 수 + 한 장 보드. 돈 0.
//   PACK_ROOT=... npx tsx engine/work/realdot/motion/walk_facts.mts [이름...]
import sharp from "sharp";
const ROOT = process.env.PACK_ROOT || "C:/Users/az518/Desktop/두근도트-스레드/itch-pack2";
const ALL = ["knight", "mage", "archer", "rogue", "priest", "merchant", "slime", "goblin", "skeleton", "bat"];
const pick = process.argv.slice(2); const NAMES = pick.length ? pick : ALL;
const S = Number(process.env.BOARD_S || 4), GAP = 16;
const rows: { input: Buffer; top: number; left: number }[] = [];
let y = 0, width = 0;
for (const n of NAMES) {
  const P = `${ROOT}/${n}/walk-1x.png`;
  const { data, info } = await sharp(P).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cw = Math.floor(info.width / 4);
  const a = (f: number, x: number, yy: number) => data[(yy * info.width + f * cw + x) * 4 + 3] > 0;
  const tops: number[] = [], feet: number[] = [];
  for (let f = 0; f < 4; f++) {
    let top = -1, bot = -1;
    for (let yy = 0; yy < info.height; yy++) for (let x = 0; x < cw; x++) if (a(f, x, yy)) { if (top < 0) top = yy; bot = yy; }
    let l = 1e9, r = -1;
    for (let yy = bot - 2; yy <= bot; yy++) for (let x = 0; x < cw; x++) if (a(f, x, yy)) { l = Math.min(l, x); r = Math.max(r, x); }
    tops.push(top); feet.push(r - l + 1);
  }
  // 이웃 프레임끼리 달라진 칸 수(색까지)
  const diff: number[] = [];
  for (let f = 0; f < 4; f++) {
    const g = (f + 1) % 4; let d = 0;
    for (let yy = 0; yy < info.height; yy++) for (let x = 0; x < cw; x++) {
      const i = (yy * info.width + f * cw + x) * 4, j = (yy * info.width + g * cw + x) * 4;
      if (data[i + 3] !== data[j + 3] || (data[i + 3] > 0 && (data[i] !== data[j] || data[i + 1] !== data[j + 1] || data[i + 2] !== data[j + 2]))) d++;
    }
    diff.push(d);
  }
  const bob = Math.max(...tops) - Math.min(...tops);
  console.log(`${n.padEnd(9)} 머리 ${tops.join("/")} (출렁 ${bob}) · 발폭 ${feet.join("/")} · 바뀐칸 ${diff.join("/")}`);
  const label = Buffer.from(`<svg width="200" height="${info.height * S}"><text x="8" y="${(info.height * S) / 2}" font-size="24" font-family="sans-serif" fill="#fff">${n}</text><text x="8" y="${(info.height * S) / 2 + 30}" font-size="18" font-family="sans-serif" fill="#bbb">출렁 ${bob}칸</text></svg>`);
  rows.push({ input: label, top: y, left: 0 });
  rows.push({ input: await sharp(P).resize(info.width * S, info.height * S, { kernel: "nearest" }).png().toBuffer(), top: y, left: 210 });
  width = Math.max(width, 210 + info.width * S); y += info.height * S + GAP;
}
await sharp({ create: { width, height: y, channels: 4, background: { r: 60, g: 63, b: 70, alpha: 1 } } }).composite(rows).png().toFile(`${ROOT}/${process.env.BOARD_OUT || "walk-board.png"}`);
console.log("ok", width, y);
