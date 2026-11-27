// 11-27 아랫몸 좌우 대칭(lowerSymmetry) — 누가 뒤집기 6장을 써도 되나(돈 0)
import sharp from "sharp";
const { lowerSymmetry } = await import("../../../../src/lib/pixel/rigwalk");
const D = "C:/Users/az518/Desktop/두근도트-스레드";
for (const n of process.argv.slice(2)) {
  const p = n.includes("/") ? n : `${D}/itch-pack4/${n}/front.png`;
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  console.log(n.split("/").slice(-2).join("/").padEnd(16), lowerSymmetry(data, info.width, info.height).toFixed(2));
}
