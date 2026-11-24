import { readFileSync } from "node:fs";
import sharp from "sharp";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
for (const n of ["han-strip", "han-sheet", "park-sheet"]) {
  const f = `C:/Users/az518/Desktop/두근도트-시트/lie/${n}.png`; const m = await sharp(f).metadata();
  let r = "auto: "; try { const x = await realDot(readFileSync(f)); r += `${x.period} ${x.logical}`; } catch (e) { r += "없음"; }
  console.log(n, m.width, m.height, r);
}
