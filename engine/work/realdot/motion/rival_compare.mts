// 같은 기사: 우리(그림 AI 걷기 · 코드 걷기) vs 픽셀랩(걷기 정면·옆) — 한 화면 영상 + 숫자. 돈 0.
import { readdirSync } from "node:fs";
import sharp from "sharp";
const name = process.argv[2] || "knight";
const OURS = `C:/Users/az518/Desktop/두근도트-스레드/itch-pack2`;
const RIV = `C:/Users/az518/Desktop/두근도트-스레드/rival/${name}/zip/Idle`;
const OUT = `C:/Users/az518/Desktop/두근도트-스레드/rival/${name}`;
type Clip = { label: string; color: string; frames: { data: Buffer; w: number; h: number }[] };
const raw = async (b: Buffer | string) => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
async function fromSheet(p: string, n = 4) { const m = await sharp(p).metadata(); const cw = Math.floor(m.width! / n); return Promise.all([...Array(n).keys()].map(async (f) => raw(await sharp(p).extract({ left: f * cw, top: 0, width: cw, height: m.height! }).png().toBuffer()))); }
async function fromDir(d: string) { return Promise.all(readdirSync(d).filter((f) => f.endsWith(".png")).sort().map((f) => raw(`${d}/${f}`))); }
const clips: Clip[] = [
  { label: "우리: 그림AI 걷기", color: "#aaa", frames: await fromSheet(`${OURS}/${name}/walk-1x.png`) },
  { label: "우리: 코드 걷기", color: "#8fe", frames: await fromSheet(`${OURS}/rig/${name}-walk-1x.png`) },
  { label: "픽셀랩: 정면", color: "#fc8", frames: await fromDir(`${RIV}/animations/walking/south`) },
  { label: "픽셀랩: 옆", color: "#fc8", frames: await fromDir(`${RIV}/animations/walking/east`) },
];
// 숫자: 칠한 키·발 폭·머리(위 35%) 바뀐 비율·몸 위아래
for (const c of clips) {
  const stats = c.frames.map(({ data, w, h }) => { let top = -1, bot = -1, l = 1e9, r = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) { if (top < 0) top = y; bot = y; l = Math.min(l, x); r = Math.max(r, x); } let fl = 1e9, fr = -1; for (let y = bot - 2; y <= bot; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) { fl = Math.min(fl, x); fr = Math.max(fr, x); } return { top, bot, h: bot - top + 1, foot: fr - fl + 1 }; });
  const head = (a: typeof c.frames[0], b: typeof c.frames[0], ta: number, tb: number, hh: number) => { let n = 0, k = 0; const rows = Math.floor(hh * 0.35); for (let y = 0; y < rows; y++) for (let x = 0; x < Math.min(a.w, b.w); x++) { const ya = ta + y, yb = tb + y; if (ya >= a.h || yb >= b.h) continue; const i = (ya * a.w + x) * 4, j = (yb * b.w + x) * 4; const ua = a.data[i + 3] > 0, ub = b.data[j + 3] > 0; if (!ua && !ub) continue; n++; if (ua !== ub || Math.abs(a.data[i] - b.data[j]) + Math.abs(a.data[i + 1] - b.data[j + 1]) + Math.abs(a.data[i + 2] - b.data[j + 2]) > 60) k++; } return n ? k / n : 0; };
  let hm = 0; for (let f = 0; f < c.frames.length; f++) { const g = (f + 1) % c.frames.length; hm = Math.max(hm, head(c.frames[f], c.frames[g], stats[f].top, stats[g].top, stats[f].h)); }
  const tops = stats.map((s) => s.top), feet = stats.map((s) => s.foot);
  console.log(`${c.label.padEnd(14)} 프레임 ${c.frames.length} · 키 ${stats.map((s) => s.h).join("/")} · 몸 위아래 ${Math.max(...tops) - Math.min(...tops)}칸 · 발 폭 ${Math.min(...feet)}~${Math.max(...feet)} (차 ${Math.max(...feet) - Math.min(...feet)}) · 머리 바뀜 최대 ${(hm * 100).toFixed(0)}% · 캔버스 ${c.frames[0].w}×${c.frames[0].h}`);
}
// 영상: 12장(4·6 의 공배수), 칸마다 같은 크기로 키우고 발을 바닥선에
const S = 4, CW = 130 * S / 2, CH = 120 * S / 2 + 10;
const scaleOf = (c: Clip) => Math.max(1, Math.floor((CH - 40) / Math.max(...c.frames.map((f) => f.h))));
const W = CW * clips.length, H = CH + 40;
const out: Buffer[] = [];
for (let t = 0; t < 12; t++) {
  const comp: sharp.OverlayOptions[] = [];
  for (const [i, c] of clips.entries()) {
    const f = c.frames[t % c.frames.length], k = scaleOf(c);
    const img = await sharp(f.data, { raw: { width: f.w, height: f.h, channels: 4 } }).resize(f.w * k, f.h * k, { kernel: "nearest" }).png().toBuffer();
    comp.push({ input: img, left: i * CW + Math.max(0, Math.round((CW - f.w * k) / 2)), top: Math.max(0, CH - f.h * k) });
    comp.push({ input: Buffer.from(`<svg width="${CW}" height="34"><text x="${CW / 2}" y="24" text-anchor="middle" font-size="20" font-family="sans-serif" fill="${c.color}">${c.label}</text></svg>`), left: i * CW, top: CH + 4 });
  }
  out.push(await sharp({ create: { width: W, height: H, channels: 4, background: { r: 60, g: 63, b: 70, alpha: 1 } } }).composite(comp).png().toBuffer());
}
await sharp(out, { join: { animated: true } }).gif({ delay: out.map(() => 120), loop: 0 }).toFile(`${OUT}/rival-walk.gif`);
// 4방향도 나란히: 우리 turn-1x vs 픽셀랩 rotations(남·동·북·서)
const ours4 = await fromSheet(`${OURS}/${name}/turn-1x.png`);
const riv4 = await Promise.all(["south", "east", "north", "west"].map((d) => raw(`${RIV}/rotations/${d}.png`)));
const row = async (fr: typeof ours4, y: number, k: number) => Promise.all(fr.map(async (f, i) => ({ input: await sharp(f.data, { raw: { width: f.w, height: f.h, channels: 4 } }).resize(f.w * k, f.h * k, { kernel: "nearest" }).png().toBuffer(), left: 150 + i * 70 * k, top: y })));
const k4 = 4;
const comp4 = [...(await row(ours4, 10, k4)), ...(await row(riv4, 10 + 80 * k4, k4)),
  { input: Buffer.from(`<svg width="150" height="40"><text x="6" y="28" font-size="22" font-family="sans-serif" fill="#8fe">우리</text></svg>`), left: 0, top: 10 + 30 * k4 },
  { input: Buffer.from(`<svg width="150" height="40"><text x="6" y="28" font-size="22" font-family="sans-serif" fill="#fc8">픽셀랩</text></svg>`), left: 0, top: 10 + 110 * k4 }];
await sharp({ create: { width: 150 + 4 * 70 * k4, height: 20 + 160 * k4, channels: 4, background: { r: 60, g: 63, b: 70, alpha: 1 } } }).composite(comp4).png().toFile(`${OUT}/rival-4dir.png`);
console.log("ok");
