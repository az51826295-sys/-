/** 지금 것 vs 다시 뽑은 것 — 열 명을 나란히. 갈아 끼우기 전에 눈으로 보는 자리. */
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import type { OverlayOptions } from "sharp";
const sharp = (await import("sharp")).default;
const 새것 = "C:/Users/az518/Desktop/로키-도트/다시뽑기2-20261109";
const 사람 = ["doyun", "haru", "jiwoo", "nabi", "rin", "seoha", "soeun", "taeo", "yeonu", "yuna"];
const W = 150, H = 150, 머리 = 20;
const 조각: OverlayOptions[] = [];
let 글 = "";
for (const [i, s] of 사람.entries()) {
  const x = i * W;
  const 옛 = `public/dot-sprites/${s}/neutral.png`;
  const 신 = `${새것}/${s}/neutral.png`;
  조각.push({ input: await sharp(readFileSync(옛)).resize(W, H, { kernel: "nearest" }).png().toBuffer(), left: x, top: 머리 });
  if (existsSync(신)) 조각.push({ input: await sharp(readFileSync(신)).resize(W, H, { kernel: "nearest" }).png().toBuffer(), left: x, top: 머리 * 2 + H });
  글 += `<text x="${x + 4}" y="14">${s}</text>`;
}
글 += `<text x="4" y="${머리 + H + 15}" class="b">↑ 지금   ↓ 다시 뽑은 것 (본: 하루)</text>`;
const 전체W = W * 사람.length, 전체H = 머리 * 2 + H * 2;
조각.push({ input: Buffer.from(`<svg width="${전체W}" height="${전체H}"><style>text{font-family:sans-serif;font-size:13px;fill:#1c1c1c}.b{font-size:12px;fill:#6b5bd2}</style>${글}</svg>`), left: 0, top: 0 });
mkdirSync(새것, { recursive: true });
const out = `${새것}/_견줌.png`;
await sharp({ create: { width: 전체W, height: 전체H, channels: 4, background: { r: 178, g: 199, b: 217, alpha: 1 } } }).composite(조각).png().toFile(out);
console.log(out);
