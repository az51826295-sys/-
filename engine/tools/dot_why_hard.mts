/**
 * **색이 다른데 왜 자르기가 어려웠나** — 시트를 실제로 재서 답한다 (226회차 2026-09-28).
 *
 *   npx tsx engine/tools/dot_why_hard.mts "C:/Users/az518/Desktop/도트-yuna-새판/_sheet.png"
 *
 * 사장님 09-28: *"나만 이해 안 돼 왜 못 자른 거야 색이 아예 다른데."*
 *
 * 말로 답하면 내 짐작이 된다. 그래서 센다:
 *   ① 배경색이 정말 한 가지인가 (가장 많은 색 몇 %)
 *   ② 배경과 그림 **사이에 섞인 픽셀**이 얼마나 있나 — 여기가 어려움의 핵심일 수 있다
 *   ③ 그림 안에 배경과 **비슷한 색**이 있나 (분홍 홍조·옷)
 *   ④ 칸 경계가 색으로 보이나 — 색이 달라도 "어디서 자를지" 는 다른 문제다
 */
import sharp from "sharp";

const path = process.argv[2] ?? "C:/Users/az518/Desktop/도트-yuna-새판/_sheet.png";
const img = sharp(path).ensureAlpha();
const { width: W = 0, height: H = 0 } = await img.metadata();
const buf = await img.raw().toBuffer();
const px = (x: number, y: number) => {
  const i = (y * W + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]] as const;
};

// ① 가장 많은 색 — 배경일 것이다
const 셈 = new Map<string, number>();
let 투명수 = 0;
for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
  const [r, g, b, a] = px(x, y);
  if (a < 128) { 투명수++; continue; }
  셈.set(`${r},${g},${b}`, (셈.get(`${r},${g},${b}`) ?? 0) + 1);
}
const 총 = [...셈.values()].reduce((a, b) => a + b, 0);
const 많은 = [...셈.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`투명 픽셀 ${((투명수*4*100)/(W*H)).toFixed(1)}% (투명은 빼고 센다)`);
console.log(`시트 ${W}×${H} · 서로 다른 색 ${셈.size.toLocaleString()}가지`);
console.log("가장 많은 색 다섯:");
for (const [c, n] of 많은) console.log(`   ${c.padEnd(14)} ${((n * 100) / 총).toFixed(1)}%`);

const [br, bg, bb] = 많은[0][0].split(",").map(Number);
const 거리 = (r: number, g: number, b: number) => Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb);

// ② 배경에서 얼마나 떨어져 있나 — 띠별로 센다
const 띠 = [0, 30, 90, 200, 400, 765];
const 통 = new Array(띠.length - 1).fill(0);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const [r, g, b] = px(x, y);
  const d = 거리(r, g, b);
  for (let i = 0; i < 통.length; i++) if (d >= 띠[i] && d < 띠[i + 1]) { 통[i]++; break; }
}
const 전체 = W * H;
console.log(`\n배경색(${br},${bg},${bb})에서 얼마나 떨어졌나:`);
const 이름 = ["배경 그대로(0~29)", "**거의 배경(30~89) ← 섞인 띠**", "애매(90~199)", "다른 색(200~399)", "완전 다름(400+)"];
for (let i = 0; i < 통.length; i++) console.log(`   ${이름[i].padEnd(34)} ${((통[i] * 100) / 전체).toFixed(2)}%  (${통[i].toLocaleString()}px)`);

// ③ 배경과 가까운 색이 **그림 안쪽**에도 있나 — 가운데 세로줄을 훑어 본다
let 안쪽에배경비슷 = 0;
for (let y = 0; y < H; y++) {
  const [r, g, b] = px(Math.floor(W / 2), y);
  if (거리(r, g, b) < 90 && y > H * 0.15 && y < H * 0.85) 안쪽에배경비슷++;
}
console.log(`\n가운데 세로줄에서 배경과 비슷한(90 미만) 픽셀: ${안쪽에배경비슷} / ${H}`);

// ④ 칸 경계가 보이나 — 가로줄마다 "배경 그대로" 비율을 내고, 100% 인 줄이 격자다
const 배경줄: number[] = [];
for (let y = 0; y < H; y++) {
  let c = 0;
  for (let x = 0; x < W; x++) if (거리(...px(x, y).slice(0, 3) as [number, number, number]) < 30) c++;
  if (c === W) 배경줄.push(y);
}
const 덩어리: [number, number][] = [];
for (const y of 배경줄) {
  const 끝 = 덩어리[덩어리.length - 1];
  if (끝 && y === 끝[1] + 1) 끝[1] = y; else 덩어리.push([y, y]);
}
console.log(`\n**가로로 배경만 있는 줄** ${배경줄.length}줄 · 덩어리 ${덩어리.length}개`);
console.log(`   덩어리: ${덩어리.slice(0, 8).map(([a, b]) => `${a}~${b}(${b - a + 1}줄)`).join(" · ")}`);
console.log(
  덩어리.length >= 2
    ? "   → 칸 경계가 색으로 보인다. 자르는 자리는 찾을 수 있다."
    : "   → **칸 경계가 색으로 안 보인다.** 그림이 칸을 꽉 채워 경계가 없다 — 어디서 자를지 색으로는 못 정한다.",
);
