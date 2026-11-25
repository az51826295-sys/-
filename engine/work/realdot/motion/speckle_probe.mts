// 용 4방향 1배에 박힌 검은 점 — 원인 찾기. 돈 0. 외톨이 어두운 칸(네 이웃이 다 밝은데 혼자 어두운 칸) 수를 센다.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
const raw = readFileSync(`${D}/turn-raw.png`);
async function speck(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const lum = (x: number, y: number) => { if (x < 0 || y < 0 || x >= info.width || y >= info.height) return -1; const i = (y * info.width + x) * 4; return data[i + 3] ? 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2] : -1; };
  let k = 0, n = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const l = lum(x, y); if (l < 0) continue; n++; const nb = [lum(x - 1, y), lum(x + 1, y), lum(x, y - 1), lum(x, y + 1)]; if (l < 60 && nb.every((v) => v > 90)) k++; }
  return `${info.width}×${info.height} · 외톨이 어두운 칸 ${k}/${n}`;
}
const base = await realDot(raw);
console.log("지금(mode)", base.period, await speck(base.small));
const med = await realDot(raw, { cell: "median" });
console.log("median", med.period, await speck(med.small));
writeFileSync(`${D}/probe-mode.png`, base.big); writeFileSync(`${D}/probe-median.png`, med.big);
for (const p of [base.period[0] * 0.98, base.period[0] * 1.02, base.period[0] * 1.5, base.period[0] * 2]) {
  const r = await realDot(raw, { period: p });
  console.log(`period ${p.toFixed(2)}`, await speck(r.small));
}
// 처음 만든 용(혼자 그린 그림)도 같은 자로
const one = await realDot(readFileSync(`${D}/raw.png`));
console.log("용 혼자", one.period, await speck(one.small));
