/**
 * 68회차 자 — 42px 프로필에서 표정이 **구별되나.**
 * (1) 지금 CSS 크롭(scale 1.5, position center 18%)이 실제로 보여 주는 영역을 그대로 잘라 42px 로 줄인다.
 * (2) 여섯 표정끼리 화소 차이(%)를 잰다 — 차이가 작으면 42px 에선 같은 얼굴이다.
 * (3) 그 크롭 안에 눈이 들어오나: 얼굴 상자(살색 화소)의 눈높이(상자 위에서 35~55%)가 크롭 안에 있는지.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
const SHEET = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
const OUT = SHEET + "/faces"; mkdirSync(OUT, { recursive: true });
const EMO = ["neutral", "happy", "shy", "sad", "angry", "surprised"];
const BOX = 42, SCALE = 1.5, POS_Y = 0.18;

async function raw(png: Buffer, w: number, h: number) {
  const { data, info } = await sharp(png).resize(w, h, { kernel: "nearest", fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, ch: info.channels };
}
/** CSS: 42px 상자에 contain 으로 넣고(512→42), scale(1.5) 확대, object-position center 18%. 결과 = 원본의 어느 영역이 보이나. */
function cssWindow(size: number) {
  // contain 후 이미지 42px, scale 1.5 → 63px 가 상자 42px 안에서 중앙 기준으로 확대. 세로 위치 18%: 상자 위쪽에 가깝게.
  const shown = size / SCALE;                 // 원본 기준 보이는 폭
  const x0 = (size - shown) / 2;
  const y0 = (size - shown) * POS_Y;         // object-position Y 를 여백에 곱한 값(대략)
  return { x0: Math.round(x0), y0: Math.round(y0), w: Math.round(shown), h: Math.round(shown) };
}
const isSkin = (r: number, g: number, b: number, a: number) => a > 128 && r > 180 && g > 130 && b > 100 && r > g && g > b && (r - b) > 40;

for (const slug of ["yuna", "seoha", "rin"]) {
  const crops: Buffer[] = [];
  let eyeIn = 0;
  for (const e of EMO) {
    const png = readFileSync(`${SHEET}/${slug}-${e}.png`);
    const meta = await sharp(png).metadata(); const S = meta.width ?? 512;
    // 얼굴 상자: 살색 화소의 경계
    const { data, ch } = await raw(png, 128, 128);
    let top = 128, bot = 0, left = 128, right = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const p = (y * 128 + x) * ch; if (isSkin(data[p], data[p+1], data[p+2], data[p+3])) { top = Math.min(top, y); bot = Math.max(bot, y); left = Math.min(left, x); right = Math.max(right, x); } }
    const eyeY = (top + (bot - top) * 0.45) / 128 * S;
    const win = cssWindow(S);
    if (eyeY >= win.y0 && eyeY <= win.y0 + win.h) eyeIn++;
    const crop = await sharp(png).extract({ left: win.x0, top: win.y0, width: win.w, height: win.h }).resize(BOX, BOX, { kernel: "nearest" }).png().toBuffer();
    crops.push(crop);
    writeFileSync(`${OUT}/${slug}-${e}-css42.png`, crop);
  }
  // 표정끼리 차이: 42px 크롭의 화소 중 색이 다른 비율(배경 제외), 모든 쌍의 최소값
  const raws = await Promise.all(crops.map((c) => raw(c, BOX, BOX)));
  let minDiff = 1, pair = "";
  for (let i = 0; i < EMO.length; i++) for (let j = i + 1; j < EMO.length; j++) {
    const A = raws[i], B = raws[j]; let diff = 0, n = 0;
    for (let p = 0; p < A.data.length; p += A.ch) {
      if (A.data[p+3] < 128 && B.data[p+3] < 128) continue; n++;
      if (Math.abs(A.data[p]-B.data[p]) + Math.abs(A.data[p+1]-B.data[p+1]) + Math.abs(A.data[p+2]-B.data[p+2]) > 60) diff++;
    }
    const d = n ? diff / n : 0; if (d < minDiff) { minDiff = d; pair = `${EMO[i]}↔${EMO[j]}`; }
  }
  console.log(`${slug}: 눈이 크롭 안에 ${eyeIn}/6 · 가장 닮은 두 표정 ${pair} 차이 ${(minDiff*100).toFixed(1)}% ${minDiff >= 0.06 ? "✅" : "❌ (6% 미만이면 42px 에선 같은 얼굴)"}`);
}
// 나란히 보기
const strip = await sharp({ create: { width: BOX * 6 * 2, height: BOX * 3 * 2, channels: 4, background: "#b2c7d9" } })
  .composite((await Promise.all(["yuna","seoha","rin"].flatMap((s, r) => EMO.map(async (e, c) => ({ input: await sharp(readFileSync(`${OUT}/${s}-${e}-css42.png`)).resize(BOX*2, BOX*2, { kernel: "nearest" }).png().toBuffer(), left: c * BOX * 2, top: r * BOX * 2 }))))))
  .png().toBuffer();
writeFileSync(`${OUT}/css42-strip.png`, strip);
console.log("→ faces/css42-strip.png (지금 화면이 보여 주는 42px 얼굴, 2배 확대)");
