// 섞어 걷기 시험(11-26): 그림 AI 는 다리만(큰 걸음), 나머지는 기본 그림 — 한 판 약 25~30원.
//   npx tsx engine/work/realdot/motion/hybrid_test.mts knight        (4장 한 바퀴)
//   HALF=1 npx tsx ...hybrid_test.mts knight                         (반 바퀴 3장 + 좌우 뒤집기 = 6장)
//   REUSE=1 ...  이미 산 AI 다리 시트로 다시 섞기(돈 0)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
process.env.PIXEL_MOTION_MOCK = ""; process.env.PIXEL_NO_CALM = "1"; // 다리 프레임은 날것으로 받는다(윗몸은 어차피 기본 그림)
const name = process.argv[2] || "knight";
const HALF = !!process.env.HALF, N = HALF ? 3 : 4;
const R = "C:/Users/az518/Desktop/두근도트-스레드/itch-pack2";
mkdirSync(`${R}/rig`, { recursive: true });
const { makeMotion, sheetOf } = await import("../../../../src/lib/pixel/motion");
const { hybridWalk } = await import("../../../../src/lib/pixel/rigwalk");
const basePng = readFileSync(`${R}/${name}/front.png`);
const legsSheet = `${R}/rig/${name}-ai-legs${N}-1x.png`;
const ACTION = HALF
  ? "half of a walk cycle seen from the front, walking toward the viewer — frame 1: LEFT foot planted forward and outward, legs wide apart; frame 2: weight on the left foot, RIGHT foot lifted off the ground behind it; frame 3: RIGHT leg swinging forward past the left leg, right foot lifted and knee bent. The legs must clearly change in every frame."
  : "walking toward the viewer with big, clearly visible steps — frame 1: left foot stepping forward and outward, knee bent; frame 2: legs passing together, one foot lifted; frame 3: right foot stepping forward and outward, knee bent; frame 4: legs passing together, other foot lifted. The legs must visibly change in every frame.";
const t0 = Date.now();
let cuts: Buffer[], cw: number, ch: number;
if (process.env.REUSE) {
  // FROM4=0,1,2 : 4장 한 바퀴 시트에서 골라 반 바퀴로(HALF 와 같이)
  const pick = process.env.FROM4?.split(",").map(Number);
  const sheetN = pick ? 4 : N, path = pick ? `${R}/rig/${name}-ai-legs4-1x.png` : legsSheet;
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  cw = Math.floor(info.width / sheetN); ch = info.height;
  const all = [...Array(sheetN).keys()].map((f) => { const b = Buffer.alloc(cw * ch * 4); for (let y = 0; y < ch; y++) data.copy(b, y * cw * 4, (y * info.width + f * cw) * 4, (y * info.width + (f + 1) * cw) * 4); return b; });
  cuts = pick ? pick.map((i) => all[i]) : all;
} else {
  const m = await makeMotion(basePng, "custom", { action: ACTION, frames: N });
  console.log("AI 다리", m.ok, `$${m.usd.toFixed(4)}`, `${((Date.now() - t0) / 1000).toFixed(0)}초`, m.ok ? m.check.facts.slice(0, 4).join(" | ") : m.reason);
  if (!m.ok) process.exit(0);
  writeFileSync(legsSheet, await sheetOf(m.cuts, m.set));
  cuts = m.cuts; cw = m.set.cellW; ch = m.set.cellH;
}
const { data, info } = await sharp(basePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const h = hybridWalk({ data, w: info.width, h: info.height }, cuts, cw, ch, { mirrorHalf: HALF });
if (!h || !h.frames.length) { console.log("섞기 실패", h?.facts.join(" · ") ?? "다리 못 찾음"); process.exit(0); }
console.log("섞기", h.facts.join(" · "));
const sheet = await sharp({ create: { width: h.cellW * h.frames.length, height: h.cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(h.frames.map((input, i) => ({ input, raw: { width: h.cellW, height: h.cellH, channels: 4 as const }, left: i * h.cellW, top: 0 }))).png().toBuffer();
writeFileSync(`${R}/rig/${name}-hybrid${h.frames.length}-walk-1x.png`, sheet);
console.log("ok", h.frames.length, "장");
