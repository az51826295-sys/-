// 결 자 둘째 시도 — 개발 묶음(이미 본 8장)에서 방법 고르기. 판정은 새 그림으로 따로.
// M1 얼굴: 운영 faceCrop 으로 얼굴만 잘라 24×24 색 거리 (무표정)
// M2 여섯 칸: 감정 여섯 칸 각각 받아들인 그 칸과 머리 쪽 거리, 평균
import { readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
const { cutSheet, pixelize, dropToBaseline } = await import("../../../src/lib/dot/sprites");
const { outlineSprite } = await import("../../../src/lib/dot/outline");
const { 격자, 감정 } = await import("../../../src/lib/dot/charStandard");
const { faceCrop } = await import("../../tools/dot_faces_lib");
export async function 작게(png: Buffer, w: number, h: number, trim = true) { const t = trim ? await sharp(png).ensureAlpha().trim({ threshold: 1 }).toBuffer() : png; return (await sharp(t).resize(w, h, { fit: "fill", kernel: "cubic" }).flatten({ background: "#808080" }).raw().toBuffer({ resolveWithObject: true })).data; }
export function 거리(A: Buffer, B: Buffer, w: number, rows: number) { let s = 0, n = 0; for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) { const p = (y * w + x) * 3; s += Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]); n++; } return s / n / 3; }
export async function 칸들(sheetPath: string) {
  const cells = await cutSheet("data:image/png;base64," + readFileSync(sheetPath).toString("base64"));
  return Promise.all(cells.map(async (c) => ({ emotion: c.emotion, png: await dropToBaseline((await outlineSprite(await pixelize(c.png, 격자), 512 / 격자, { 식: "한색", 색: [255, 255, 255] }, 1)).png) })));
}
export async function M1(cells: { emotion: string; png: Buffer }[], slug: string) {
  const a = await faceCrop(cells.find((c) => c.emotion === "neutral")!.png), b = await faceCrop(readFileSync(`public/dot-sprites/${slug}/neutral.png`));
  return 거리(await 작게(a, 24, 24, false), await 작게(b, 24, 24, false), 24, 24);
}
export async function M2(cells: { emotion: string; png: Buffer }[], slug: string) {
  let s = 0, n = 0;
  for (const e of 감정) { const p = `public/dot-sprites/${slug}/${e}.png`; const c = cells.find((x) => x.emotion === e); if (!c || !existsSync(p)) continue; s += 거리(await 작게(c.png, 32, 40), await 작게(readFileSync(p), 32, 40), 32, 20); n++; }
  return s / n;
}
if (process.argv[1]?.includes("style_dev")) {
  const 묶음 = [["screen", "flare-low", "yuna"], ["screen", "flare-medium", "yuna"], ["screen", "sunburst-medium", "yuna"], ["screen", "img2-medium", "yuna"],
    ["verify", "flare-low", "soeun"], ["verify", "img2-medium", "soeun"], ["verify", "flare-low", "taeo"], ["verify", "img2-medium", "taeo"]];
  for (const [판, seat, slug] of 묶음) {
    const cells = await 칸들(`engine/work/director-art/${판}/${seat}-${slug}-sheet.png`);
    console.log(`${seat.padEnd(16)} ${slug.padEnd(6)} 눈:${seat.startsWith("img2") ? "벗어남" : "같음  "}  M1 얼굴 ${(await M1(cells, slug)).toFixed(1)}  M2 여섯칸 ${(await M2(cells, slug)).toFixed(1)}`);
  }
}
