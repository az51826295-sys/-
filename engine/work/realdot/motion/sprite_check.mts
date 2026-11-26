// spriteOf 확인(돈 0): 사이트가 넘기는 8배 그림(big.png) → 1배로 되돌린 것이 front.png 와 칸까지 같은가. 불투명 사진은 null 인가.
import { readFileSync } from "node:fs";
import sharp from "sharp";
const { spriteOf } = await import("../../../../src/lib/pixel/walk");
const R = "C:/Users/az518/Desktop/두근도트-스레드/itch-pack2";
for (const n of ["knight", "priest", "slime"]) {
  const s = await spriteOf(readFileSync(`${R}/${n}/big.png`));
  if (!s) { console.log(n, "null"); continue; }
  const a = await sharp(s).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), b = await sharp(readFileSync(`${R}/${n}/front.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let diff = 0; if (a.info.width === b.info.width) for (let i = 0; i < a.data.length; i += 4) if (a.data.readUInt32LE(i) !== b.data.readUInt32LE(i) && (a.data[i + 3] || b.data[i + 3])) diff++;
  console.log(n, `${a.info.width}×${a.info.height}`, "front", `${b.info.width}×${b.info.height}`, "다른 칸", a.info.width === b.info.width ? diff : "크기 다름");
}
const opaque = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#88aa44" } }).png().toBuffer();
console.log("불투명", await spriteOf(opaque));
