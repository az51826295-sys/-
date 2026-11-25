// 시트의 n번째(0부터) 칸을 크게 잘라 본다. 돈 0.  npx tsx crop_back.mts <sheet> <n> <out>
import sharp from "sharp";
const [p, n, out] = process.argv.slice(2);
const m = await sharp(p).metadata(); const cw = Math.floor(m.width! / 4);
await sharp(p).extract({ left: Number(n) * cw, top: 0, width: cw, height: m.height! }).resize({ height: m.height! * 8, kernel: "nearest" }).flatten({ background: "#ffffff" }).png().toFile(out);
console.log("ok");
