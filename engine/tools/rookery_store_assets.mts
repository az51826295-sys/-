/**
 * 로키 스토어 그림 (100회차 09-13) — 피처 그래픽 1024×500 과 아이콘 512 를 `engine/docs/store-rookery/` 에.
 * 글자는 SVG <text> 로 그리고 sharp 가 굽는다. 한글 글꼴은 맑은 고딕(윈도우 기본).
 *   npx tsx engine/tools/rookery_store_assets.mts
 */
import sharp from "sharp";
import { readFileSync, mkdirSync, copyFileSync } from "node:fs";
const OUT = "engine/docs/store-rookery";
mkdirSync(OUT, { recursive: true });
const mark = readFileSync("public/logo/rookery-mark.svg", "utf8").replace(/currentColor/g, "#ffffff");
const markPng = await sharp(Buffer.from(mark)).resize(300, 300, { kernel: "nearest" }).png().toBuffer();

const text = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <rect width="1024" height="500" fill="#0a0a0a"/>
  <rect x="0" y="494" width="1024" height="6" fill="#ffffff"/>
  <text x="400" y="200" font-family="Malgun Gothic, sans-serif" font-size="92" font-weight="700" fill="#ffffff">Rookery</text>
  <text x="404" y="270" font-family="Malgun Gothic, sans-serif" font-size="36" font-weight="700" fill="#ffffff">여러 AI를 지휘해 만들고, 판정까지</text>
  <text x="404" y="330" font-family="Malgun Gothic, sans-serif" font-size="26" fill="#cfcfcf">조사 · 문서 · 앱 · 그림 · 영상</text>
  <text x="404" y="372" font-family="Malgun Gothic, sans-serif" font-size="26" fill="#cfcfcf">승인할수록 예측이 나아집니다</text>
</svg>`;
await sharp(Buffer.from(text)).composite([{ input: markPng, left: 60, top: 100 }]).png().toFile(`${OUT}/feature-graphic-1024x500.png`);
copyFileSync("public/rookery-icon-512.png", `${OUT}/icon-512.png`);
const m = await sharp(`${OUT}/feature-graphic-1024x500.png`).metadata();
console.log(`feature ${m.width}×${m.height} · icon 512 복사 → ${OUT}`);
