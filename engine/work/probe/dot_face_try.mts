/** 새 얼굴 크롭을 **한 명에게만** 대 본다 — 눈으로 보고 자로 재기 전에 되돌릴 수 있게. */
import { readFileSync, writeFileSync } from "node:fs";
import { faceCrop } from "../../tools/dot_faces_lib";
const 사람 = process.argv[2] ?? "rin";
const 감정 = ["neutral", "happy", "shy", "sad", "angry", "surprised"];
const sharp = (await import("sharp")).default;
const 조각 = [];
for (const [i, e] of 감정.entries()) {
  const src = `public/dot-sprites/${사람}/${e}.png`;
  const face = await faceCrop(readFileSync(src));
  writeFileSync(`engine/work/face-new-${사람}-${e}.png`, face);
  const m = await sharp(face).metadata();
  if (i === 0) console.log(`새 얼굴 ${m.width}x${m.height}`);
  조각.push({ input: await sharp(face).resize(192, 192, { kernel: "nearest" }).png().toBuffer(), left: i * 196, top: 4 });
  조각.push({ input: await sharp(readFileSync(`public/dot-sprites/${사람}/face/${e}.png`)).resize(192, 192, { kernel: "nearest" }).png().toBuffer(), left: i * 196, top: 204 });
}
await sharp({ create: { width: 196 * 6, height: 400, channels: 4, background: { r: 24, g: 20, b: 36, alpha: 1 } } })
  .composite(조각).png().toFile(`engine/work/얼굴-새것vs옛것.png`);
console.log("engine/work/얼굴-새것vs옛것.png (위: 새것 · 아래: 옛것)");
