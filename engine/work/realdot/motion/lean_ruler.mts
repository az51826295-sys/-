// 11-27 "한쪽으로 치우친다" 자(돈 0): 걷기 시트 장마다 아랫몸(이음 줄 아래) 무게중심 x 와 두 발 끝 x 를 기본 그림과 견준다.
//   npx tsx lean_ruler.mts <front.png> <walk-1x.png> <장수> <이음 줄>
import sharp from "sharp";
const [front, sheet, nS, hipS] = process.argv.slice(2); const n = Number(nS), hip = Number(hipS);
const b = await sharp(front).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const s = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cw = Math.floor(s.info.width / n);
const stat = (get: (x: number, y: number) => boolean, w: number, h: number) => {
  let sx = 0, k = 0, bot = -1;
  for (let y = hip; y < h; y++) for (let x = 0; x < w; x++) if (get(x, y)) { sx += x; k++; bot = Math.max(bot, y); }
  let l = 1e9, r = -1; for (let y = bot - 2; y <= bot; y++) for (let x = 0; x < w; x++) if (get(x, y)) { l = Math.min(l, x); r = Math.max(r, x); }
  return { cx: sx / Math.max(1, k), l, r };
};
const base = stat((x, y) => b.data[(y * b.info.width + x) * 4 + 3] > 0, b.info.width, b.info.height);
const fr = [...Array(n).keys()].map((f) => stat((x, y) => s.data[(y * s.info.width + f * cw + x) * 4 + 3] > 0, cw, s.info.height));
const off = fr.map((q) => q.cx - base.cx);
console.log(`기본 아랫몸 중심 ${base.cx.toFixed(1)} · 발 ${base.l}~${base.r}`);
console.log(`장마다 중심 차 ${off.map((v) => v.toFixed(1)).join("/")} · 평균 ${(off.reduce((a, v) => a + v, 0) / n).toFixed(1)}칸 · 발 ${fr.map((q) => `${q.l}~${q.r}`).join(" ")}`);
