// 11-27 makeWalk 의 섞기 단계만 다시(돈 0): 저장한 AI 4장(walk-<tag>-ai.json)으로 makeWalk 와 같은 고르기·뒤집기를 돌린다
//   npx tsx walk_replay.mts <front.png> <ai.json> <out-prefix>
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
const { hybridWalk, lowerSymmetry } = await import("../../../../src/lib/pixel/rigwalk");
const { sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
const [front, aiJson, outP] = process.argv.slice(2);
const { data, info } = await sharp(front).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const base = { data, w: info.width, h: info.height };
const j = JSON.parse(readFileSync(aiJson, "utf8")) as { w: number; h: number; cuts: string[] };
const cuts = j.cuts.map((c) => Buffer.from(c, "base64"));
const full = hybridWalk(base, cuts, j.w, j.h)!;
const W = info.width, H = info.height;
const sp = full.frames.map((f) => { let bot = -1; for (let y = H - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3]) { bot = y; break; } let l = 1e9, r = -1; for (let y = bot - 2; y <= bot; y++) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3]) { l = Math.min(l, x); r = Math.max(r, x); } return r - l + 1; });
const sym = lowerSymmetry(data, W, H);
const w = sp.indexOf(Math.max(...sp)), half = [w, (w + 1) % 4, (w + 3) % 4];
const h = sym >= 0.8 ? hybridWalk(base, half.map((i) => cuts[i]), j.w, j.h, { mirrorHalf: true })! : full;
const set = { frames: [], cellW: h.cellW, cellH: h.cellH, bg: null, how: "grid" } as never;
writeFileSync(`${outP}-1x.png`, await sheetOf(h.frames, set));
writeFileSync(`${outP}.gif`, await gifOf(h.frames, set, { scale: 6, ms: 180 }));
console.log(`대칭 ${sym.toFixed(2)} · ${h.frames.length}장 · 발 폭 4장 ${sp.join("/")} → ${h.facts.join(" · ")}`);
