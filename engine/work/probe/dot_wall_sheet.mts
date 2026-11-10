/** 열 명 배경을 한 장으로 — 눈으로 보는 자리. */
import { readFileSync } from "node:fs";
import type { OverlayOptions } from "sharp";
const sharp = (await import("sharp")).default;
const 사람 = [["doyun","도윤"],["haru","하루"],["jiwoo","지우"],["nabi","나비"],["rin","린"],["seoha","서하"],["soeun","소은"],["taeo","태오"],["yeonu","연우"],["yuna","유나"]];
const W = 160, H = 240, 머리 = 18, 열 = 5;
const 조각: OverlayOptions[] = []; let 글 = "";
for (const [i, [slug, 이름]] of 사람.entries()) {
  const x = (i % 열) * W, y = Math.floor(i / 열) * (H + 머리) + 머리;
  조각.push({ input: readFileSync(`public/wallpapers/char/${slug}.png`), left: x, top: y });
  글 += `<text x="${x + 4}" y="${y - 5}">${이름}</text>`;
}
const 전체W = W * 열, 전체H = (H + 머리) * 2;
조각.push({ input: Buffer.from(`<svg width="${전체W}" height="${전체H}"><style>text{font-family:sans-serif;font-size:12px;fill:#1c1c1c}</style>${글}</svg>`), left: 0, top: 0 });
const out = "engine/work/배경-10장.png";
await sharp({ create: { width: 전체W, height: 전체H, channels: 4, background: { r: 240, g: 238, b: 232, alpha: 1 } } }).composite(조각).png().toFile(out);
console.log(out);
