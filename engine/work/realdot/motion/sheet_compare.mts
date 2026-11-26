// 두 걷기 시트 묶음을 나란히 재생(11-26): A_ROOT/<이름>/walk-1x.png(지금) vs B_ROOT/<이름>/walk-1x.png(고침) → OUT(.gif). 돈 0.
import sharp from "sharp";
const A = process.env.A_ROOT!, B = process.env.B_ROOT!, OUT = process.env.OUT!;
const NAMES = process.argv.slice(2), S = 4, CW = 90 * S, CH = 100 * S;
const load = async (p: string) => { const m = await sharp(p).metadata(); const cw = Math.floor(m.width! / 4); return Promise.all([0, 1, 2, 3].map(async (f) => ({ buf: await sharp(p).extract({ left: f * cw, top: 0, width: cw, height: m.height! }).trim({ threshold: 0 }).resize({ width: undefined }).png().toBuffer() }))); };
const cols: { name: string; tag: string; frames: Buffer[] }[] = [];
for (const n of NAMES) for (const [tag, root] of [["지금", A], ["고침", B]] as const) {
  // 프레임마다 따로 잘라 내면 출렁임이 사라진다 → 시트 전체의 칠한 범위로 한 번에 자른다
  const p = `${root}/${n}/walk-1x.png`; const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = info.height, bot = -1; for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3]) { top = Math.min(top, y); bot = Math.max(bot, y); }
  const cw = Math.floor(info.width / 4), h = bot - top + 1;
  const frames = await Promise.all([0, 1, 2, 3].map((f) => sharp(p).extract({ left: f * cw, top, width: cw, height: h }).resize(cw * S, h * S, { kernel: "nearest" }).png().toBuffer()));
  cols.push({ name: n, tag, frames });
}
void load;
const W = CW * cols.length, H = CH + 40;
const out: Buffer[] = [];
for (let f = 0; f < 4; f++) {
  const comp: sharp.OverlayOptions[] = [];
  for (const [i, c] of cols.entries()) {
    const m = await sharp(c.frames[f]).metadata();
    comp.push({ input: c.frames[f], left: i * CW + Math.max(0, Math.round((CW - m.width!) / 2)), top: Math.max(0, CH - m.height!) });
    comp.push({ input: Buffer.from(`<svg width="${CW}" height="36"><text x="${CW / 2}" y="26" text-anchor="middle" font-size="22" font-family="sans-serif" fill="${c.tag === "지금" ? "#aaa" : "#8fe"}">${c.name} ${c.tag}</text></svg>`), left: i * CW, top: CH + 4 });
  }
  out.push(await sharp({ create: { width: W, height: H, channels: 4, background: { r: 60, g: 63, b: 70, alpha: 1 } } }).composite(comp).png().toBuffer());
}
const seq = [...out, ...out];
await sharp(seq, { join: { animated: true } }).gif({ delay: seq.map(() => 180), loop: 0 }).toFile(OUT);
console.log("ok", W, H);
