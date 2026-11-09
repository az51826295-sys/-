/**
 * # 말풍선 옆 **얼굴**도 테두리 판으로 다시 자른다  (11-09)
 *
 *   npx tsx engine/tools/dot_faces_outline.mts          ← 재기만
 *   npx tsx engine/tools/dot_faces_outline.mts --fix    ← public/dot-sprites/<이름>/face/ 덮어쓰기
 *
 * ## 왜 이게 빠지면 헛일인가
 *
 * 사장님이 테두리를 말한 자리는 **"얼굴 표정 사용하면"** 이었다. 채팅에서 말풍선 옆에 뜨는
 * 그 동그란 얼굴은 큰 스프라이트가 아니라 **`face/` 의 96px 크롭**이다(`DotChat.tsx` 의 `kk-face`).
 * 큰 것만 테두리를 둘러 놓으면 **사장님이 보는 자리는 그대로**다.
 *
 * 크롭은 `faceCrop` 이 하던 그대로 한다 — 재료만 테두리 판으로 바꾼다.
 *
 * ## 문은 "35~65%" 가 아니라 "**전보다 나빠졌나**"
 *
 * 처음엔 `faceCropCheck` 의 절대 기준(얼굴 가운데가 35~65% · 살색 12% 이상)을 문으로 썼다.
 * 그랬더니 42개 중 22개가 어긋남인데 — **지금 앱에 올라가 있는 얼굴도 똑같이 어긋남**이었다
 * (린 여섯 전부, 도윤 여섯 전부). 사장님이 쓰고 있는 쪽이 떨어지는 자는 문으로 못 쓴다
 * ([[palette-overlap-is-not-style]]). 그래서 **전/후 차이**를 본다: 얼굴 가운데가 3%p 넘게
 * 밀렸거나 살색이 3%p 넘게 줄면 안 쓴다. 절대값은 참고로만 적는다.
 */
/** 전/후로 이만큼 넘게 움직이면 테두리가 크롭을 망친 것이다. */
const 허용 = 0.03;
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const sharp = (await import("sharp")).default;
const { faceCrop, faceCropCheck } = await import("./dot_faces_lib");

const 고칠까 = process.argv.includes("--fix");
const EMO = ["neutral", "happy", "shy", "sad", "angry", "surprised"];
const 밑 = "public/dot-sprites";
const 이름들 = ["doyun", "haru", "nabi", "rin", "seoha", "yeonu", "yuna"];

console.log(`얼굴 다시 자르기 — 재료는 테두리 두른 큰 그림\n이름    표정        전(가운데/살색)   후(가운데/살색)   판정`);
let 좋음 = 0; const 나쁨: string[] = [];
const 새것: { 길: string; png: Buffer }[] = [];
for (const slug of 이름들) {
  for (const e of EMO) {
    const 큰것 = join(밑, slug, `${e}.png`);
    const 얼굴길 = join(밑, slug, "face", `${e}.png`);
    if (!existsSync(큰것) || !existsSync(얼굴길)) { console.log(`${slug.padEnd(7)} ${e.padEnd(10)} 파일이 없다`); continue; }
    const 전 = await faceCropCheck(readFileSync(얼굴길));
    const 새 = await faceCrop(readFileSync(큰것));
    const 후 = await faceCropCheck(새);
    const 밀림 = Math.abs(후.centerY - 전.centerY), 줄음 = 전.skinRatio - 후.skinRatio;
    const 안망침 = 밀림 <= 허용 && 줄음 <= 허용;
    const 판정 = 안망침 ? `그대로(${(밀림 * 100).toFixed(1)}%p)` : `밀림 ${(밀림 * 100).toFixed(1)}%p`;
    if (안망침) 좋음++; else 나쁨.push(`${slug} ${e}`);
    새것.push({ 길: 얼굴길, png: 새 });
    console.log(
      `${slug.padEnd(7)} ${e.padEnd(10)} ${(전.centerY * 100).toFixed(0).padStart(3)}% / ${(전.skinRatio * 100).toFixed(0).padStart(2)}%` +
      `        ${(후.centerY * 100).toFixed(0).padStart(3)}% / ${(후.skinRatio * 100).toFixed(0).padStart(2)}%        ${판정}`,
    );
  }
}
console.log(`\n자리 맞는 얼굴 ${좋음}/${새것.length}${나쁨.length ? ` · 어긋남: ${나쁨.join(", ")}` : ""}`);

if (!고칠까) { console.log(`\n재기만 했다. 덮어쓰려면 --fix`); process.exit(0); }
if (나쁨.length) { console.log(`\n어긋난 얼굴이 있어 안 덮어쓴다.`); process.exit(1); }
for (const { 길, png } of 새것) writeFileSync(길, png);
console.log(`덮어씀 ${새것.length}개`);

/* 눈으로 — 린·유나 얼굴 여섯을 전/후로 */
const 줄: sharp.OverlayOptions[] = [];
const 칸 = 96 * 2, 머리 = 22;
let 글 = "";
for (const [i, slug] of ["rin", "yuna"].entries()) {
  for (const [j, e] of EMO.entries()) {
    const 바탕 = await sharp({ create: { width: 칸, height: 칸, channels: 4, background: { r: 38, g: 34, b: 48, alpha: 1 } } }).png().toBuffer();
    const png = 새것.find((x) => x.길.includes(`${slug}\\face\\${e}.png`) || x.길.includes(`${slug}/face/${e}.png`))!.png;
    줄.push({ input: await sharp(바탕).composite([{ input: await sharp(png).resize(칸, 칸, { kernel: "nearest" }).png().toBuffer() }]).png().toBuffer(), left: j * 칸, top: 머리 + i * (칸 + 머리) });
    if (j === 0) 글 += `<text x="4" y="${머리 + i * (칸 + 머리) - 6}">${slug}</text>`;
  }
}
const W = 칸 * EMO.length, H = 머리 + 2 * (칸 + 머리);
줄.push({ input: Buffer.from(`<svg width="${W}" height="${H}"><style>text{font-family:sans-serif;font-size:15px;fill:#fff}</style>${글}</svg>`), left: 0, top: 0 });
const out = "C:/Users/az518/Desktop/로키-도트/테두리-20261108/_얼굴.png";
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 20, g: 20, b: 26, alpha: 1 } } }).composite(줄).png().toFile(out);
console.log(out);
