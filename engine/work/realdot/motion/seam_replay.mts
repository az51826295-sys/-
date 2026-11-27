// 11-27 이음 줄 비교(돈 0): walk_try 가 남긴 AI 4장(walk-<tag>-ai.json)을 기본 그림에 다시 섞는다 — 고정 55% 줄 vs 찾은 줄.
// 자: 이음 줄 바로 위아래 두 줄이 장마다 얼마나 어긋나나(윗줄 = 기본 그림, 아랫줄 = AI) — 칠함 여부가 다르면 1, 색만 다르면 0.35
//   npx tsx seam_replay.mts <front.png> <ai.json> <out-prefix>
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
const { hybridWalk } = await import("../../../../src/lib/pixel/rigwalk");
const { sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
const [front, aiJson, outP] = process.argv.slice(2);
const { data, info } = await sharp(front).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const j = JSON.parse(readFileSync(aiJson, "utf8")) as { w: number; h: number; cuts: string[] };
const cuts = j.cuts.map((c) => Buffer.from(c, "base64"));
for (const mode of ["fixed", "found"]) {
  if (mode === "fixed") process.env.PIXEL_SEAM_FIXED = "1"; else delete process.env.PIXEL_SEAM_FIXED;
  const r = hybridWalk({ data, w: info.width, h: info.height }, cuts, j.w, j.h);
  if (!r) { console.log(mode, "섞기 실패"); continue; }
  const hip = Number((r.facts.join(" ").match(/엉덩이 (\d+)/) ?? [])[1]);
  const W = info.width;
  const px = (f: Buffer, x: number, y: number) => (f[(y * W + x) * 4 + 3] ? (f[(y * W + x) * 4] >> 4 << 8) | (f[(y * W + x) * 4 + 1] >> 4 << 4) | (f[(y * W + x) * 4 + 2] >> 4) : -1);
  // 이음 자국: 이음 줄(hip)과 바로 아랫줄(hip+1)이 어긋나는 정도 — 기본 그림 자체의 같은 두 줄 어긋남을 빼서 "원래 그림에 있던 경계"는 세지 않는다
  const rowMiss = (f: Buffer, y: number) => { let m = 0, t = 0; for (let x = 0; x < W; x++) { const a = px(f, x, y), b = px(f, x, y + 1); if (a < 0 && b < 0) continue; t++; if ((a < 0) !== (b < 0)) m += 1; else if (a !== b) m += 0.35; } return t ? m / t : 0; };
  const baseMiss = rowMiss(data, hip);
  const seam = r.frames.map((f) => rowMiss(f, hip) - baseMiss);
  const set = { frames: [], cellW: r.cellW, cellH: r.cellH, bg: null, how: "grid" } as never;
  writeFileSync(`${outP}-${mode}-1x.png`, await sheetOf(r.frames, set));
  writeFileSync(`${outP}-${mode}.gif`, await gifOf(r.frames, set, { scale: 6, ms: 180 }));
  console.log(`${mode.padEnd(5)} 이음 줄 ${hip} · 이음 자국(기본 그림 대비 더 어긋남) ${seam.map((v) => (v * 100).toFixed(0) + "%").join("/")} · ${r.facts.filter((f) => f.startsWith("이음")).join("")}`);
}
