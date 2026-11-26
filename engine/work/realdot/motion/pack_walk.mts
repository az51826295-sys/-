// itch 팩 걷기 교체(11-26): makeWalk(섞어 6장 + 다리 문)로. 결과 → itch-pack4/<이름>/ (front.png · walk-1x.png · walk.gif · log)
//   npx tsx engine/work/realdot/motion/pack_walk.mts knight archer ...
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
process.env.PIXEL_MOTION_MOCK = ""; process.env.PIXEL_CREATE_MOCK = "";
const D = "C:/Users/az518/Desktop/두근도트-스레드";
const OUT = `${D}/itch-pack4`; mkdirSync(OUT, { recursive: true });
const BOB = new Set(["slime", "bat"]);
const { makeWalk } = await import("../../../../src/lib/pixel/walk");
const { gifOf } = await import("../../../../src/lib/pixel/frames");
let total = 0;
for (const n of process.argv.slice(2)) {
  // 정면으로 다시 그린 기본 그림(itch-pack3)이 있으면 그것, 없으면 팩2
  const src = existsSync(`${D}/itch-pack3/${n}/front.png`) ? `${D}/itch-pack3/${n}/front.png` : `${D}/itch-pack2/${n}/front.png`;
  const base = readFileSync(src);
  mkdirSync(`${OUT}/${n}`, { recursive: true }); writeFileSync(`${OUT}/${n}/front.png`, base);
  const t0 = Date.now();
  const w = await makeWalk(base, { bob: BOB.has(n) }); total += w.usd;
  const set = { frames: [], cellW: w.cellW, cellH: w.cellH, bg: null, how: "grid" as const };
  const sheet = await sharp({ create: { width: w.cellW * w.frames.length, height: w.cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(w.frames.map((input, i) => ({ input, raw: { width: w.cellW, height: w.cellH, channels: 4 as const }, left: i * w.cellW, top: 0 }))).png().toBuffer();
  writeFileSync(`${OUT}/${n}/walk-1x.png`, sheet);
  writeFileSync(`${OUT}/${n}/walk.gif`, await gifOf(w.frames, set, { scale: Math.max(1, Math.floor(512 / w.cellH)), ms: 140 }));
  const line = `${n} · ${w.how} ${w.frames.length}장 · 판 ${w.tries} · 다리 변화 ${w.spreadDiff}칸 · $${w.usd.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}초 · ${src.includes("pack3") ? "정면 새 그림" : "팩2 그림"}\n   ${w.facts.join(" | ")}`;
  console.log(line); appendFileSync(`${OUT}/log.txt`, line + "\n");
}
console.log(`합계 $${total.toFixed(4)}`); appendFileSync(`${OUT}/log.txt`, `합계 $${total.toFixed(4)}\n`);
