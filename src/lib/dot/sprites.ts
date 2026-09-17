import sharp from "sharp";
import { EMOTIONS, type Emotion } from "./bond";

/**
 * 표정 여섯 장 — **한 장에 그려서 자른다.**
 *
 * 이 제품에서 유일하게 어려운 자리다. 표정을 여섯 번 따로 주문하면 **여섯 명이
 * 나온다.** 생성기는 회차마다 흔들리고, 그 흔들림이 얼굴에 그대로 나온다.
 * 오늘 3D 에서 겪은 병(따로 만든 조각이 몸에 안 맞음)과 뿌리가 같다.
 *
 * 그래서 한 번의 호출로 **한 장에 여섯 칸**을 그린다. 같은 그림 안에 있으면 같은
 * 얼굴일 수밖에 없다. 값도 여섯 번이 아니라 한 번이다.
 *
 * ## 왜 칸을 찾지 않고 정해진 자리에서 자르는가
 *
 * 회전 시트를 자를 때는 밝기로 칸을 찾았다(`meshAssets/panels.ts`). 여기서는 3×2 로
 * 그리라고 시켰으니 **자리가 이미 정해져 있다.** 찾아서 자르면 후광 하나에 칸이
 * 어긋나고, 어긋난 것을 알아채는 자가 없다. 정해진 자리에서 자르고, 자른 뒤에
 * **비었는지·같은 사람인지**를 잰다 — 틀리면 틀렸다고 말할 수 있는 쪽이다.
 */

/** 3×2 로 그린다. 이 순서가 시트의 왼쪽 위부터 오른쪽 아래까지. */
export const SHEET_ORDER: Emotion[] = ["neutral", "happy", "shy", "sad", "angry", "surprised"];
const COLS = 3, ROWS = 2;

const FACE: Record<Emotion, string> = {
  neutral: "calm neutral expression, looking straight ahead",
  happy: "big warm smile, eyes crinkled with joy",
  shy: "bashful, blushing cheeks, eyes looking away",
  sad: "downcast eyes, small frown, dejected",
  angry: "frowning, eyebrows drawn together, annoyed puff",
  surprised: "wide eyes, small open mouth, startled",
};

export type CharacterLook = {
  name: string;
  /** 겉모습 한 줄. 사장님이 준 그대로. 여기 없는 것을 지어내지 않는다. */
  appearance: string;
};

/**
 * 시트 한 장을 주문하는 말.
 *
 * 네 가지를 못 박는다: (1) 3×2 여섯 칸, (2) **같은 인물**, 옷·머리·색이 칸마다
 * 똑같을 것, (3) 배경은 비울 것, (4) **조잡하고 귀엽게** — 사장님 09-09:
 * "이런 2d 말고 더 조잡하고 귀엽게". 첫 판은 매끈한 일러스트가 나왔다.
 *
 * 다만 말로 부탁한 것은 지켜지지 않는 날이 있다. 그래서 나온 뒤에 `pixelize` 가
 * **강제로 뭉갠다** — 조잡함을 주문이 아니라 구조로 만든다.
 */
export function sheetPrompt(look: CharacterLook): string {
  const cells = SHEET_ORDER.map((e, i) => `${i + 1}. ${FACE[e]}`).join(" ");
  return [
    `Chunky low-resolution pixel art sprite sheet, like a 1990s handheld game. A 3x2 grid of exactly 6 cells, equal size, left to right then top to bottom.`,
    `Every cell shows THE SAME character — identical hairstyle, identical hair color, identical clothing, identical palette. Only the facial expression changes.`,
    `Character: ${look.appearance}.`,
    `Super-deformed chibi proportions: very big round head, tiny shoulders, simple cute face with small dot eyes and a tiny mouth. Facing the viewer, centered in its cell.`,
    `Cells in order: ${cells}`,
    `Style: VERY low resolution, about 48x48 pixels per cell, huge visible square pixels, thick chunky blocks, hard jagged edges, no smoothing, no anti-aliasing, no gradients, no shading detail. Flat solid colors from a tiny palette of about 10 colors. Crude and charming, not polished, not an illustration.`,
    `Background: one flat solid pure magenta color (#FF00FF) filling everything behind the characters and the gutters between cells — NOT transparent, NOT a checkerboard. No grid lines, no borders, no frames, no text, no labels, no numbers, no watermark, no speech bubbles, no motion lines.`,
  ].join(" ");
}

/**
 * **크기를 맞춘다.**
 *
 * 09-09 사장님: "퀄리티 일정하게." 화풍은 참조 시트로 맞췄는데 **크기가 제각각**이었다 —
 * 한 명은 칸을 꽉 채우고 한 명은 칸 가운데 작게 앉아 있었다. 목록에 나란히 놓으면
 * 그림 솜씨보다 이 차이가 먼저 보인다.
 *
 * 그림 모델에게 "같은 크기로 그려라" 라고 부탁해도 회차마다 흔들린다. 그래서 안 부탁하고
 * **자른 뒤에 잰다**: 투명하지 않은 부분의 상자를 찾아, 그 높이가 칸의 정해진 비율이
 * 되도록 키우거나 줄이고, 바닥에 맞춰 놓는다. 앞으로 나올 캐릭터도 전부 자동으로 맞는다.
 *
 * 바닥에 맞추는 이유: 사람 그림은 머리 높이가 제각각이라 가운데 정렬하면 눈높이가
 * 흔들린다. 어깨선을 맞추면 목록에서 줄이 선다.
 */
const FILL = 0.9;

/**
 * **배경을 지운다 — 가장자리에서 흘러 들어가며.**
 *
 * 09-11 사장님: "뒷 배경이 문제야." 유나 시트가 투명 배경 대신 **회색 체크무늬를 그림으로** 그려 왔다.
 * 그림 모델이 "투명" 을 흉내 낸 것이다. 자(배경_비었다)는 밝은 체크 칸을 배경으로 세어 통과시켰고,
 * 앱에서는 얼굴 뒤에 체크무늬가 그대로 떴다.
 *
 * 그래서 투명이 아닌 칸은 **네 모서리 색에서 시작해 이웃으로 번지며** 배경으로 만든다(플러드 필).
 * 체크무늬는 밝은 칸·어두운 칸 두 색이라 모서리 근처 두 색을 다 씨앗으로 쓴다. 인물 안쪽의
 * 비슷한 색(흰 셔츠 등)은 가장자리와 이어지지 않으므로 살아남는다.
 * 이미 투명한 그림은 손대지 않는다.
 */
async function keyOutBackground(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  // 이미 투명한 화소가 5% 이상이면 진짜 투명 배경 — 그대로.
  let transparent = 0;
  for (let p = 3; p < data.length; p += ch) if (data[p] < 128) transparent++;
  if (transparent / (W * H) >= 0.05) return png;

  // 마젠타 배경(09-11 부터 주문하는 것): 옷·머리·살에 없는 색이라 **어디에 있든** 지운다. 도윤 첫 판에서
  // 흰 셔츠가 가장자리와 이어져 플러드 필에 먹혔다 — 색으로 가르면 그런 일이 없다.
  {
    let magenta = 0;
    const isMag = (p: number) => data[p] > 170 && data[p + 2] > 120 && data[p + 1] < 110 && (data[p] - data[p + 1]) > 90;
    for (let p = 0; p < data.length; p += ch) if (isMag(p)) magenta++;
    if (magenta / (W * H) >= 0.05) {
      for (let p = 0; p < data.length; p += ch) if (isMag(p)) data[p + 3] = 0;
      // 09-11 사장님 "도트 제대로 안 자르냐": 머리카락 가장자리에 마젠타가 섞인 보라 화소가 남았다(안티에일리어싱).
      // 투명과 맞닿은 화소 중 붉고 푸른데 초록이 빠진 것(마젠타 기운)은 두 번 벗겨 낸다.
      const tinted = (p: number) => data[p + 3] > 0 && (data[p] - data[p + 1]) > 35 && (data[p + 2] - data[p + 1]) > 35;
      for (let pass = 0; pass < 2; pass++) {
        const kill: number[] = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const p = (y * W + x) * ch;
          if (!tinted(p)) continue;
          let edge = false;
          for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) { edge = true; break; }
            if (data[(ny * W + nx) * ch + 3] === 0) { edge = true; break; }
          }
          if (edge) kill.push(p);
        }
        for (const p of kill) data[p + 3] = 0;
      }
      return await sharp(data, { raw: { width: W, height: H, channels: ch } }).png().toBuffer();
    }
  }

  // 씨앗 색: 네 모서리와 그 안쪽 12px 의 색을 모아 서로 다른 두세 톤을 뽑는다(체크무늬의 밝은/어두운 칸).
  const seeds: [number, number, number][] = [];
  const take = (x: number, y: number) => { const p = (y * W + x) * ch; const c: [number, number, number] = [data[p], data[p + 1], data[p + 2]]; if (!seeds.some((s) => dist(s, c) < 30)) seeds.push(c); };
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]] as [number, number][]) {
    for (let dy = 0; dy < 12; dy += 4) for (let dx = 0; dx < 12; dx += 4) take(Math.min(W - 1, Math.max(0, x + (x === 0 ? dx : -dx))), Math.min(H - 1, Math.max(0, y + (y === 0 ? dy : -dy))));
  }
  const isBg = (p: number) => seeds.some((s) => dist(s, [data[p], data[p + 1], data[p + 2]]) < 40);

  // 플러드 필(가장자리에서). 방문 표시는 별도 배열.
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  let cleared = 0;
  while (stack.length) {
    const i = stack.pop() as number;
    if (seen[i]) continue;
    seen[i] = 1;
    const p = i * ch;
    if (!isBg(p)) continue;
    data[p + 3] = 0; cleared++;
    const x = i % W, y = (i - x) / W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W);
    if (y < H - 1) stack.push(i + W);
  }
  if (cleared / (W * H) < 0.05) return png;   // 배경이라 할 만한 게 없다 — 원본 그대로
  return await sharp(data, { raw: { width: W, height: H, channels: ch } }).png().toBuffer();
}
function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/** 그림이 실제로 들어 있는 상자. 투명한 가장자리는 뺀다. */
async function contentBox(png: Buffer): Promise<{ w: number; h: number; art: Buffer } | null> {
  try {
    const art = await sharp(png).trim({ threshold: 10 }).png().toBuffer();
    const m = await sharp(art).metadata();
    if (!m.width || !m.height) return null;
    return { w: m.width, h: m.height, art };
  } catch {
    return null;
  }
}

/** 정해진 배율로 키워 **바닥에 맞춰** 놓는다(어깨선을 맞춰야 목록에서 줄이 선다). */
async function placeAt(png: Buffer, box: { w: number; h: number; art: Buffer } | null, scale: number): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0;
  if (!W || !H || !box) return png;

  // 배율이 커서 칸을 넘치면 그 칸만 줄인다 — 잘려 나가는 것보다 낫다.
  const fit = Math.min(scale, (H * FILL) / box.h, (W * FILL) / box.w);
  const nw = Math.max(1, Math.round(box.w * fit)), nh = Math.max(1, Math.round(box.h * fit));
  const resized = await sharp(box.art).resize(nw, nh, { kernel: "nearest" }).png().toBuffer();

  return await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: Math.round((W - nw) / 2), top: H - nh }])
    .png()
    .toBuffer();
}

/**
 * **강제로 조잡하게.**
 *
 * 그림 모델한테 "저해상도로 그려" 라고 하면 *저해상도처럼 보이는 고해상도* 를 그린다 —
 * 화소가 격자에 안 맞고, 가장자리가 부드럽고, 색이 수백 개다. 부탁으로는 안 된다.
 *
 * 그래서 **최근접 이웃으로 줄였다가 최근접 이웃으로 키운다.** 줄이는 순간 진짜로
 * 정보가 버려지고, 키울 때 네모가 그대로 커진다. 조잡함이 주문이 아니라 계산이 된다.
 * (첫 판이 매끈해서 사장님이 "더 조잡하고 귀엽게" 라고 했다.)
 */
export async function pixelize(png: Buffer, grid = 64, out = 512): Promise<Buffer> {
  const small = await sharp(png)
    .resize(grid, grid, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, colors: 24, dither: 0 })   // 색도 같이 줄인다 — 그라데이션이 남으면 조잡해 보이지 않는다
    .toBuffer();
  // 팔레트 PNG 가 배경 알파를 1 로, 그림 알파를 250~254 로 내보낸 칸이 있었다 — 굳히고, 떨어진 조각도 지운다.
  return await cleanSprite(await sharp(small).resize(out, out, { kernel: "nearest" }).png().toBuffer());
}

/**
 * 이미 있는 시트를 **본으로 삼아** 다른 캐릭터를 그리라는 말.
 *
 * 09-09 사장님: "퀄리티 일정하게, 서하랑 같게." 세 캐릭터를 따로 주문했더니 화풍이
 * 제각각이었다 — 한 명은 머리카락이 지저분하고 한 명은 어둡게 뭉갰다. 같은 말로
 * 주문해도 회차마다 흔들리는 것이 생성기의 성질이다.
 *
 * 표정 여섯 칸을 **한 장에** 그려서 얼굴을 맞춘 것과 같은 수를 한 단계 위에서 쓴다:
 * 제일 잘 나온 시트를 참조로 넣고 "이 화풍 그대로, 사람만 바꿔라" 라고 한다.
 * 부탁이 아니라 **눈앞에 놓고** 시키는 것이라 훨씬 잘 지켜진다.
 */
export function restylePrompt(look: CharacterLook): string {
  const cells = SHEET_ORDER.map((e, i) => `${i + 1}. ${FACE[e]}`).join(" ");
  return [
    `Redraw this expression sheet with a DIFFERENT character, keeping the art style EXACTLY the same.`,
    `Keep: the same 3x2 grid of 6 cells, the same chunky low-resolution pixel art, the same crisp hard pixel edges,`,
    `the same limited flat palette treatment, the same bust framing and character size within each cell,`,
    `the same super-deformed chibi proportions (big round head, tiny shoulders, simple cute face).`,
    `Background: one flat solid pure magenta color (#FF00FF) behind everything, including the gutters — NOT transparent, NOT a checkerboard.`,
    `Change ONLY who the character is. The new character: ${look.appearance}.`,
    `All 6 cells must show this same new character, identical hair and clothing in every cell, only the expression changes.`,
    `Cells in order: ${cells}`,
    `No text, no labels, no numbers, no grid lines, no borders, no speech bubbles, no motion lines.`,
  ].join(" ");
}

export type Cell = { emotion: Emotion; png: Buffer; inkRatio: number };

/** 시트를 정해진 자리에서 여섯 칸으로 자른다. */
export async function cutSheet(dataUrl: string): Promise<Cell[]> {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const src = sharp(Buffer.from(b64, "base64"));
  const meta = await src.metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0;
  if (!W || !H) throw new Error("시트 크기를 못 읽었다");

  const cw = Math.floor(W / COLS), chh = Math.floor(H / ROWS);

  const raw: Buffer[] = [];
  for (let i = 0; i < SHEET_ORDER.length; i++) {
    const cx = (i % COLS) * cw, cy = Math.floor(i / COLS) * chh;
    const cell = await sharp(Buffer.from(b64, "base64")).extract({ left: cx, top: cy, width: cw, height: chh }).png().toBuffer();
    raw.push(await keyOutBackground(cell));
  }

  // **한 시트에 한 배율.** 칸마다 따로 맞추면 같은 사람인데 표정마다 크기가 달라진다 —
  // 머리카락이 삐친 칸은 작아지고 다문 칸은 커진다. 목록에서 보면 그게 제일 먼저 보인다.
  // 가운데값(중앙값)을 쓰는 이유: 한 칸이 유난히 크거나 작아도 나머지 다섯이 안 흔들린다.
  const boxes = await Promise.all(raw.map(contentBox));
  const heights = boxes.map((b) => b?.h ?? 0).filter((h) => h > 0).sort((a, b) => a - b);
  const median = heights.length ? heights[Math.floor(heights.length / 2)] : chh;
  const scale = median > 0 ? (chh * FILL) / median : 1;

  const cells: Cell[] = [];
  for (let i = 0; i < raw.length; i++) {
    const dot = await pixelize(await placeAt(raw[i], boxes[i], scale));
    cells.push({ emotion: SHEET_ORDER[i], png: dot, inkRatio: await inkRatioOf(dot) });
  }
  return cells;
}

/** 칸에 있는 알파 값들. */
async function alphaKindsOf(png: Buffer): Promise<number[]> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const set = new Set<number>();
  for (let p = 3; p < data.length; p += info.channels) set.add(data[p]);
  return [...set];
}

/** 가장 큰 연결 성분(몸통) 밖에 있는 그림 화소 수. 4방향 연결. 알파 ≥128 을 그림으로 본다. */
async function islandPixelsOf(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const seen = new Uint8Array(W * H); const sizes: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || data[i * ch + 3] < 128) continue;
    let n = 0; const st = [i]; seen[i] = 1;
    while (st.length) {
      const j = st.pop() as number; n++;
      const x = j % W, y = (j - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx; if (seen[k] || data[k * ch + 3] < 128) continue; seen[k] = 1; st.push(k);
      }
    }
    sizes.push(n);
  }
  sizes.sort((a, b) => b - a);
  return sizes.slice(1).reduce((a, b) => a + b, 0);
}

/** 몸통 밖 조각을 지우고 알파를 0/255 로 굳힌다 — pixelize 뒤에 한 번. */
export async function cleanSprite(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  for (let p = 3; p < data.length; p += ch) data[p] = data[p] < 128 ? 0 : 255;
  const seen = new Uint8Array(W * H); const comps: number[][] = [];
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || data[i * ch + 3] === 0) continue;
    const comp: number[] = []; const st = [i]; seen[i] = 1;
    while (st.length) {
      const j = st.pop() as number; comp.push(j);
      const x = j % W, y = (j - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx; if (seen[k] || data[k * ch + 3] === 0) continue; seen[k] = 1; st.push(k);
      }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  for (const comp of comps.slice(1)) for (const j of comp) data[j * ch + 3] = 0;
  return await sharp(data, { raw: { width: W, height: H, channels: ch } }).png().toBuffer();
}

/** 투명과 맞닿은 그림 화소 중 마젠타 기운인 것의 비율(그림 화소 대비). */
async function fringeRatioOf(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  let ink = 0, bad = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * ch;
    if (data[p + 3] === 0) continue;
    ink++;
    if (!((data[p] - data[p + 1]) > 50 && (data[p + 2] - data[p + 1]) > 50)) continue;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || data[(ny * W + nx) * ch + 3] === 0) { edge = true; break; }
    }
    if (edge) bad++;
  }
  return ink ? bad / ink : 0;
}

/**
 * 96×96 로 줄인 raw 화소. **알파를 함께 낸다.**
 *
 * 첫 판에서 세 자가 전부 헛것이었다(칸마다 "그림 100%", "닮음 1.00", "514색").
 * gpt-image-2 는 배경을 **투명**으로 냈는데 자는 RGB 만 읽었다 — 투명한 자리에도
 * RGB 값이 들어 있어서 **배경이 전부 그림으로 세어졌다.** 배경이 분모를 채우면
 * 어느 칸이든 서로 닮아 보이고, 딴 사람이 나와도 통과한다.
 * 자기 분모에 배경이 섞이는 것은 이 회사가 오늘만 세 번째 겪는 병이다.
 */
async function rawOf(png: Buffer): Promise<{ data: Buffer; ch: number }> {
  // **줄일 때도 최근접으로.** 기본(lanczos)으로 줄이면 이웃 화소를 섞어 새 색을 만든다 —
  // 24색으로 줄여 놓은 그림을 재는데 253색이 나왔다. 자가 자기 손으로 색을 만들고 있었다.
  const { data, info } = await sharp(png)
    .resize(96, 96, { fit: "fill", kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, ch: info.channels };
}

/** 이 화소는 배경인가 — 투명하거나(알파), 알파가 없으면 거의 흰색이거나. */
function isBackground(data: Buffer, p: number, ch: number): boolean {
  if (ch >= 4 && data[p + 3] < 128) return true;
  return data[p] >= 235 && data[p + 1] >= 235 && data[p + 2] >= 235;
}

/** 배경이 아닌 화소의 비율. 빈 칸을 잡는다. */
async function inkRatioOf(png: Buffer): Promise<number> {
  const { data, ch } = await rawOf(png);
  let ink = 0, total = 0;
  for (let p = 0; p < data.length; p += ch) {
    total++;
    if (!isBackground(data, p, ch)) ink++;
  }
  return total ? ink / total : 0;
}

/**
 * 칸의 색 분포. 4×4×4 통에 담는다.
 *
 * 흰 바탕을 빼고 세는 것이 핵심이다 — 바탕이 대부분이면 모든 칸이 서로 비슷해
 * 보여서, **다른 사람이 나와도 통과한다.**
 */
async function paletteOf(png: Buffer): Promise<number[]> {
  const { data, ch } = await rawOf(png);
  const bins = new Array(64).fill(0);
  let n = 0;
  for (let p = 0; p < data.length; p += ch) {
    if (isBackground(data, p, ch)) continue; // 바탕은 안 센다
    bins[(data[p] >> 6) * 16 + (data[p + 1] >> 6) * 4 + (data[p + 2] >> 6)]++;
    n++;
  }
  return n ? bins.map((v) => v / n) : bins;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export type SheetCase = { name: string; result: "Passed" | "Failed" | "Inconclusive"; message: string };

/**
 * 잘라 낸 여섯 칸을 잰다.
 *
 * **같은 사람인가**를 재는 자가 이 파일의 존재 이유다. 눈으로 보면 바로 아는 것이고,
 * 안 재면 여섯 명이 든 앱이 나간다.
 */
export async function measureCells(cells: Cell[]): Promise<{ cases: SheetCase[]; similarity: number[] }> {
  const cases: SheetCase[] = [];

  cases.push({
    name: "칸_여섯개",
    result: cells.length === 6 ? "Passed" : "Failed",
    message: `${cells.length}칸 (6이어야 한다)`,
  });

  const empty = cells.filter((c) => c.inkRatio < 0.05);
  cases.push({
    name: "빈_칸_없음",
    result: empty.length === 0 ? "Passed" : "Failed",
    message: empty.length === 0
      ? `가장 옅은 칸도 ${Math.round(Math.min(...cells.map((c) => c.inkRatio)) * 100)}% 차 있다`
      : `빈 칸 ${empty.length}: ${empty.map((c) => c.emotion).join(", ")}`,
  });

  const palettes = await Promise.all(cells.map((c) => paletteOf(c.png)));
  const mean = palettes[0].map((_, i) => palettes.reduce((s, p) => s + p[i], 0) / palettes.length);
  const similarity = palettes.map((p) => cosine(p, mean));
  const worst = Math.min(...similarity);
  const odd = cells.filter((_, i) => similarity[i] < 0.75).map((c) => c.emotion);
  cases.push({
    name: "같은_사람",
    result: worst >= 0.75 ? "Passed" : "Failed",
    message: worst >= 0.75
      ? `가장 다른 칸도 ${worst.toFixed(2)} 닮았다 (≥0.75)`
      : `딴 사람 같은 칸: ${odd.join(", ")} (가장 낮은 닮음 ${worst.toFixed(2)})`,
  });

  const bgFree = await Promise.all(cells.map((c) => backgroundRatioOf(c.png)));
  const worstBg = Math.min(...bgFree);
  cases.push({
    name: "배경_비었다",
    result: worstBg >= 0.15 ? "Passed" : "Failed",
    message: worstBg >= 0.15
      ? `가장 꽉 찬 칸도 배경이 ${Math.round(worstBg * 100)}% (≥15%)`
      : `배경이 없다 — 칸이 통째로 그림이다(가장 적은 칸 ${Math.round(worstBg * 100)}%). 대화 화면에 얹을 수 없다`,
  });

  const corners = await Promise.all(cells.map((c) => cornersTransparent(c.png)));
  const badCorners = cells.filter((_, i) => !corners[i]).map((c) => c.emotion);
  cases.push({
    name: "모서리_투명",
    result: badCorners.length === 0 ? "Passed" : "Failed",
    message: badCorners.length === 0 ? "네 모서리가 전부 투명하다" : `모서리가 안 투명한 칸: ${badCorners.join(", ")} — 배경이 그림으로 박혀 있다`,
  });

  // 보라 테두리: 투명과 맞닿은 그림 화소 중 마젠타 기운(붉고 푸른데 초록이 빠진)이 얼마나 남았나. 0.5% 넘으면 덜 잘린 것.
  const fringes = await Promise.all(cells.map((c) => fringeRatioOf(c.png)));
  const worstFringe = Math.max(...fringes);
  cases.push({
    name: "보라_테두리",
    result: worstFringe <= 0.005 ? "Passed" : "Failed",
    message: worstFringe <= 0.005
      ? `가장 심한 칸도 테두리 보라 화소 ${(worstFringe * 100).toFixed(2)}% (≤0.5%)`
      : `보라 테두리 남음: ${cells.filter((_, i) => fringes[i] > 0.005).map((c) => c.emotion).join(", ")} (최대 ${(worstFringe * 100).toFixed(2)}%)`,
  });

  // 알파는 0 아니면 255 여야 한다 — 팔레트 PNG 가 배경을 알파 1 로 내보낸 칸이 있었다(서하 angry). 알파 1 은 눈엔 안 보이지만
  // 자(실루엣·얼굴 크롭)는 "그림" 으로 센다 → 칸 전체가 실루엣이 되고 얼굴 크롭이 틀어진다(09-11 사장님 "도트 자르기 잘 안 됨").
  const alphaKinds = await Promise.all(cells.map((c) => alphaKindsOf(c.png)));
  const softCells = cells.filter((_, i) => alphaKinds[i].some((a) => a !== 0 && a !== 255)).map((c) => c.emotion);
  cases.push({
    name: "알파_이진",
    result: softCells.length === 0 ? "Passed" : "Failed",
    message: softCells.length === 0 ? "모든 칸이 알파 0/255 뿐이다" : `반투명 알파가 남은 칸: ${softCells.join(", ")}`,
  });

  // 떨어진 점: 몸통과 안 붙은 작은 조각(배경 찌꺼기). 0 이어야 한다.
  const islands = await Promise.all(cells.map((c) => islandPixelsOf(c.png)));
  const islandCells = cells.filter((_, i) => islands[i] > 0).map((c, i) => `${c.emotion}(${islands[cells.indexOf(c)]}px)`);
  cases.push({
    name: "떨어진_점",
    result: islandCells.length === 0 ? "Passed" : "Failed",
    message: islandCells.length === 0 ? "몸통 밖에 떨어진 조각이 없다" : `떨어진 조각: ${islandCells.join(", ")}`,
  });

  const colorCounts = await Promise.all(cells.map((c) => uniqueColorsOf(c.png)));
  const most = Math.max(...colorCounts);
  cases.push({
    name: "도트다",
    result: most <= 40 ? "Passed" : "Failed",
    message: `가장 색이 많은 칸 ${most}색 (≤40 — pixelize 가 24색으로 줄인 뒤라 이보다 많으면 뭉개기가 안 먹은 것이다)`,
  });

  return { cases, similarity };
}

/** 양자화한 색의 가짓수. 그라데이션이 낀 그림은 여기서 폭발한다. */
async function uniqueColorsOf(png: Buffer): Promise<number> {
  const { data, ch } = await rawOf(png);
  const seen = new Set<number>();
  for (let p = 0; p < data.length; p += ch) {
    if (isBackground(data, p, ch)) continue;
    seen.add(((data[p] >> 3) << 10) | ((data[p + 1] >> 3) << 5) | (data[p + 2] >> 3));
  }
  return seen.size;
}

export { EMOTIONS };

/** 배경(투명하거나 흰) 화소의 비율. 대화 화면에 얹으려면 배경이 있어야 한다. */
async function backgroundRatioOf(png: Buffer): Promise<number> {
  const { data, ch } = await rawOf(png);
  let bg = 0, total = 0;
  for (let p = 0; p < data.length; p += ch) {
    total++;
    if (isBackground(data, p, ch)) bg++;
  }
  return total ? bg / total : 0;
}

/** 네 모서리 화소가 전부 투명한가. 체크무늬·단색 배경이 그림으로 박혀 있으면 여기서 걸린다. */
async function cornersTransparent(png: Buffer): Promise<boolean> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const a = (x: number, y: number) => data[(y * W + x) * ch + 3];
  return a(0, 0) < 128 && a(W - 1, 0) < 128 && a(0, H - 1) < 128 && a(W - 1, H - 1) < 128;
}
