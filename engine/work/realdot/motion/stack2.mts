// 두 시트를 위아래로(같은 배율 5) — 위 high · 아래 medium. 돈 0.
import sharp from "sharp";
const [a, b, out] = process.argv.slice(2);
const A = await sharp(a).metadata(), B = await sharp(b).metadata(), S = 5;
const ia = await sharp(a).resize(A.width! * S, A.height! * S, { kernel: "nearest" }).png().toBuffer();
const ib = await sharp(b).resize(B.width! * S, B.height! * S, { kernel: "nearest" }).png().toBuffer();
await sharp({ create: { width: Math.max(A.width!, B.width!) * S, height: (A.height! + B.height!) * S + 30, channels: 4, background: "#ffffff" } }).composite([{ input: ia, left: 0, top: 0 }, { input: ib, left: 0, top: A.height! * S + 30 }]).png().toFile(out);
console.log("ok");
