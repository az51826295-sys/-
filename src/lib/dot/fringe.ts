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

export const ALPHA_MIN = 16;
/** 바깥 기준(CIE76). 2.3 = 겨우 구별, 10 = 누가 봐도 다른 색. */
export const DELTA_E = 10;
/** 가운데 밝기보다 이만큼 밝아야 "티끌"로 센다 (Lab L, 0~100). */
export const L_ABOVE = 25;
/** 같은 색으로 묶는 경계. 가르는 경계(ΔE 10)와 **같은 수를 쓴다** — 2.3(JND)로 묶었더니
 * 흰 셔츠의 비슷한 흰색들이 서로 다른 섬이 되어 옷깃이 티끌로 걸렸다(11-08). 한 가지 정의로
 * "누가 봐도 다른 색"을 쓰면, 비슷한 흰색은 한 섬으로 뭉쳐 3칸을 넘어 그림으로 남는다. */
export const SAME_COLOR = DELTA_E;
/**
 * 섬이 이보다 크면 티끌이 아니라 **그림**이다.
 *
 * 처음엔 잉크의 1%(≈25칸)까지 봤다. 그랬더니 도윤 셔츠 테두리를 통째로 먹었다(34.1% · 1,105칸).
 * 사장님이 집은 것은 머리 옆에 붙은 **한두 칸짜리** 밝은 점이다. 그래서 **3칸**으로 못 박는다 —
 * 그보다 큰 밝은 덩어리는 옷깃·머리 하이라이트처럼 그려진 것으로 본다.
 */
export const ISLAND_MAX = 3;
/** 실루엣에서 이만큼 안쪽까지만 본다 — 얼굴·옷 안쪽은 자르기와 상관이 없다. */
export const DEPTH_MAX = 2;
/**
 * **띠는 티끌이 아니다** — 한 칸 두께로 길게 이어진 섬은 옷·머리의 **윤곽선**이다.
 *
 * 조건 없이 돌렸더니 도윤 셔츠 테두리가 통째로 깎였다(11-08, 34.1% · 1,105칸). 둘레 비율로
 * 가르려 했더니 이번엔 심은 고장을 12개 중 3개밖에 못 잡았다 — 머리카락 틈에 낀 티끌은 몸에
 * 두 변으로 닿아서 같이 걸러졌기 때문이다. 그래서 **둘레가 아니라 모양**으로 가른다:
 * 가로세로 중 하나가 1칸이면서 다른 쪽이 이 길이 이상이면 **띠**로 보고 건드리지 않는다.
 */
export const STRIP_LEN = 4;

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
export async function findFringe(png: Buffer, texel: number, 섬한도 = ISLAND_MAX, 깊이한도 = DEPTH_MAX) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const 가로 = Math.floor(W / texel), 세로 = Math.floor(H / texel);
  /** 도트 한 칸의 색 — 왼쪽 위 화소를 대표로 쓴다(격자가 성립하면 칸 안은 한 색이다). */
  const 색: (null | [number, number, number])[] = new Array(가로 * 세로).fill(null);
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const p = ((gy * texel + ((texel / 2) | 0)) * W + gx * texel + ((texel / 2) | 0)) * ch;
    색[gy * 가로 + gx] = data[p + 3] >= ALPHA_MIN ? [data[p], data[p + 1], data[p + 2]] : null;
  }
  const lab = 색.map((c) => (c ? toLab(c[0], c[1], c[2]) : null));
  /* 이 그림의 "보통 밝기" — 가운데값이라 흰 셔츠 같은 큰 덩어리에 끌려가지 않는다. */
  const L들 = lab.filter(Boolean).map((l) => l![0]).sort((a, b) => a - b);
  const 가운데L = L들.length ? L들[Math.floor(L들.length / 2)] : 0;

  const 옆 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const 둘레칸 = (i: number) => {
    const gx = i % 가로, gy = (i / 가로) | 0;
    const 밖: number[] = [];
    for (const [dx, dy] of 옆) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= 가로 || ny >= 세로) continue;
      밖.push(ny * 가로 + nx);
    }
    return 밖;
  };

  /* 배경에서 몇 칸 들어왔나 — 얼굴·옷 안쪽을 빼기 위해. 배경이 0, 테두리가 1. */
  const 깊이 = new Int32Array(가로 * 세로).fill(-1);
  const 줄: number[] = [];
  for (let i = 0; i < 가로 * 세로; i++) if (!색[i]) { 깊이[i] = 0; 줄.push(i); }
  for (let h = 0; h < 줄.length; h++) for (const k of 둘레칸(줄[h])) if (깊이[k] < 0) { 깊이[k] = 깊이[줄[h]] + 1; 줄.push(k); }

  let 잉크수 = 0, 테두리 = 0;
  for (let i = 0; i < 가로 * 세로; i++) { if (색[i]) 잉크수++; if (깊이[i] === 1) 테두리++; }
  const 섬최대 = 섬한도;

  /*
   * **섬 단위로 본다.** 한 칸씩 보면 같은 색 티끌이 둘만 붙어 있어도 서로를 이웃으로 삼아
   * "색이 같다"가 되어 빠져나간다(11-08 에 린·유나에서 실제로 그랬다). 그래서 **같은 색끼리
   * 먼저 묶고**(ΔE ≤ 2.3 = JND), 그 **섬 전체를 둘러싼 색**과 견준다.
   */
  const 섬번호 = new Int32Array(가로 * 세로).fill(-1);
  const 티끌칸: number[] = [];
  for (let s = 0; s < 가로 * 세로; s++) {
    if (!색[s] || 섬번호[s] >= 0) continue;
    const id = s;
    const 식구: number[] = [s]; 섬번호[s] = id;
    for (let h = 0; h < 식구.length; h++) for (const k of 둘레칸(식구[h])) {
      if (색[k] && 섬번호[k] < 0 && deltaE(lab[식구[h]]!, lab[k]!) <= SAME_COLOR) { 섬번호[k] = id; 식구.push(k); }
    }
    if (식구.length > 섬최대) continue;                                   // 큰 것은 그림이다
    if (!식구.some((i) => 깊이[i] >= 1 && 깊이[i] <= 깊이한도)) continue;  // 실루엣 가까이만
    if (lab[s]![0] <= 가운데L + L_ABOVE) continue;                        // 밝은 쪽만 — 사장님이 집은 것

    /* 모양 보기 — 한 칸 두께로 긴 것은 윤곽선이다. */
    let x0 = 가로, y0 = 세로, x1 = -1, y1 = -1;
    for (const i of 식구) {
      const x = i % 가로, y = (i / 가로) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const 너비 = x1 - x0 + 1, 높이 = y1 - y0 + 1;
    if (Math.min(너비, 높이) === 1 && Math.max(너비, 높이) >= STRIP_LEN) continue;

    /* 섬 바깥에 닿은 잉크가 전부 뚜렷이 다른 색이어야 "섬"이다. 하나라도 비슷하면 그림의 일부다. */
    let 섬인가 = true, 닿은잉크 = 0;
    for (const i of 식구) for (const k of 둘레칸(i)) {
      if (!색[k] || 섬번호[k] === id) continue;
      닿은잉크++;
      if (deltaE(lab[s]!, lab[k]!) <= DELTA_E) { 섬인가 = false; break; }
    }
    if (섬인가 && 닿은잉크) 티끌칸.push(...식구);
  }
  return { 가로, 세로, 티끌칸, 테두리, data, info };
}

/** 재기만 한다 — 안 고친다. */
export async function measureFringe(png: Buffer, texel: number, 섬한도 = ISLAND_MAX, 깊이한도 = DEPTH_MAX): Promise<FringeReport> {
  const r = await findFringe(png, texel, 섬한도, 깊이한도);
  return { texel, 테두리: r.테두리, 티끌: r.티끌칸.length, 비율: r.테두리 ? r.티끌칸.length / r.테두리 : 0 };
}

/**
 * 티끌 칸을 **투명으로** 지운다. 안쪽은 건드리지 않으므로 그림이 줄지 않는다.
 * 한 번 지우면 새 테두리가 드러나므로 `돌림` 만큼 되풀이한다(기본 1 — 많이 돌리면 머리가 깎인다).
 */
export async function removeFringe(png: Buffer, texel: number, 돌림 = 1, 섬한도 = ISLAND_MAX, 깊이한도 = DEPTH_MAX): Promise<{ png: Buffer; 지움: number }> {
  let 그림 = png, 지움 = 0;
  for (let n = 0; n < 돌림; n++) {
    const r = await findFringe(그림, texel, 섬한도, 깊이한도);
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

/**
 * 티끌 칸을 **옆 색으로 메운다** — 지우는 것의 반대.
 *
 * 11-08 사장님: *"왜 지우는 게 깔끔하게 안 된다고 생각해?"* 답은 **방향**이었다. 그 티끌은
 * 뭐가 더 붙은 게 아니라 **머리카락이 있어야 할 자리에 배경이 남은 것**이다. 지우면 흰 점이
 * 구멍으로 바뀔 뿐 실루엣은 그대로 패인다. 그래서 **둘러싼 잉크 중 제일 많은 색**으로 덮는다.
 *
 * 배경에만 둘러싸인 칸(진짜로 떠 있는 조각)은 메울 색이 없으므로 **그때만 지운다.**
 */
export async function fillFringe(
  png: Buffer, texel: number, 섬한도 = ISLAND_MAX, 깊이한도 = DEPTH_MAX,
): Promise<{ png: Buffer; 메움: number; 지움: number }> {
  const r = await findFringe(png, texel, 섬한도, 깊이한도);
  if (!r.티끌칸.length) return { png, 메움: 0, 지움: 0 };
  const buf = Buffer.from(r.data);
  const W = r.info.width, ch = r.info.channels;
  const 티끌 = new Set(r.티끌칸);
  const 칸색 = (i: number): [number, number, number, number] => {
    const gx = i % r.가로, gy = (i / r.가로) | 0;
    const p = ((gy * texel + (texel >> 1)) * W + gx * texel + (texel >> 1)) * ch;
    return [r.data[p], r.data[p + 1], r.data[p + 2], r.data[p + 3]];
  };
  let 메움 = 0, 지움 = 0;
  for (const i of r.티끌칸) {
    const gx = i % r.가로, gy = (i / r.가로) | 0;
    /* 둘러싼 잉크 칸의 색을 센다 — 티끌끼리는 서로를 보지 않는다. */
    const 표 = new Map<string, { 수: number; 색: [number, number, number] }>();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= r.가로 || ny >= r.세로) continue;
      const k = ny * r.가로 + nx;
      if (티끌.has(k)) continue;
      const c = 칸색(k);
      if (c[3] < ALPHA_MIN) continue;
      const key = `${c[0]},${c[1]},${c[2]}`;
      const 있던것 = 표.get(key);
      if (있던것) 있던것.수++;
      else 표.set(key, { 수: 1, 색: [c[0], c[1], c[2]] });
    }
    let 고른색: [number, number, number] | null = null, 제일많음 = 0;
    for (const { 수, 색 } of 표.values()) if (수 > 제일많음) { 제일많음 = 수; 고른색 = 색; }
    for (let y = gy * texel; y < (gy + 1) * texel; y++) for (let x = gx * texel; x < (gx + 1) * texel; x++) {
      const p = (y * W + x) * ch;
      if (고른색) { buf[p] = 고른색[0]; buf[p + 1] = 고른색[1]; buf[p + 2] = 고른색[2]; buf[p + 3] = 255; }
      else { buf[p] = 0; buf[p + 1] = 0; buf[p + 2] = 0; buf[p + 3] = 0; }
    }
    if (고른색) 메움++; else 지움++;
  }
  return {
    png: await sharp(buf, { raw: { width: W, height: r.info.height, channels: ch } }).png().toBuffer(),
    메움, 지움,
  };
}
