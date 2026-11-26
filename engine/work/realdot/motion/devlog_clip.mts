// 스레드 개발 기록용 전/후 영상(11-26 사장님 "스레드에 하나하나씩 기록하자"). 돈 0.
// 홍보 규칙: 만드는 방식·모델·다른 회사 이름은 화면에 넣지 않는다 — 라벨은 "전/후" 만.
//   npx tsx devlog_clip.mts <out.gif> "전=<시트경로>:4" "후=<시트경로>:6"
import sharp from "sharp";
const [out, ...specs] = process.argv.slice(2);
const clips = await Promise.all(specs.map(async (s) => {
  const [label, rest] = s.split("="); const i = rest.lastIndexOf(":"); const p = rest.slice(0, i), n = Number(rest.slice(i + 1));
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = info.height, bot = -1; for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3]) { top = Math.min(top, y); bot = Math.max(bot, y); }
  const cw = Math.floor(info.width / n), h = bot - top + 1;
  const frames = await Promise.all([...Array(n).keys()].map((f) => sharp(p).extract({ left: f * cw, top, width: cw, height: h }).png().toBuffer()));
  return { label, frames, cw, h };
}));
const S = Math.max(2, Math.floor(Number(process.env.CLIP_H || 420) / Math.max(...clips.map((c) => c.h)))), CW = Math.max(...clips.map((c) => c.cw)) * S + 40, CH = Math.max(...clips.map((c) => c.h)) * S;
const COLS = Number(process.env.COLS || clips.length), ROWS = Math.ceil(clips.length / COLS);
const W = CW * COLS, H = (CH + 70) * ROWS, T = 12;
const out2: Buffer[] = [];
for (let t = 0; t < T; t++) {
  const comp: sharp.OverlayOptions[] = [];
  for (const [i, c] of clips.entries()) {
    const f = await sharp(c.frames[t % c.frames.length]).resize(c.cw * S, c.h * S, { kernel: "nearest" }).png().toBuffer();
    const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * (CH + 70);
    comp.push({ input: f, left: cx + Math.round((CW - c.cw * S) / 2), top: cy + 10 + CH - c.h * S });
    comp.push({ input: Buffer.from(`<svg width="${CW}" height="50"><text x="${CW / 2}" y="38" text-anchor="middle" font-size="34" font-weight="bold" font-family="sans-serif" fill="${i ? "#8fe" : "#bbb"}">${c.label}</text></svg>`), left: cx, top: cy + CH + 16 });
  }
  out2.push(await sharp({ create: { width: W, height: H, channels: 4, background: { r: 46, g: 49, b: 58, alpha: 1 } } }).composite(comp).png().toBuffer());
}
await sharp(out2, { join: { animated: true } }).gif({ delay: out2.map(() => 140), loop: 0 }).toFile(out);
console.log("ok", W, H);
