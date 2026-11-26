// 11-27 다리 문 문턱을 바깥 기준(픽셀랩 정면 걷기)에 묶기 — walk.ts 의 spreadsOf 와 같은 자(맨 아래 3줄의 칠한 폭)
// 돈 0: 이미 받아 둔 픽셀랩 프레임과 팩4 로그만 읽는다
import sharp from "sharp";
import { readdirSync } from "node:fs";
const dir = "C:/Users/az518/Desktop/두근도트-스레드/rival/knight/zip/Idle/animations/walking/south";
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
const spreads: number[] = [], heights: number[] = [];
for (const f of files) {
  const { data, info } = await sharp(`${dir}/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let top = -1, bot = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3]) { if (top < 0) top = y; bot = y; }
  let l = 1e9, r = -1;
  for (let y = Math.max(0, bot - 2); y <= bot; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3]) { l = Math.min(l, x); r = Math.max(r, x); }
  spreads.push(r - l + 1); heights.push(bot - top + 1);
}
const diff = Math.max(...spreads) - Math.min(...spreads);
const hMed = [...heights].sort((a, b) => a - b)[heights.length >> 1];
console.log(`픽셀랩 정면 걷기 ${files.length}장 · 키 ${heights.join("/")} (가운데 ${hMed}) · 발 폭 ${spreads.join("/")} · 변화 ${diff}칸 · 키 대비 ${(diff / hMed).toFixed(3)} (= 키/${(hMed / diff).toFixed(1)})`);
