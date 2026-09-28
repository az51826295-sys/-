/**
 * **인스타 프로필 사진 만들기** (227회차 09-29, 사장님 "프로필부터 구성"). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_avatar.mts
 *
 * 인스타는 프로필 사진을 **동그랗게 자른다.** 지금 앱 아이콘은 머리카락이 네 변에 닿아 있어서
 * 동그라미 밖으로 나가는 부분이 잘린다. 얼마나 잘리는지 **재고** 나서 고친다 — 눈으로 "괜찮아 보인다"
 * 는 자가 아니다([[one-ruler-per-complaint]]).
 *
 * 자: 노란 바탕이 아닌 점(=그림) 중 **내접원 밖에 있는 점의 비율**. 0 이면 하나도 안 잘린다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT = "C:/Users/az518/Desktop/두근도트-인스타";
mkdirSync(OUT, { recursive: true });
const 원본 = readFileSync("public/dot-icon-512.png");

/** 노랑(바탕)과 그림을 가른 뒤, 내접원 밖으로 나가는 그림의 비율. */
async function 잘림비(buf: Buffer): Promise<{ 밖: number; 바탕: string }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, W = info.width, H = info.height;
  // 바탕색 = 네 귀퉁이 중 가장 흔한 색(아이콘은 귀퉁이가 늘 바탕이다)
  const 귀 = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].map(([x, y]) => {
    const p = (y * W + x) * ch; return `${data[p]},${data[p + 1]},${data[p + 2]}`;
  });
  const 셈 = new Map<string, number>();
  for (const k of 귀) 셈.set(k, (셈.get(k) ?? 0) + 1);
  const 바탕 = [...셈.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const [br, bg, bb] = 바탕.split(",").map(Number);
  const cx = (W - 1) / 2, cy = (H - 1) / 2, r = Math.min(W, H) / 2;
  let 그림 = 0, 밖 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * ch;
    if (data[p + 3] < 128) continue;
    // 바탕색과 충분히 다르면 그림으로 본다(압축 때문에 몇 단계 흔들린다)
    if (Math.abs(data[p] - br) + Math.abs(data[p + 1] - bg) + Math.abs(data[p + 2] - bb) < 30) continue;
    그림++;
    if (Math.hypot(x - cx, y - cy) > r) 밖++;
  }
  return { 밖: 그림 ? 밖 / 그림 : 0, 바탕: `rgb(${br},${bg},${bb})` };
}

const 전 = await 잘림비(원본);
console.log(`지금 아이콘: 동그라미 밖으로 나가는 그림 **${(전.밖 * 100).toFixed(1)}%** · 바탕 ${전.바탕}`);

// 고치기: 같은 바탕색 위에 그림을 줄여 앉힌다. 도트라 **정수배가 아니면 뭉갠다** → nearest.
const [r0, g0, b0] = 전.바탕.match(/\d+/g)!.map(Number);
const 판 = [
  { 이름: "프로필-A-여유", 비율: 0.78 },
  { 이름: "프로필-B-꽉참", 비율: 0.88 },
];
for (const { 이름, 비율 } of 판) {
  const S = 1024, 속 = Math.round(S * 비율);
  const 작게 = await sharp(원본).resize(속, 속, { kernel: "nearest" }).toBuffer();
  const png = await sharp({ create: { width: S, height: S, channels: 4, background: { r: r0, g: g0, b: b0, alpha: 1 } } })
    .composite([{ input: 작게, left: Math.round((S - 속) / 2), top: Math.round((S - 속) / 2) }])
    .png().toBuffer();
  const p = `${OUT}/${이름}.png`;
  writeFileSync(p, png);
  const 후 = await 잘림비(png);
  console.log(`${이름}: 밖으로 나감 ${(후.밖 * 100).toFixed(1)}%  (${(png.length / 1024).toFixed(0)}KB)  → ${p}`);
}
