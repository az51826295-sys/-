import { readFileSync } from "node:fs";
import sharp from "sharp";
import { realDot } from "../../../../src/lib/pixel/realdot";
import { findFrames, cutFrames } from "../../../../src/lib/pixel/frames";
const D = "C:/Users/az518/Desktop/두근도트-시트", N = ["haru", "jiwoo", "nabi", "soeun", "taeo", "yeonu"];
const L = 5; // 채널당 5단계 → 125칸
const histOfPixels = (px: number[][]) => { const h = new Float64Array(L ** 3); for (const p of px) h[Math.min(L - 1, (p[0] * L) >> 8) * L * L + Math.min(L - 1, (p[1] * L) >> 8) * L + Math.min(L - 1, (p[2] * L) >> 8)]++; const s = px.length || 1; return h.map((v) => v / s); };
const inter = (a: Float64Array, b: Float64Array) => a.reduce((s, v, i) => s + Math.min(v, b[i]), 0);
async function refHist(n: string) { const r = await realDot(readFileSync(`${D}/${n}-neutral.png`)); const { data } = await sharp(r.small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cnt = new Map<number, number>(); const px: number[][] = []; for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) { px.push([data[i], data[i + 1], data[i + 2]]); const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  const [bk, bn] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]; const bg = bn > px.length * 0.4 ? [(bk >> 16) & 255, (bk >> 8) & 255, bk & 255] : null;
  return histOfPixels(bg ? px.filter((p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) >= 30) : px); }
async function frameHists(n: string) { const src = await sharp(`${D}/${n}-strip.png`).extract({ left: 0, top: 0, width: 1024, height: 250 }).png().toBuffer();
  try { const r = await realDot(src); const set = await findFrames(r.small); const cuts = await cutFrames(r.small, set); return cuts.map((c) => { const px: number[][] = []; for (let i = 0; i < c.length; i += 4) if (c[i + 3]) px.push([c[i], c[i + 1], c[i + 2]]); return histOfPixels(px); }); } catch { return null; } }
const refs = await Promise.all(N.map(refHist)); const fr = await Promise.all(N.map(frameHists));
console.log("참조\목  " + N.map((n) => n.padStart(6)).join(""));
N.forEach((rn, i) => console.log(rn.padEnd(8) + N.map((_, j) => fr[j] ? Math.min(...fr[j]!.map((h) => inter(refs[i], h))).toFixed(2).padStart(6) : "   -  ").join("")));
