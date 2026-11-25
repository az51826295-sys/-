// 3판 결과를 한 장으로 쌓아 사람 눈으로 본다. 돈 0.
import sharp from "sharp";
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
const xs: { b: Buffer; w: number; h: number }[] = [];
for (const k of ["a", "b", "c"]) {
  const b = await sharp(`${D}/turn3${k}-sheet-1x.png`).resize({ height: 64 * 5, kernel: "nearest" }).png().toBuffer();
  const m = await sharp(b).metadata();
  xs.push({ b, w: m.width!, h: m.height! });
}
const W = Math.max(...xs.map((x) => x.w)), H = xs.reduce((s, x) => s + x.h + 10, 0);
let y = 0;
const comp = xs.map((x) => { const o = { input: x.b, left: 0, top: y }; y += x.h + 10; return o; });
await sharp({ create: { width: W, height: H, channels: 4, background: "#ffffff" } }).composite(comp).png().toFile(`${D}/turn3x-all.png`);
console.log("ok");
