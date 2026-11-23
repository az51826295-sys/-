/**
 * 진짜 도트 변환기 자 (11-24). 답을 아는 그림을 일부러 망가뜨리고 되찾는지 잰다.
 *   npx tsx engine/tools/realdot_check.mts
 * 정답: 시트 한 칸을 N×N 논리 도트(16색)로 만든다 → 소수 배율 + 부드러운 확대(중간색) + 잡음 → realDot → 논리 크기·칸 색 일치율.
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { realDot } from "../../src/lib/pixel/realdot";

const OUT = "engine/work/realdot";
const 시트 = "C:/Users/az518/Desktop/두근도트-시트";
const 경우 = [
  { 그림: "haru-happy", n: 48, 배: 9.37, 커널: "cubic" },
  { 그림: "jiwoo-angry", n: 64, 배: 8.0, 커널: "nearest" },
  { 그림: "haru-sad", n: 40, 배: 12.6, 커널: "nearest", 흐림: 1.2 },
  { 그림: "haru-sad", n: 40, 배: 12.6, 커널: "linear", 거절가능: true },   // 칸 경계가 12px 비탈로 녹은 그림 — 맞히거나, 정직하게 거절하거나
  { 그림: "jiwoo-angry", n: 96, 배: 5.3, 커널: "cubic" },
  { 그림: "haru-happy", n: 32, 배: 20.2, 커널: "lanczos3" },
] as { 그림: string; n: number; 배: number; 커널: string; 흐림?: number; 거절가능?: boolean }[];

let 통과 = 0;
for (const k of 경우) {
  const 정답 = await sharp(readFileSync(`${시트}/${k.그림}.png`)).resize(k.n, k.n, { kernel: "nearest", fit: "fill" }).flatten({ background: "#ffffff" }).png({ palette: true, colors: 16, dither: 0 }).toBuffer();
  const 정답raw = await sharp(정답).ensureAlpha().raw().toBuffer();
  const S = Math.round(k.n * k.배);
  let 망 = sharp(정답).resize(S, S, { kernel: k.커널 as any });
  if (k.흐림) 망 = sharp(await 망.png().toBuffer()).blur(k.흐림);
  const 망buf = await 망.jpeg({ quality: 88 }).toBuffer();   // 압축 잡음까지
  let r;
  try { r = await realDot(망buf, process.argv.includes("--sabotage") ? { colors: 16, period: k.배 * 1.04 } : { colors: 16 }); }   // 심은 고장: 주기 4% 틀림·시작점 0
  catch (e) { const ok = !!k.거절가능; if (ok) 통과++; console.log(`${ok ? "✅" : "❌"} ${k.그림} 정답 ${k.n}칸 ×${k.배} ${k.커널} → 거절: ${(e as Error).message}`); continue; }
  let 맞음 = 0;
  if (r.logical[0] === k.n && r.logical[1] === k.n) {
    const got = await sharp(r.small).ensureAlpha().raw().toBuffer();
    for (let i = 0; i < k.n * k.n; i++) {
      const d = Math.max(...[0, 1, 2].map((c) => Math.abs(got[i * 4 + c] - 정답raw[i * 4 + c])));
      if (d <= 40) 맞음++;
    }
  }
  const 비율 = 맞음 / (k.n * k.n);
  const ok = r.logical[0] === k.n && r.logical[1] === k.n && 비율 >= 0.9;
  if (ok) 통과++;
  console.log(`${ok ? "✅" : "❌"} ${k.그림} 정답 ${k.n}칸 ×${k.배} ${k.커널} → 찾은 주기 ${r.period} · 칸 ${r.logical} · 칸 색 일치 ${(비율 * 100).toFixed(1)}%`);
  writeFileSync(`${OUT}/${k.그림}-${k.n}-in.jpg`, 망buf); writeFileSync(`${OUT}/${k.그림}-${k.n}-out.png`, r.big);
}
console.log(`\n${통과}/${경우.length}`);
