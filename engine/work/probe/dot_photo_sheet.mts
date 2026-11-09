/** 사람마다 사진 여덟 장을 한 판에 — 눈으로 보고 쓸지 말지. */
import { readFileSync, existsSync } from "node:fs";
import type { OverlayOptions } from "sharp";
const sharp = (await import("sharp")).default;
const W = 200, H = 250, 머리 = 22;
const 이름들 = ["doyun", "haru", "nabi", "rin", "seoha", "yeonu", "yuna"];
const 칸 = 8;
const 조각: OverlayOptions[] = [];
let 글 = "";
for (const [r, slug] of 이름들.entries()) {
  for (let i = 1; i <= 칸; i++) {
    const p = `public/dot-sprites/${slug}/photo/${i}.png`;
    if (!existsSync(p)) continue;
    조각.push({ input: await sharp(readFileSync(p)).resize(W, H, { kernel: "nearest" }).png().toBuffer(), left: (i - 1) * W, top: 머리 + r * (H + 머리) });
  }
  글 += `<text x="4" y="${머리 + r * (H + 머리) - 6}">${slug}</text>`;
}
const 전체W = W * 칸, 전체H = 머리 + 이름들.length * (H + 머리);
조각.push({ input: Buffer.from(`<svg width="${전체W}" height="${전체H}"><style>text{font-family:sans-serif;font-size:15px;fill:#fff}</style>${글}</svg>`), left: 0, top: 0 });
const out = "C:/Users/az518/Desktop/로키-도트/사진-20261109/_모음.png";
await sharp({ create: { width: 전체W, height: 전체H, channels: 4, background: { r: 18, g: 18, b: 24, alpha: 1 } } }).composite(조각).png().toFile(out);
console.log(out);
