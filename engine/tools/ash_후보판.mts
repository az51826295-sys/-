/**
 * **후보 그림을 한 장으로 모은다** (10-11). 모델 0 · 값 0.
 *   npx tsx engine/tools/ash_후보판.mts 성기사 암살자
 *
 * 사장님이 고르시는 자리다. 한 장씩 보내면 화면을 여러 번 열어야 하고,
 * 나란히 안 놓으면 "둘 중 어느 쪽"을 눈으로 못 고른다.
 * 줄 = 이름 하나, 칸 = 후보 번호.
 */
import sharp from "sharp";
import { existsSync } from "node:fs";

const 뿌리 = "C:/Users/az518/Desktop/로키-도트/캐릭터";
const 이름들 = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!이름들.length) { console.error("쓸 이름을 적어라: ash_후보판.mts 성기사 암살자"); process.exit(1); }

const 칸 = 300;
const 겹: sharp.OverlayOptions[] = [];
let 줄수 = 0;
for (const 이름 of 이름들) {
  let 열 = 0;
  for (let i = 1; i <= 4; i++) {
    const 길 = `${뿌리}/${이름}/후보-${i}.png`;
    if (!existsSync(길)) continue;
    const b = await sharp(길).resize(칸 - 16, 칸 - 16, { fit: "inside", kernel: "nearest" }).toBuffer();
    겹.push({ input: b, left: 열 * 칸 + 8, top: 줄수 * 칸 + 8 });
    열++;
  }
  if (!열) console.log(`⚠ ${이름} — 후보 그림이 없다`);
  줄수++;
}
const 폭칸 = Math.max(1, ...이름들.map((n) => [1,2,3,4].filter((i) => existsSync(`${뿌리}/${n}/후보-${i}.png`)).length));
const 나갈 = "engine/docs/ui-ask/후보판.png";
await sharp({ create: { width: 칸 * 폭칸, height: 칸 * Math.max(1, 줄수), channels: 4, background: { r: 23, g: 17, b: 31, alpha: 1 } } })
  .composite(겹).png().toFile(나갈);
console.log(`${나갈} — 줄 순서: ${이름들.join(" · ")}`);
