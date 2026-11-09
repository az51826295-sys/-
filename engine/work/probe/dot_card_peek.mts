/** 그린 카드를 네 배로 키워 눈으로 본다. */
import { readdirSync, existsSync, mkdirSync } from "node:fs";
import type { OverlayOptions } from "sharp";
const sharp = (await import("sharp")).default;
const 밑 = "public/dot-tarot";
const 나갈곳 = "C:/Users/az518/Desktop/로키-도트/타로-20261109";
mkdirSync(나갈곳, { recursive: true });
if (!existsSync(밑)) { console.log("아직 그린 카드가 없다"); process.exit(0); }
const 파일 = readdirSync(밑).filter((f) => f.endsWith(".png")).sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));
const W = 200, H = 280, 열 = Math.min(6, 파일.length);
const 줄 = Math.ceil(파일.length / 열);
const 조각: OverlayOptions[] = [];
for (const [i, f] of 파일.entries()) {
  조각.push({ input: await sharp(`${밑}/${f}`).resize(W, H, { kernel: "nearest" }).png().toBuffer(), left: (i % 열) * W, top: Math.floor(i / 열) * H });
}
const out = `${나갈곳}/_카드.png`;
await sharp({ create: { width: W * 열, height: H * 줄, channels: 4, background: { r: 16, g: 14, b: 24, alpha: 1 } } }).composite(조각).png().toFile(out);
console.log(`${파일.length}장 → ${out}`);
