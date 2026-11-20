// 잠근 문턱(머리 쪽 ≤ 24) 검증 — likeness.mts 와 같은 셈.
import { readFileSync } from "node:fs";
import sharp from "sharp";
async function 작게(png: Buffer) { const t = await sharp(png).ensureAlpha().trim({ threshold: 1 }).toBuffer(); return (await sharp(t).resize(32, 40, { fit: "fill", kernel: "cubic" }).flatten({ background: "#808080" }).raw().toBuffer({ resolveWithObject: true })).data; }
async function 머리거리(a: Buffer, b: Buffer) { const A = await 작게(a), B = await 작게(b); let s = 0, n = 0; for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) { const p = (y * 32 + x) * 3; s += Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]); n++; } return s / n / 3; }
let 맞음 = 0;
for (const [seat, slug, 예측] of [["flare-low", "soeun", "같음"], ["img2-medium", "soeun", "벗어남"], ["flare-low", "taeo", "같음"], ["img2-medium", "taeo", "벗어남"]] as const) {
  const d = await 머리거리(readFileSync(`engine/work/director-art/verify/${seat}-${slug}-neutral.png`), readFileSync(`public/dot-sprites/${slug}/neutral.png`));
  const 판 = d <= 24 ? "같음" : "벗어남"; if (판 === 예측) 맞음++;
  console.log(`${판 === 예측 ? "✅" : "❌"} ${seat} ${slug}: ${d.toFixed(1)} → ${판} (예측 ${예측})`);
}
console.log(`${맞음}/4`);
