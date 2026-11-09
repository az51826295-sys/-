/** 새 캐릭터 셋을 한 판에 — 표정 여섯과 얼굴 크롭. */
import { mkdirSync } from "node:fs";
import type { OverlayOptions } from "sharp";
const sharp = (await import("sharp")).default;
const 밑 = "C:/Users/az518/Desktop/두근도트-시트";
const 나갈곳 = "C:/Users/az518/Desktop/로키-도트/새캐릭터-20261109";
mkdirSync(나갈곳, { recursive: true });
const W = 1200, H = 275;
const 조각: OverlayOptions[] = [];
for (const [i, s] of ["taeo", "jiwoo", "soeun"].entries()) {
  조각.push({ input: await sharp(`${밑}/${s}-strip.png`).resize(W, H, { fit: "inside" }).png().toBuffer(), left: 0, top: i * H });
}
const out = `${나갈곳}/_셋.png`;
await sharp({ create: { width: W, height: H * 3, channels: 4, background: { r: 178, g: 199, b: 217, alpha: 1 } } }).composite(조각).png().toFile(out);
console.log(out);
