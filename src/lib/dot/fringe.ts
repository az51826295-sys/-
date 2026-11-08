/**
 * # 누끼 잔재 — "잘 안 잘린" 것의 정체
 *
 * 11-08 사장님: *"린 유나 잘 안 잘림"*. 크게 놓고 보니 머리카락 **바깥쪽 테두리**에 밝은 회색·흰
 * 네모가 붙어 있다. 시트에서 캐릭터를 떼어낼 때 **배경이 머리카락 가장자리에서 덜 떨어진 것**이다.
 *
 * 앞서 만든 자르기 자(`dot_cut_check.mts`)는 이걸 못 봤다. 그 자는 **떨어진 조각**을 찾는데
 * 이 티끌은 머리에 **붙어 있어서** 덩어리가 하나로 세어졌기 때문이다. 자가 침묵한 게 아니라
 * 다른 것을 재고 있었다.
 *
 * ## 무엇을 티끌로 보나
 *
 * **배경에 닿은 도트**(실루엣 테두리) 중에서, **이웃한 잉크 도트들과 색이 뚜렷이 다르면서
 * 그 그림의 보통 밝기보다 훨씬 밝은 것.** 안쪽 하이라이트나 연한 옷은 이웃도 같은 색이라 안 걸린다.
 *
 * 문턱은 지어내지 않는다 — **CIE Lab 색차 ΔE**를 쓰고 **ΔE > 10** 을 넘는 것만 센다.
 * ΔE 2.3 이 사람이 겨우 구별하는 차이(JND)이고 10 은 "누가 봐도 다른 색" 쪽의 흔한 경계다.
 *
 * ## "밝은" 쪽만 세는 까닭 — 사장님이 그걸 집었다
 *
 * 처음엔 색이 다르기만 하면 셌다. 그랬더니 **도윤이 1등, 린이 꼴찌**로 나와서 사장님 말과
 * 어긋났다(흰 셔츠·어두운 머리의 경계가 전부 걸렸기 때문이다). 후보 자 네 개를 나란히 돌려
 * 보여 드리고 사장님이 고른 것이 **"머리 옆 밝은 티끌"** 이다. 그래서 **밝기 조건**을 더한다:
 * 그 그림 도트들의 **가운데 밝기(L)보다 25 이상 밝은 것만.** 25 는 Lab 밝기 0~100 에서
 * 한 단계 위 명도로 읽히는 폭이다. 어두운 쪽으로 다른 것(그림자·눈동자)은 안 센다.
 */
import sharp from "sharp";

export const 배경기준 = 16;
/** 바깥 기준(CIE76). 2.3 = 겨우 구별, 10 = 누가 봐도 다른 색. */
export const DELTA_E = 10;
/** 가운데 밝기보다 이만큼 밝아야 "티끌"로 센다 (Lab L, 0~100). */
export const L_위로 = 25;

function srgb선형(v: number) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** sRGB → CIE Lab (D65). */
export function toLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgb선형(r), G = srgb선형(g), B = srgb선형(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function deltaE(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export type FringeReport = {
  texel: number;
  테두리: number;      // 배경에 닿은 도트 수
  티끌: number;        // 그중 이웃과 색이 동떨어진 것
  비율: number;        // 티끌 / 테두리
};

/**
 * 도트 격자 위에서 티끌을 찾는다.
 *
 * `texel` 은 밖에서 재서 넣는다(도트 자). 격자를 모르면 티끌 하나를 화소 64개로 세게 되어
 * 숫자가 부풀고, 지울 때도 멀쩡한 데를 긁는다.
 */
export async function findFringe(png: Buffer, texel: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const 가로 = Math.floor(W / texel), 세로 = Math.floor(H / texel);
  /** 도트 한 칸의 색 — 왼쪽 위 화소를 대표로 쓴다(격자가 성립하면 칸 안은 한 색이다). */
  const 색: (null | [number, number, number])[] = new Array(가로 * 세로).fill(null);
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const p = ((gy * texel + ((texel / 2) | 0)) * W + gx * texel + ((texel / 2) | 0)) * ch;
    색[gy * 가로 + gx] = data[p + 3] >= 배경기준 ? [data[p], data[p + 1], data[p + 2]] : null;
  }
  const lab = 색.map((c) => (c ? toLab(c[0], c[1], c[2]) : null));
  /* 이 그림의 "보통 밝기" — 가운데값이라 흰 셔츠 같은 큰 덩어리에 끌려가지 않는다. */
  const L들 = lab.filter(Boolean).map((l) => l![0]).sort((a, b) => a - b);
  const 가운데L = L들.length ? L들[Math.floor(L들.length / 2)] : 0;

  const 티끌칸: number[] = [];
  let 테두리 = 0;
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const i = gy * 가로 + gx;
    if (!색[i]) continue;
    const 이웃: number[] = [];
    let 배경닿음 = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= 가로 || ny >= 세로) { 배경닿음 = true; continue; }
      const k = ny * 가로 + nx;
      if (!색[k]) 배경닿음 = true; else 이웃.push(k);
    }
    if (!배경닿음 || !이웃.length) continue;
    테두리++;
    let 제일가까운 = Infinity;
    for (const k of 이웃) 제일가까운 = Math.min(제일가까운, deltaE(lab[i]!, lab[k]!));
    if (제일가까운 > DELTA_E && lab[i]![0] > 가운데L + L_위로) 티끌칸.push(i);
  }
  return { 가로, 세로, 티끌칸, 테두리, data, info };
}

/** 재기만 한다 — 안 고친다. */
export async function measureFringe(png: Buffer, texel: number): Promise<FringeReport> {
  const r = await findFringe(png, texel);
  return { texel, 테두리: r.테두리, 티끌: r.티끌칸.length, 비율: r.테두리 ? r.티끌칸.length / r.테두리 : 0 };
}

/**
 * 티끌 칸을 **투명으로** 지운다. 안쪽은 건드리지 않으므로 그림이 줄지 않는다.
 * 한 번 지우면 새 테두리가 드러나므로 `돌림` 만큼 되풀이한다(기본 1 — 많이 돌리면 머리가 깎인다).
 */
export async function removeFringe(png: Buffer, texel: number, 돌림 = 1): Promise<{ png: Buffer; 지움: number }> {
  let 그림 = png, 지움 = 0;
  for (let n = 0; n < 돌림; n++) {
    const r = await findFringe(그림, texel);
    if (!r.티끌칸.length) break;
    const buf = Buffer.from(r.data);
    const W = r.info.width, ch = r.info.channels;
    for (const i of r.티끌칸) {
      const gx = i % r.가로, gy = (i / r.가로) | 0;
      for (let y = gy * texel; y < (gy + 1) * texel; y++) for (let x = gx * texel; x < (gx + 1) * texel; x++) {
        const p = (y * W + x) * ch;
        buf[p] = 0; buf[p + 1] = 0; buf[p + 2] = 0; buf[p + 3] = 0;
      }
    }
    지움 += r.티끌칸.length;
    그림 = await sharp(buf, { raw: { width: W, height: r.info.height, channels: ch } }).png().toBuffer();
  }
  return { png: 그림, 지움 };
}
