/**
 * # 테두리 두르기
 *
 * 11-08 사장님: *"린 머리카락 사이에 공간이 크게 있는데, 표정 쓰면 테두리 두르자."*
 *
 * 린은 머리카락이 가닥으로 갈라져 **사이에 배경이 크게 비친다.** 스프라이트만 보면 괜찮은데
 * 앱에서 **말풍선·방 배경 위에 올리면** 그 틈으로 뒷배경이 들어와 지저분해진다. 테두리를 두르면
 * 실루엣이 한 덩어리로 묶여서 틈이 **무늬로 읽힌다.**
 *
 * ## 도트 격자 위에서 두른다
 *
 * 테두리도 **도트 한 칸 단위**여야 한다. 화소로 1px 선을 그으면 도트 크기 8 짜리 그림에
 * 8분의 1 두께 선이 생겨 격자가 깨진다. 그래서 배경 칸 중 **잉크에 닿은 칸**을 통째로 칠한다.
 */
import sharp from "sharp";
import { ALPHA_MIN, toLab } from "./fringe";

export type OutlineStyle =
  /** 한 가지 색으로 — 보통 검정에 가까운 색 */
  | { 식: "한색"; 색: [number, number, number] }
  /** 닿은 그림 색을 어둡게 해서 — 머리·옷마다 테두리 색이 달라져 부드럽다 */
  | { 식: "어둡게"; 비율: number };

/** 닿은 칸들 중 제일 많은 색. 같으면 먼저 본 것. */
function 많은색(이웃: [number, number, number][]): [number, number, number] | null {
  const 표 = new Map<string, { 수: number; 색: [number, number, number] }>();
  for (const c of 이웃) {
    const k = `${c[0]},${c[1]},${c[2]}`;
    const v = 표.get(k);
    if (v) v.수++; else 표.set(k, { 수: 1, 색: c });
  }
  let 고른것: [number, number, number] | null = null, 많음 = 0;
  for (const { 수, 색 } of 표.values()) if (수 > 많음) { 많음 = 수; 고른것 = 색; }
  return 고른것;
}

/**
 * 실루엣 바깥에 테두리를 두른다.
 *
 * `두께` 는 **도트 칸 수**다. 캔버스 밖으로는 안 나가므로, 가장자리에 닿은 그림은 그쪽만
 * 테두리가 안 생긴다(잘라 내는 것보다 낫다 — 그림이 줄지 않는다).
 */
export async function outlineSprite(
  png: Buffer,
  texel: number,
   style: OutlineStyle = { 식: "어둡게", 비율: 0.45 },
   두께 = 1,
): Promise<{ png: Buffer; 칠한칸: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const 가로 = Math.floor(W / texel), 세로 = Math.floor(H / texel);

  const 칸색 = (gx: number, gy: number) => {
    const p = ((gy * texel + (texel >> 1)) * W + gx * texel + (texel >> 1)) * ch;
    return [data[p], data[p + 1], data[p + 2], data[p + 3]] as const;
  };
  /** 지금 그림의 잉크 지도 — 테두리를 칠하면서 같이 자란다. */
  const 잉크 = new Uint8Array(가로 * 세로);
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) 잉크[gy * 가로 + gx] = 칸색(gx, gy)[3] >= ALPHA_MIN ? 1 : 0;

  const buf = Buffer.from(data);
  let 칠한칸 = 0;
  for (let n = 0; n < 두께; n++) {
    const 칠할것: { gx: number; gy: number; 색: [number, number, number] }[] = [];
    for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
      if (잉크[gy * 가로 + gx]) continue;
      const 이웃: [number, number, number][] = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= 가로 || ny >= 세로) continue;
        if (!잉크[ny * 가로 + nx]) continue;
        const c = 칸색(nx, ny);
        이웃.push([c[0], c[1], c[2]]);
      }
      if (!이웃.length) continue;
      let 색: [number, number, number];
      if (style.식 === "한색") 색 = style.색;
      else {
        const 바탕 = 많은색(이웃) ?? [0, 0, 0];
        /* 밝기만 내린다 — 색감은 그대로 둬야 머리·옷 테두리가 따로 놀지 않는다. */
        색 = [Math.round(바탕[0] * style.비율), Math.round(바탕[1] * style.비율), Math.round(바탕[2] * style.비율)];
      }
      칠할것.push({ gx, gy, 색 });
    }
    for (const { gx, gy, 색 } of 칠할것) {
      for (let y = gy * texel; y < (gy + 1) * texel; y++) for (let x = gx * texel; x < (gx + 1) * texel; x++) {
        const p = (y * W + x) * ch;
        buf[p] = 색[0]; buf[p + 1] = 색[1]; buf[p + 2] = 색[2]; buf[p + 3] = 255;
      }
      잉크[gy * 가로 + gx] = 1;
      칠한칸++;
    }
    /* 다음 바퀴는 방금 칠한 테두리에서 다시 자란다 — 색을 다시 읽으려면 data 도 갱신해야 한다. */
    buf.copy(data as Buffer);
  }
  return { png: await sharp(buf, { raw: { width: W, height: H, channels: ch } }).png().toBuffer(), 칠한칸 };
}

/** 그림이 얼마나 "구멍 뚫려" 있나 — 실루엣 안에 갇힌 배경 칸 수. 린이 여기서 높다. */
export async function countHoles(png: Buffer, texel: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, ch = info.channels;
  const 가로 = Math.floor(W / texel), 세로 = Math.floor(info.height / texel);
  const 빈칸 = new Uint8Array(가로 * 세로);
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const p = ((gy * texel + (texel >> 1)) * W + gx * texel + (texel >> 1)) * ch;
    빈칸[gy * 가로 + gx] = data[p + 3] < ALPHA_MIN ? 1 : 0;
  }
  /* 바깥 배경을 가장자리에서 칠해 들어간다 — 안 칠해진 빈칸이 구멍이다. */
  const 바깥 = new Uint8Array(가로 * 세로);
  const 줄: number[] = [];
  for (let gx = 0; gx < 가로; gx++) for (const gy of [0, 세로 - 1]) { const i = gy * 가로 + gx; if (빈칸[i] && !바깥[i]) { 바깥[i] = 1; 줄.push(i); } }
  for (let gy = 0; gy < 세로; gy++) for (const gx of [0, 가로 - 1]) { const i = gy * 가로 + gx; if (빈칸[i] && !바깥[i]) { 바깥[i] = 1; 줄.push(i); } }
  for (let h = 0; h < 줄.length; h++) {
    const q = 줄[h], x = q % 가로, y = (q / 가로) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= 가로 || ny >= 세로) continue;
      const k = ny * 가로 + nx;
      if (빈칸[k] && !바깥[k]) { 바깥[k] = 1; 줄.push(k); }
    }
  }
  let 구멍 = 0, 잉크 = 0;
  for (let i = 0; i < 가로 * 세로; i++) { if (!빈칸[i]) 잉크++; else if (!바깥[i]) 구멍++; }
  return { 구멍, 잉크 };
}

/**
 * **테두리가 둘러져 있나** — 11-09 사장님: *"나중에 실수하면 안 돼."*
 *
 * 그날 오전에 일곱 명에게 흰 테두리를 둘렀는데, 오후에 **새로 만든 셋에는 안 둘렀다.**
 * 사장님이 열 명 사진에서 바로 알아보셨다. 사람이 기억해야 하는 일은 언제든 또 빠진다 —
 * 그래서 **자로 만들어 만드는 길과 켜는 문 양쪽에 건다.**
 *
 * 세는 법: 실루엣 **가장 바깥 잉크 칸**(배경에 닿은 칸) 중 **흰색에 가까운 칸의 비율**.
 * 둘렀으면 거의 1, 안 둘렀으면 머리·옷 색이라 낮다. 흰옷을 입은 사람도 테두리가 없으면
 * 머리 쪽 바깥 칸이 어두워서 1 이 안 나온다.
 */
export async function outlineShare(png: Buffer, texel: number): Promise<{ 바깥칸: number; 흰칸: number; 비율: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, ch = info.channels;
  const 가로 = Math.floor(W / texel), 세로 = Math.floor(info.height / texel);
  const 칸 = (gx: number, gy: number) => {
    const p = ((gy * texel + (texel >> 1)) * W + gx * texel + (texel >> 1)) * ch;
    return [data[p], data[p + 1], data[p + 2], data[p + 3]] as const;
  };
  let 바깥칸 = 0, 흰칸 = 0;
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const c = 칸(gx, gy);
    if (c[3] < ALPHA_MIN) continue;
    /**
     * **캔버스 끝에 닿은 칸은 안 센다.** 거기는 바깥이 없어서 테두리를 칠할 자리가 없다 —
     * 처음엔 끝에 닿은 것도 "바깥 칸" 으로 세어 린 85%·유나 80% 가 나왔고, 둘 다 **제대로
     * 둘러진 그림**이었다(머리·어깨가 캔버스 아래에 닿는다). 못 재는 자리를 틀린 것으로
     * 세면 자가 거짓말을 한다([[zero-can-mean-i-cannot-see]]).
     */
    let 바깥인가 = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= 가로 || ny >= 세로) continue;   // 캔버스 밖 — 셈에서 뺀다
      if (칸(nx, ny)[3] < ALPHA_MIN) { 바깥인가 = true; break; }
    }
    if (!바깥인가) continue;
    바깥칸++;
    if (c[0] >= 235 && c[1] >= 235 && c[2] >= 235) 흰칸++;
  }
  return { 바깥칸, 흰칸, 비율: 바깥칸 ? 흰칸 / 바깥칸 : 0 };
}

/** 문턱 — 쓰고 있는 열 명을 재서 정한다. 둘렀으면 0.9 를 넘고, 안 둘렀으면 한참 아래다. */
export const OUTLINE_MIN = 0.9;
