/**
 * 그림체(결) 자 — **후보 칸 재 보기** (11-20). 판정은 아직 없다. 캐스트 열 명을 먼저 재고(좋은 쪽 먼저),
 * 그 범위 밖으로 나가는 시험 그림이 있는지 본다.
 *
 *   npx tsx engine/tools/dot_style_probe.mts [그림.png ...]
 *
 * 후보 칸 (전부 무표정 한 장, 도트 4, 잉크 상자 기준):
 *   머리비율   — 잉크 맨 위에서 살색이 처음 나오는 줄까지 ÷ 전체 높이 (measureBody)
 *   이마살     — 머리 쪽(잉크 위 40%)에서 살색 칸의 몫 — 앞머리가 이마를 얼마나 덮나
 *   어두운몫   — 잉크 중 아주 어두운 칸(밝기<60)의 몫 — 선·눈의 무게
 *   얼굴폭     — 머리 쪽 살색의 가로 폭 ÷ 잉크 폭
 *   눈높이     — 얼굴 안 가장 어두운 칸들의 가운데 줄 ÷ 잉크 높이
 */
import { readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
const { measureBody } = await import("../../src/lib/dot/charMeasure");
const { 있는사람, 격자 } = await import("../../src/lib/dot/charStandard");
const { ALPHA_MIN } = await import("../../src/lib/dot/fringe");
const texel = 512 / 격자;

const 살 = (r: number, g: number, b: number) => r > 185 && g > 135 && b > 100 && r >= g && g >= b && r - b >= 12 && r - b <= 110;

export async function styleOf(png: Buffer) {
  const body = await measureBody(png, texel);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = (y * W + x) * ch; if (data[p + 3] < ALPHA_MIN) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const 높이 = y1 - y0 + 1, 폭 = x1 - x0 + 1, 머리끝 = y0 + Math.round(높이 * 0.4);
  let 잉크 = 0, 어둠 = 0, 머리잉크 = 0, 머리살 = 0, 살x0 = W, 살x1 = -1, 눈합 = 0, 눈수 = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = (y * W + x) * ch; if (data[p + 3] < ALPHA_MIN) continue;
    const r = data[p], g = data[p + 1], b = data[p + 2], L = 0.299 * r + 0.587 * g + 0.114 * b;
    잉크++; if (L < 60) 어둠++;
    if (y < 머리끝) { 머리잉크++; if (살(r, g, b)) { 머리살++; if (x < 살x0) 살x0 = x; if (x > 살x1) 살x1 = x; } }
  }
  // 눈: 머리 쪽 살색 폭 안에서 아주 어두운 칸
  for (let y = y0; y < 머리끝; y++) for (let x = Math.max(살x0, 0); x <= 살x1; x++) {
    const p = (y * W + x) * ch; if (data[p + 3] < ALPHA_MIN) continue;
    const L = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    if (L < 60) { 눈합 += y; 눈수++; }
  }
  return {
    머리비율: body.머리비율,
    이마살: 머리잉크 ? 머리살 / 머리잉크 : NaN,
    어두운몫: 잉크 ? 어둠 / 잉크 : NaN,
    얼굴폭: 살x1 >= 살x0 ? (살x1 - 살x0 + 1) / 폭 : NaN,
    눈높이: 눈수 ? (눈합 / 눈수 - y0) / 높이 : NaN,
  };
}

const 칸 = ["머리비율", "이마살", "어두운몫", "얼굴폭", "눈높이"] as const;
const f = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "  -  ");
if (process.argv[1]?.includes("dot_style_probe")) {
  console.log(`${"이름".padEnd(28)} ${칸.join("  ")}`);
  const 캐스트: Record<string, number[]> = Object.fromEntries(칸.map((k) => [k, []]));
  for (const s of 있는사람()) {
    const v = await styleOf(readFileSync(`public/dot-sprites/${s}/neutral.png`));
    칸.forEach((k) => 캐스트[k].push(v[k]));
    console.log(`${("캐스트 " + s).padEnd(28)} ${칸.map((k) => f(v[k])).join("   ")}`);
  }
  console.log(`${"캐스트 범위".padEnd(28)} ${칸.map((k) => `${f(Math.min(...캐스트[k]))}~${f(Math.max(...캐스트[k]))}`).join(" ")}`);
  for (const p of process.argv.slice(2).filter((x) => existsSync(x))) {
    const v = await styleOf(readFileSync(p));
    console.log(`${p.split("/").pop()!.padEnd(28)} ${칸.map((k) => { const lo = Math.min(...캐스트[k]), hi = Math.max(...캐스트[k]); return f(v[k]) + (v[k] < lo || v[k] > hi ? "!" : " "); }).join("  ")}`);
  }
}
