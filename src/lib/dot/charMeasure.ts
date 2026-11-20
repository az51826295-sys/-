import sharp from "sharp";
import { ALPHA_MIN } from "./fringe";

/**
 * 캐릭터 한 장의 **몸 숫자** — 잉크 상자(칸·화소), 머리 비율, 색 수, 아래 여백.
 *
 * `engine/tools/dot_character_spec.mts` 안에만 있던 것을 11-20 에 여기로 옮겼다. 판단 엔진의 그림 시험이
 * **같은 자**로 재야 해서다 — 베껴 두면 한쪽만 고치게 된다([[standard-copied-into-three-tools]]).
 * 이름이 ASCII 인 까닭: `.mts` 도구가 부른다(tsx 가 한글 export 를 흘린다).
 */
export async function measureBody(png: Buffer, texel: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  let x0 = W, x1 = -1, y0 = H, y1 = -1, 살첫줄 = -1;
  const 색 = new Set<string>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * ch;
    if (data[p + 3] < ALPHA_MIN) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    색.add(`${data[p]},${data[p + 1]},${data[p + 2]}`);
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (살첫줄 < 0 && r > 185 && g > 135 && b > 100 && r >= g && g >= b && r - b >= 12 && r - b <= 110) 살첫줄 = y;
  }
  const 폭 = x1 - x0 + 1, 높이 = y1 - y0 + 1;
  return {
    폭칸: Math.round(폭 / texel), 높이칸: Math.round(높이 / texel),
    폭화소: 폭, 높이화소: 높이,
    머리비율: 살첫줄 > 0 ? (살첫줄 - y0) / 높이 : NaN,
    색수: 색.size,
    아래여백: H - 1 - y1,
  };
}
