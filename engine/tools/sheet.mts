/** 폴더의 그림을 한 장에 모아 눈으로 본다. 투명한 것은 체크무늬 위에 올려 **안 지워진 바탕**이 보이게. */
import sharp from "sharp";
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const 칸 = process.argv[2];
const 나올곳 = process.argv[3] ?? `${칸}/_모음.png`;
const 한칸 = 240, 줄 = 4;
const 들 = readdirSync(칸).filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith("_")).sort();
const 세로줄 = Math.ceil(들.length / 줄);
const W = 줄 * 한칸, H = 세로줄 * (한칸 + 26);

// 체크무늬 바탕 — 투명한 자리가 눈에 보여야 "안 지워졌다" 를 알 수 있다.
const 체크 = Buffer.from(
  `<svg width="${W}" height="${H}"><defs><pattern id="c" width="24" height="24" patternUnits="userSpaceOnUse">` +
  `<rect width="24" height="24" fill="#2a2a2a"/><rect width="12" height="12" fill="#3a3a3a"/>` +
  `<rect x="12" y="12" width="12" height="12" fill="#3a3a3a"/></pattern></defs>` +
  `<rect width="${W}" height="${H}" fill="url(#c)"/></svg>`);

const 겹칠것: sharp.OverlayOptions[] = [];
for (const [i, f] of 들.entries()) {
  const x = (i % 줄) * 한칸, y = Math.floor(i / 줄) * (한칸 + 26);
  const 그림 = await sharp(join(칸, f)).resize(한칸 - 16, 한칸 - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  겹칠것.push({ input: 그림, left: x + 8, top: y + 8 });
  겹칠것.push({ input: Buffer.from(`<svg width="${한칸}" height="24"><text x="${한칸 / 2}" y="17" font-family="Malgun Gothic,sans-serif" font-size="15" fill="#ddd" text-anchor="middle">${f.replace(/\.(png|jpe?g)$/i, "")}</text></svg>`), left: x, top: y + 한칸 });
}
mkdirSync(나올곳.slice(0, 나올곳.lastIndexOf("/")), { recursive: true });
await sharp(체크).composite(겹칠것).png().toFile(나올곳);
console.log(`${들.length}장 → ${나올곳}`);
