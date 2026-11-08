/**
 * # 한 색표로 묶는다
 *
 * 11-08 에 쟀다: 캐릭터 **21쌍 전부 색 겹침 0%**. `pixelize` 가 장마다 혼자 24색으로
 * 줄이기 때문이다 — 같은 모델이 같은 주문으로 그려도 **색이 한 점도 안 겹치면** 사람 눈에는
 * 다른 사람이 그린 것으로 보인다. 그림체보다 색표가 먼저 보인다.
 *
 * 그래서 색표를 **하나로 고정**하고 모든 칸을 거기에 맞춘다.
 *
 * ## 색표는 지어내지 않는다
 *
 * 색은 창작이라 내가 고르지 않는다. **피드 그림에서 뽑는다** — 피드는 일곱 장이 이미 한 결이고
 * (11-08 기준점), 사장님이 고른 그림이다. 일곱 장을 한 장으로 붙여 놓고 색을 줄이면,
 * 거기서 나오는 색표가 곧 "이 제품의 색"이다.
 *
 * ## 몇 색인가 — 바깥 기준에서 가져온다
 *
 * 내가 정한 수가 아니라 도트 그림 쪽 관행이다. DawnBringer 32(DB32)와 AAP-64 가 널리 쓰이는
 * 고정 색표인데, 32 는 사람 하나짜리 크기고 우리는 **일곱 명의 살·머리·옷**을 한 표에 담아야
 * 하므로 **64** 를 쓴다. 더 늘리면 사람마다 자기 색을 갖게 되어 묶는 뜻이 사라진다.
 */
import sharp from "sharp";

export type Color = { r: number; g: number; b: number };
export const PALETTE_SIZE = 64;

/** 알파 16 미만은 배경으로 본다 — 스프라이트는 알파를 0/255 로 굳혀 둔다. */
const 배경기준 = 16;

/**
 * 그림 여러 장에서 **색표 한 장**을 뽑는다.
 *
 * 한 줄로 이어 붙인 뒤 `sharp` 의 색 줄이기(median cut)를 한 번만 돌린다. 장마다 따로 줄이면
 * 지금과 같은 일이 벌어지므로, **반드시 붙여서 한 번에** 줄인다.
 */
export async function extractPalette(images: Buffer[], colors = PALETTE_SIZE): Promise<Color[]> {
  if (!images.length) throw new Error("색표를 뽑을 그림이 없다");
  const 칸 = 256;
  const 조각 = await Promise.all(
    images.map(async (b, i) => ({
      input: await sharp(b).resize(칸, 칸, { fit: "cover" }).png().toBuffer(),
      left: i * 칸,
      top: 0,
    })),
  );
  const 붙인것 = await sharp({
    create: { width: 칸 * images.length, height: 칸, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(조각)
    .png({ palette: true, colors, dither: 0 })
    .toBuffer();

  const { data, info } = await sharp(붙인것).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const 본것 = new Map<string, Color>();
  for (let p = 0; p < data.length; p += info.channels) {
    if (data[p + 3] < 배경기준) continue;
    const k = `${data[p]},${data[p + 1]},${data[p + 2]}`;
    if (!본것.has(k)) 본것.set(k, { r: data[p], g: data[p + 1], b: data[p + 2] });
  }
  /* 어두운 것부터 — 사람이 색표를 볼 때 읽기 쉽게. 쓰임에는 영향이 없다. */
  return [...본것.values()].sort((a, b) => a.r + a.g + a.b - (b.r + b.g + b.b));
}

/** 색 거리 — 사람 눈에 가깝게 초록에 무게를 더 둔다(흔히 쓰는 가중 제곱 거리). */
function 거리(a: Color, r: number, g: number, b: number) {
  const dr = a.r - r, dg = a.g - g, db = a.b - b;
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

/**
 * 그림의 모든 색을 색표의 **가장 가까운 색**으로 바꾼다.
 *
 * 격자는 건드리지 않는다 — 크기도 자리도 그대로고 색만 갈아탄다. 그래서 도트 크기·순도가
 * 바뀌지 않아야 하고, 그걸 부르는 쪽에서 재서 확인한다(`dot_palette_unify.mts`).
 */
export async function applyPalette(png: Buffer, palette: Color[]): Promise<Buffer> {
  if (!palette.length) throw new Error("색표가 비어 있다");
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const 바꾼것 = Buffer.from(data);
  /* 한 칸에 쓰이는 색은 많아야 수십 가지라, 본 색을 기억해 두면 계산이 한 번으로 끝난다. */
  const 기억 = new Map<number, Color>();
  for (let p = 0; p < 바꾼것.length; p += info.channels) {
    if (바꾼것[p + 3] < 배경기준) { 바꾼것[p] = 0; 바꾼것[p + 1] = 0; 바꾼것[p + 2] = 0; 바꾼것[p + 3] = 0; continue; }
    const key = (바꾼것[p] << 16) | (바꾼것[p + 1] << 8) | 바꾼것[p + 2];
    let 고른것 = 기억.get(key);
    if (!고른것) {
      let 제일가까운 = palette[0], 제일작은 = Infinity;
      for (const c of palette) {
        const d = 거리(c, 바꾼것[p], 바꾼것[p + 1], 바꾼것[p + 2]);
        if (d < 제일작은) { 제일작은 = d; 제일가까운 = c; }
      }
      고른것 = 제일가까운;
      기억.set(key, 고른것);
    }
    바꾼것[p] = 고른것.r; 바꾼것[p + 1] = 고른것.g; 바꾼것[p + 2] = 고른것.b; 바꾼것[p + 3] = 255;
  }
  return await sharp(바꾼것, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();
}

/** 그림이 실제로 쓴 색들 — 겹침을 재는 자의 재료. */
export async function usedColors(png: Buffer): Promise<Set<string>> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const s = new Set<string>();
  for (let p = 0; p < data.length; p += info.channels) {
    if (data[p + 3] < 배경기준) continue;
    s.add(`${data[p]},${data[p + 1]},${data[p + 2]}`);
  }
  return s;
}

/** 두 사람이 색을 얼마나 같이 쓰나 — 한 사람이 그린 것처럼 보이려면 높아야 한다. */
export function paletteOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let 같음 = 0;
  for (const q of a) if (b.has(q)) 같음++;
  return 같음 / new Set([...a, ...b]).size;
}

/** 색표를 눈으로 볼 수 있게 네모로 늘어놓는다. */
export async function paletteStrip(palette: Color[], 칸 = 48, 줄 = 16): Promise<Buffer> {
  const 행 = Math.ceil(palette.length / 줄);
  const 조각: sharp.OverlayOptions[] = palette.map((c, i) => ({
    input: { create: { width: 칸, height: 칸, channels: 4, background: { ...c, alpha: 1 } } },
    left: (i % 줄) * 칸,
    top: Math.floor(i / 줄) * 칸,
  }));
  return await sharp({ create: { width: 줄 * 칸, height: 행 * 칸, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(조각)
    .png()
    .toBuffer();
}
