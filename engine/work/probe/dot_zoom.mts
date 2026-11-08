/** 린·유나를 크게 본다 — 사장님이 "잘 안 잘림"이라 한 칸. 11-08. */
import sharp from "sharp";
const 밑 = "C:/Users/az518/Desktop/로키-도트/격자고침-20261108";
const 칸 = 470;
const 것들: [string, string][] = [["rin", "neutral"], ["rin", "happy"], ["yuna", "neutral"], ["yuna", "menhera-neutral"]];
const 조각: sharp.OverlayOptions[] = [];
for (let i = 0; i < 것들.length; i++) {
  const [s, e] = 것들[i];
  조각.push({
    input: await sharp(`${밑}/${s}/${e}.png`).resize(칸, 칸, { kernel: "nearest" }).png().toBuffer(),
    left: (i % 2) * 칸,
    top: Math.floor(i / 2) * (칸 + 24) + 24,
  });
}
const svg = `<svg width="${칸 * 2}" height="${(칸 + 24) * 2}"><style>text{font-family:sans-serif;font-size:18px;fill:#fff}</style>` +
  것들.map(([s, e], i) => `<text x="${(i % 2) * 칸 + 6}" y="${Math.floor(i / 2) * (칸 + 24) + 18}">${s} ${e}</text>`).join("") + `</svg>`;
조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
const out = "C:/Users/az518/Desktop/로키-도트/자르기-20261108/_확대.png";
await sharp({ create: { width: 칸 * 2, height: (칸 + 24) * 2, channels: 4, background: { r: 70, g: 70, b: 82, alpha: 1 } } })
  .composite(조각).png().toFile(out);
console.log(out);
