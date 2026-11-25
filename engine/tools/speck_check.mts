/**
 * 하늘색 점 자 (11-25, 사장님 "하늘색 점 못 지우면 안 돼") — 돈 0.
 *   npx tsx engine/tools/speck_check.mts [--sabotage]
 * 기대(먼저 적음):
 *   ① 캐릭터 옆 외톨이 배경 번짐 점(185,208,234 — 군인에 실제로 남았던 색) → 지워진다
 *   ①-2 두 칸짜리 번짐(옆모습 군인) → 지워진다
 *   ② 배경색과 가까운 넓은 은색 면(184,198,212 · 5×5 — 기사 갑옷 색) 가장자리 → 남는다
 *   ③ 실제 군인 4방향 원본을 새 길로 다시 돌린 결과 → 배경색과 가깝고 투명과 맞닿은 외톨이 점 0개
 * --sabotage: 지우기를 끈다 → ①·③ 이 깨져야 한다.
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";
const SAB = process.argv.includes("--sabotage");
const { dropBgSpecks, PIXEL_BG } = await import("../../src/lib/pixel/frames");
let ok = 0, n = 0;
const expect = (name: string, pass: boolean, got: unknown) => { n++; if (pass) ok++; console.log(`${pass ? "✓" : "✗"} ${name}: ${JSON.stringify(got)}`); };
const W = 12, H = 12;
const blank = () => Buffer.alloc(W * H * 4);
const put = (b: Buffer, x: number, y: number, c: number[]) => { const i = (y * W + x) * 4; b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = 255; };
// ① 어두운 몸(3~8열) + 옆에 외톨이 하늘색 점(9,5)
const a = blank(); for (let y = 2; y < 10; y++) for (let x = 3; x < 9; x++) put(a, x, y, [60, 70, 40]); put(a, 9, 5, [185, 208, 234]);
if (!SAB) dropBgSpecks(a, W, H, PIXEL_BG);
expect("① 외톨이 번짐 점 지움", a[(5 * W + 9) * 4 + 3] === 0, { alpha: a[(5 * W + 9) * 4 + 3] });
// ①-2 두 칸짜리 번짐(옆모습 군인에 실제로 남았던 모양)
const a2 = blank(); for (let y = 2; y < 10; y++) for (let x = 3; x < 9; x++) put(a2, x, y, [60, 70, 40]); put(a2, 9, 5, [184, 206, 233]); put(a2, 9, 6, [184, 206, 233]);
if (!SAB) dropBgSpecks(a2, W, H, PIXEL_BG);
expect("①-2 두 칸 번짐도 지움", a2[(5 * W + 9) * 4 + 3] === 0 && a2[(6 * W + 9) * 4 + 3] === 0, { a: a2[(5 * W + 9) * 4 + 3], b: a2[(6 * W + 9) * 4 + 3] });
// ② 은색 면 5×5(가장자리가 투명과 맞닿음)
const b = blank(); for (let y = 3; y < 8; y++) for (let x = 3; x < 8; x++) put(b, x, y, [184, 198, 212]);
if (!SAB) dropBgSpecks(b, W, H, PIXEL_BG);
let kept = 0; for (let i = 0; i < W * H; i++) if (b[i * 4 + 3]) kept++;
expect("② 넓은 은색 면은 남김", kept === 25, { kept });
// ③ 실제 군인 원본 다시 돌리기
const raw = "C:/Users/az518/Desktop/두근도트-스레드/realdot/try/soldier/turn-raw.png";
const ref = "C:/Users/az518/Desktop/두근도트-스레드/realdot/try/soldier/1x.png";
process.env.PIXEL_MOTION_MOCK = raw;
if (SAB) process.env.PIXEL_NO_SPECKS = "1";
const { makeMotion, sheetOf } = await import("../../src/lib/pixel/motion");
const r = await makeMotion(readFileSync(ref), "turn", { maxTries: 1 });
if (r.ok) {
  const { data, info } = await sharp(await sheetOf(r.cuts, r.set)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const near = (i: number) => Math.abs(data[i] - PIXEL_BG[0]) + Math.abs(data[i + 1] - PIXEL_BG[1]) + Math.abs(data[i + 2] - PIXEL_BG[2]) < 48;
  let lone = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4; if (!data[i + 3] || !near(i)) continue;
    let clear = false;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) { clear = true; continue; } const k = (ny * info.width + nx) * 4; if (!data[k + 3]) clear = true; }
    if (clear) lone++; // 투명과 맞닿은 배경색 칸은 전부 센다(넓은 면이 없는 군인이라 0 이어야 한다)
  }
  expect("③ 군인 4방향 외톨이 하늘색 점 0", lone === 0, { lone });
} else expect("③ 받음", false, r.reason);
// ④ 악마 걷기(2바퀴): 테두리를 띠처럼 두른 번짐 135칸 + 몸 사이에 갇힌 배경 칸 — 결과 전체에 배경색 칸 0
{
  const R2 = "C:/Users/az518/Desktop/두근도트-스레드/realdot/bench/r2";
  process.env.PIXEL_MOTION_MOCK = `${R2}/demon-walk-raw.png`;
  const r4 = await makeMotion(readFileSync(`${R2}/demon-1x.png`), "walk", { maxTries: 1 });
  if (r4.ok) {
    const { data, info } = await sharp(await sheetOf(r4.cuts, r4.set)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = 0; for (let i = 0; i < info.width * info.height * 4; i += 4) if (data[i + 3] && data[i + 2] - data[i] >= 38 && Math.abs(data[i] - PIXEL_BG[0]) + Math.abs(data[i + 1] - PIXEL_BG[1]) + Math.abs(data[i + 2] - PIXEL_BG[2]) < 80) left++;
    expect("④ 악마 걷기 배경색 칸 0(띠·갇힌 칸 포함)", left === 0, { left });
  } else expect("④ 받음", false, r4.reason);
}
console.log(`\n${ok}/${n}`);
