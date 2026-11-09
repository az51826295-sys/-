/**
 * **그리지 않고 사진 만들기** 시험 — 벽지 한 조각 + 캐릭터 스프라이트.
 *
 * 사장님: *"게시물 사진 자체가 다양하게 하자."* 그런데 그리는 열쇠가 전부 죽어 있다
 * (OpenAI 401 · fal 잔액 0). 그래서 **가진 재료만으로** 되는지 먼저 본다:
 * 벽지 6장(160×240 도트) × 자른 자리 × 표정 12개 × 7명.
 *
 * ## 도트 크기를 맞추는 게 전부다
 *
 * 벽지는 **1칸 = 1화소**로 그려졌고 스프라이트는 **1칸 = 8화소**(512 안에 64칸)다. 그냥 겹치면
 * 한 그림 안에 도트 크기가 둘이 되어 가짜처럼 보인다. 그래서 **둘 다 1칸 = 4화소**로 맞춘다:
 *   · 벽지에서 64×80칸을 잘라 내고(자르는 자리를 바꾸면 다른 장면이 된다)
 *   · 스프라이트를 64칸 그대로 얹는다
 *   · 256×320(4:5)으로 내보낸다 — 지금 사진(200×250)과 같은 비율
 */
import { mkdirSync } from "node:fs";
import type { OverlayOptions } from "sharp";
const sharp = (await import("sharp")).default;

const 칸 = 4;                       // 1도트 = 4화소
const 가로칸 = 64, 세로칸 = 80;      // 4:5
const W = 가로칸 * 칸, H = 세로칸 * 칸;
const 나갈곳 = "C:/Users/az518/Desktop/로키-도트/사진시험-20261109";
mkdirSync(나갈곳, { recursive: true });

/** 벽지(160×240, 1칸=1화소)에서 64×80칸을 잘라 4배로 키운다. 자르는 자리로 장면이 갈린다. */
async function 바탕(이름: string, x: number, y: number): Promise<Buffer> {
  return await sharp(`public/wallpapers/${이름}.png`)
    .extract({ left: x, top: y, width: 가로칸, height: 세로칸 })
    .resize(W, H, { kernel: "nearest" }).png().toBuffer();
}

/** 스프라이트(512, 1칸=8화소)를 1칸=4화소로 줄인다 — 정확히 절반이라 도트가 안 깨진다. */
async function 사람(slug: string, 표정: string): Promise<Buffer> {
  return await sharp(`public/dot-sprites/${slug}/${표정}.png`).resize(가로칸 * 칸, 가로칸 * 칸, { kernel: "nearest" }).png().toBuffer();
}

type 장면 = { 이름: string; 벽지: string; x: number; y: number; 표정: string };
const 장면들: 장면[] = [
  { 이름: "방 · 평소", 벽지: "room", x: 48, y: 80, 표정: "neutral" },
  { 이름: "밤 하늘", 벽지: "night", x: 48, y: 120, 표정: "sad" },
  { 이름: "편의점", 벽지: "store", x: 48, y: 100, 표정: "happy" },
  { 이름: "벚꽃길", 벽지: "sakura", x: 60, y: 90, 표정: "shy" },
  { 이름: "비 오는 창", 벽지: "rain", x: 48, y: 110, 표정: "surprised" },
  { 이름: "노을", 벽지: "sunset", x: 48, y: 130, 표정: "angry" },
];

const slug = process.argv[2] ?? "rin";
const 판: Buffer[] = [];
for (const s of 장면들) {
  const bg = await 바탕(s.벽지, s.x, s.y);
  const fg = await 사람(slug, s.표정);
  /* 발을 바닥에 두고 가운데 — 아래로 내리면 상반신만 보이게 잘린다 */
  판.push(await sharp(bg).composite([{ input: fg, left: 0, top: H - 가로칸 * 칸 }]).png().toBuffer());
}

const 머리 = 22;
const 조각: OverlayOptions[] = 판.map((p, i) => ({ input: p, left: i * W, top: 머리 }));
조각.push({
  input: Buffer.from(
    `<svg width="${W * 판.length}" height="${머리 + H}"><style>text{font-family:sans-serif;font-size:14px;fill:#fff}</style>` +
    장면들.map((s, i) => `<text x="${i * W + 4}" y="16">${s.이름}</text>`).join("") + `</svg>`),
  left: 0, top: 0,
});
const out = `${나갈곳}/_${slug}-합성.png`;
await sharp({ create: { width: W * 판.length, height: 머리 + H, channels: 4, background: { r: 20, g: 20, b: 26, alpha: 1 } } })
  .composite(조각).png().toFile(out);
console.log(out);
