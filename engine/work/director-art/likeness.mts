// 시험: 받아들인 그 사람 그림과 얼마나 닮았나 — 잉크 상자에 맞춰 작게 줄여 칸마다 색 거리.
import { readFileSync } from "node:fs";
import sharp from "sharp";
const { 있는사람 } = await import("../../../src/lib/dot/charStandard");
async function 작게(png: Buffer, w = 32, h = 40) {
  const t = await sharp(png).ensureAlpha().trim({ threshold: 1 }).toBuffer();
  const { data } = await sharp(t).resize(w, h, { fit: "fill", kernel: "cubic" }).flatten({ background: "#808080" }).raw().toBuffer({ resolveWithObject: true });
  return data;
}
async function 거리(a: Buffer, b: Buffer, 위만 = false) {
  const A = await 작게(a), B = await 작게(b); let s = 0, n = 0;
  const rows = 위만 ? 20 : 40;
  for (let y = 0; y < rows; y++) for (let x = 0; x < 32; x++) { const p = (y * 32 + x) * 3; s += Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]); n++; }
  return s / n / 3;
}
const 원본 = readFileSync("public/dot-sprites/yuna/neutral.png");
console.log("vs 받아들인 yuna (전체 / 위 절반=머리)");
for (const s of 있는사람().filter((x) => x !== "yuna")) { const p = readFileSync(`public/dot-sprites/${s}/neutral.png`); console.log(`  다른 사람 ${s.padEnd(6)} ${(await 거리(p, 원본)).toFixed(1)} / ${(await 거리(p, 원본, true)).toFixed(1)}`); }
for (const s of ["flare-low", "flare-medium", "sunburst-medium", "img2-medium"]) { const p = readFileSync(`engine/work/director-art/screen/${s}-yuna-neutral.png`); console.log(`  시험 ${s.padEnd(16)} ${(await 거리(p, 원본)).toFixed(1)} / ${(await 거리(p, 원본, true)).toFixed(1)}`); }
