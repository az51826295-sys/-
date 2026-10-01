/** 뽑은 얼굴 셋을 한 장으로 — 결이 같은지 눈으로 본다 (228회차 10-01). 값 0. */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const 키 = ["han", "yun", "park"], 이름 = ["한선호", "윤미래", "박태수"];
const 칸 = 280, 글칸 = 40;
const W = 칸 * 3, H = 칸 + 글칸;
const 장 = await Promise.all(키.map((k) => sharp(`public/lie/${k}.jpg`).resize(칸, 칸).toBuffer()));
const 글 = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
  이름.map((n, i) => `<text x="${칸 * i + 칸 / 2}" y="${칸 + 27}" font-family="Malgun Gothic" font-size="19" font-weight="700" fill="#e8eef6" text-anchor="middle">${n}</text>`).join("") +
  "</svg>";
const 판 = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 13, g: 20, b: 32, alpha: 1 } } })
  .composite([...장.map((b, i) => ({ input: b, left: 칸 * i, top: 0 })), { input: Buffer.from(글), top: 0, left: 0 }])
  .png().toBuffer();
writeFileSync("C:/Users/az518/Desktop/거짓말의온도-얼굴.png", 판);
console.log("→ C:/Users/az518/Desktop/거짓말의온도-얼굴.png");
