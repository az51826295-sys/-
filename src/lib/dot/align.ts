import sharp from "sharp";

/**
 * **캐릭터를 같은 바닥선에 세운다** — 11-08 사장님: *"하나로 정해 퀄리티를 일정하게"*.
 *
 * ## 무엇이 어긋나 있었나
 *
 * 11-08 에 일곱을 나란히 재 보니 발밑 여백이 **0 / 16 / 24 / 32px 네 가지**였다. 캐릭터마다
 * 시트를 따로 뽑았으니 장마다 사람이 다른 높이에 앉은 것이다. 나란히 세우면 바닥이 네 군데다.
 *
 * ## 왜 **크기는 안 건드리나**
 *
 * 이 그림들은 512×512 인데 **도트 한 칸이 8px** 이다 — 진짜 해상도는 64×64 이고, 보이는 것은
 * 8배로 늘린 것이다. 그래서 크기를 1.1배 같은 **비정수 배율로 고치면 격자가 깨진다**: 지금
 * 일곱 다 지키고 있는 도트 8 · 순도 1.00 이 그 자리에서 무너진다(`dot_art_consistency` 가
 * 바로 잡아낸다 — 그 자의 사보타주가 정확히 1.5배 늘리기다).
 *
 * → **자리는 코드가 맞추고, 크기는 뽑을 때 맞춘다.** 평행이동은 픽셀을 다시 섞지 않으므로
 *   무손실이다. 단 **8의 배수만큼만** 옮긴다 — 어긋나게 옮기면 캔버스 기준 격자가 밀린다.
 *   지금 값 0/16/24/32 가 전부 8의 배수라 일곱 다 무손실로 맞는다.
 */

/** 그림 한 변. 일곱 다 512 로 확인됐다(11-08). */
export const SPRITE_SIZE = 512;
/** 도트 한 칸. 옮기는 단위이기도 하다. */
export const TEXEL = 8;
/**
 * 바닥선 — 발밑 여백 몇 px 로 세울까.
 * **0 으로 못 박는다**: 네 값(0/16/24/32) 중 셋(린·서하·유나)이 이미 0 이라 제일 적게 움직이고,
 * 캔버스 바닥이 곧 바닥선이 되므로 말풍선 위에 얹을 때 자리를 또 계산할 일이 없다.
 */
export const FOOT_MARGIN = 0;

export type AlignReport = {
  /** 세로로 몇 px 옮겼나(+ 는 아래로). */
  dy: number;
  /** 가로로 몇 px 옮겼나(+ 는 오른쪽). */
  dx: number;
  /** 옮기기 전 발밑 여백. */
  footBefore: number;
  /** 잉크가 들어찬 칸(가로·세로) — 크기가 같은지 보는 값. */
  bodyW: number;
  bodyH: number;
  /** 옮기면 잘려 나갈 뻔해서 덜 옮긴 경우. */
  clamped: boolean;
};

/** 알파가 있는 칸의 테두리. 없으면 null. */
async function bbox(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  let top = -1, bottom = -1, left = W, right = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * C + 3] > 16) {
        if (top < 0) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return top < 0 ? null : { top, bottom, left, right, W, H };
}

/** 8 의 배수로 내림/올림 — 격자를 밀지 않기 위해 **항상** 이걸 통과시킨다. */
const 격자에맞춤 = (n: number) => Math.round(n / TEXEL) * TEXEL;

/**
 * 그림 하나를 바닥선에 세운다(그리고 가로 가운데로). **픽셀은 다시 섞지 않는다.**
 * `center` 를 끄면 세로만 맞춘다.
 */
export async function alignSprite(png: Buffer, center = true): Promise<{ png: Buffer; report: AlignReport }> {
  const b = await bbox(png);
  if (!b) return { png, report: { dy: 0, dx: 0, footBefore: -1, bodyW: 0, bodyH: 0, clamped: false } };

  const footBefore = b.H - 1 - b.bottom;
  let dy = 격자에맞춤(footBefore - FOOT_MARGIN); /* 여백이 크면 아래로 내린다 */
  let dx = 0;
  if (center) {
    const 가운데 = (b.W - (b.right - b.left + 1)) / 2;
    dx = 격자에맞춤(가운데 - b.left);
  }

  /* 옮기다 잘리면 안 된다 — 잘릴 만큼은 줄인다(줄였다는 사실을 보고한다). */
  let clamped = false;
  const 줄임 = (d: number, 앞: number, 뒤: number) => {
    const 최대 = 격자에맞춤(뒤), 최소 = -격자에맞춤(앞);
    if (d > 최대) { clamped = true; return 최대; }
    if (d < 최소) { clamped = true; return 최소; }
    return d;
  };
  dy = 줄임(dy, b.top, b.H - 1 - b.bottom);
  dx = 줄임(dx, b.left, b.W - 1 - b.right);

  /* 옮기기. `composite` 는 음수 자리를 못 받으므로 **넓힌 뒤 창을 떠낸다** —
     넓힌 그림에서 원본은 (padLeft, padTop) 에 있고, 떠낼 창의 왼쪽 위는 (padLeft-dx, padTop-dy)
     로 두면 dx·dy 가 음수여도 0 이상이 된다. */
  const padTop = Math.max(dy, 0), padBottom = Math.max(-dy, 0);
  const padLeft = Math.max(dx, 0), padRight = Math.max(-dx, 0);
  const 나감 = dy === 0 && dx === 0
    ? png
    : await sharp(png)
        .ensureAlpha()
        .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extract({ left: padLeft - dx, top: padTop - dy, width: b.W, height: b.H })
        .png()
        .toBuffer();

  return {
    png: 나감,
    report: { dy, dx, footBefore, bodyW: b.right - b.left + 1, bodyH: b.bottom - b.top + 1, clamped },
  };
}
