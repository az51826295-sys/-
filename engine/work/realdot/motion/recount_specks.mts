// 바뀐 점 자(파란 기운 ≥ 38 · 배경과 거리 < 80 · 투명과 맞닿음)로 1~5바퀴 결과 1배 그림을 다시 센다. 돈 0.
import { readdirSync } from "node:fs";
import sharp from "sharp";
const R = "C:/Users/az518/Desktop/두근도트-스레드/realdot/bench";
const BG = [0xb0, 0xc4, 0xde];
for (const r of ["r1", "r2", "r3", "r4", "r5"]) {
  let total = 0; const where: string[] = [];
  for (const f of readdirSync(`${R}/${r}`).filter((x) => /^[a-z]+(-turn|-walk)?-1x\.png$/.test(x))) {
    const { data, info } = await sharp(`${R}/${r}/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height; let n = 0;
    const near = (i: number) => data[i + 2] - data[i] >= 38 && Math.abs(data[i] - BG[0]) + Math.abs(data[i + 1] - BG[1]) + Math.abs(data[i + 2] - BG[2]) < 80;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (!data[i + 3] || !near(i)) continue; if ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => a < 0 || b < 0 || a >= W || b >= H || !data[(b * W + a) * 4 + 3])) n++; }
    if (n) where.push(`${f.replace("-1x.png", "")} ${n}`); total += n;
  }
  console.log(r, "점", total, where.join(", "));
}
