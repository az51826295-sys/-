import sharp from "sharp";

/**
 * **움직임 만들기 — 프레임 나누기** (11-24 사장님: "도트 변환의 이점이 자르기잖아 · 기능을 넣고 설명하는 식으로").
 *
 * 진짜 도트로 바꾼 그림(한 칸 = 1px)에서 캐릭터 프레임을 찾아 **같은 크기 칸에 같은 자리로** 맞춘다.
 * 칸 격자 위라 정수 칸으로 정확히 맞출 수 있다 — AI 원본(7.3px 같은 애매한 간격)에서는 안 되는 일.
 *
 * 찾는 법:
 *  - 사람이 "가로 N × 세로 M" 을 주면 그대로 고르게 나눈다.
 *  - 안 주면 배경색(가장자리에서 가장 흔한 색)이 아닌 덩어리를 찾는다. 
 *    1칸 틈까지는 같은 덩어리, 아주 작은 덩어리(가장 큰 것의 3% 미만)는 가장 가까운 큰 덩어리에 붙인다.
 * 맞추는 법: 첫 프레임을 기준으로, 각 프레임을 ±3칸 안 정수 이동 중 **배경 아닌 칸이 가장 많이 같은 색인 자리**에 둔다.
 */
export type Frame = { x: number; y: number; w: number; h: number; dx: number; dy: number };
export type FrameSet = { frames: Frame[]; cellW: number; cellH: number; bg: [number, number, number] | null; how: "auto" | "grid" };

type Img = { d: Buffer; w: number; h: number };
const at = (im: Img, x: number, y: number) => { const i = (y * im.w + x) * 4; return [im.d[i], im.d[i + 1], im.d[i + 2], im.d[i + 3]]; };
const near = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 30;

function edgeBg(im: Img): [number, number, number] | null {
  const count = new Map<number, number>(); let best = 0, key = -1;
  const add = (x: number, y: number) => { const p = at(im, x, y); if (p[3] < 128) return; const k = (p[0] << 16) | (p[1] << 8) | p[2]; const v = (count.get(k) ?? 0) + 1; count.set(k, v); if (v > best) { best = v; key = k; } };
  for (let x = 0; x < im.w; x++) { add(x, 0); add(x, im.h - 1); }
  for (let y = 0; y < im.h; y++) { add(0, y); add(im.w - 1, y); }
  const edge = 2 * (im.w + im.h);
  return key >= 0 && best >= edge * 0.4 ? [(key >> 16) & 255, (key >> 8) & 255, key & 255] : null; // 가장자리 40% 이상이 한 색일 때만 배경으로 본다
}

/**
 * clearBg(11-25): 배경이 **투명**인 그림도 자동으로 받는다 — 글로 만들기(한 명만 있는 그림)에서만 켠다.
 * 시트에는 켜지 않는다: 투명 시트(taeo-sheet)는 위아래 칸이 붙어 있어 덩어리 3개로 잘못 나뉘었다 → 그때는 "가로·세로를 정하라"가 맞다(frames_check).
 */
export async function findFrames(small: Buffer, opt: { cols?: number; rows?: number; clearBg?: boolean } = {}): Promise<FrameSet> {
  const { data, info } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const im: Img = { d: data, w: info.width, h: info.height };
  const bg = edgeBg(im);
  const isFg = (x: number, y: number) => { const p = at(im, x, y); return p[3] >= 128 && !(bg && near(p, bg)); };

  let boxes: { x: number; y: number; w: number; h: number }[];
  let how: FrameSet["how"] = "grid";
  if (opt.cols && opt.rows) {
    boxes = [];
    for (let j = 0; j < opt.rows; j++) for (let i = 0; i < opt.cols; i++) {
      const x0 = Math.round((i * im.w) / opt.cols), x1 = Math.round(((i + 1) * im.w) / opt.cols), y0 = Math.round((j * im.h) / opt.rows), y1 = Math.round(((j + 1) * im.h) / opt.rows);
      boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  } else {
    // clearBg 면: 가장자리 40% 이상이 투명일 때 투명이 곧 배경이다(isFg 가 알파로 가른다)
    let clear = 0; for (let x = 0; x < im.w; x++) { if (at(im, x, 0)[3] < 128) clear++; if (at(im, x, im.h - 1)[3] < 128) clear++; }
    for (let y = 0; y < im.h; y++) { if (at(im, 0, y)[3] < 128) clear++; if (at(im, im.w - 1, y)[3] < 128) clear++; }
    if (!bg && (!opt.clearBg || clear < 2 * (im.w + im.h) * 0.4)) throw new Error("배경이 한 색이 아니라 프레임을 자동으로 못 나눠요 — 가로·세로 개수를 정해 주세요.");
    how = "auto";
    // 1칸 틈까지만 이어 본다(3칸이면 윗줄 캐릭터와 아랫줄 얼굴 조각이 한 덩어리가 됐다 — 11-24 frames_check)
    const R = 1, lab = new Int32Array(im.w * im.h).fill(-1);
    const fg = new Uint8Array(im.w * im.h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) fg[y * im.w + x] = isFg(x, y) ? 1 : 0;
    const raw: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
    for (let s = 0; s < fg.length; s++) {
      if (!fg[s] || lab[s] >= 0) continue;
      const id = raw.length, b = { x0: im.w, y0: im.h, x1: 0, y1: 0, n: 0 }, st = [s]; lab[s] = id;
      while (st.length) {
        const c = st.pop()!, cx = c % im.w, cy = (c / im.w) | 0;
        b.x0 = Math.min(b.x0, cx); b.x1 = Math.max(b.x1, cx); b.y0 = Math.min(b.y0, cy); b.y1 = Math.max(b.y1, cy); b.n++;
        for (let yy = Math.max(0, cy - R); yy <= Math.min(im.h - 1, cy + R); yy++) for (let xx = Math.max(0, cx - R); xx <= Math.min(im.w - 1, cx + R); xx++) {
          const q = yy * im.w + xx; if (fg[q] && lab[q] < 0) { lab[q] = id; st.push(q); }
        }
      }
      raw.push(b);
    }
    if (!raw.length) throw new Error("그림에서 캐릭터를 못 찾았어요.");
    const big = Math.max(...raw.map((b) => b.n));
    const keep = raw.filter((b) => b.n >= big * 0.03);
    for (const s of raw.filter((b) => b.n < big * 0.03)) { // 작은 조각은 가장 가까운 큰 덩어리에
      const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
      let t = keep[0], bd = Infinity; for (const k of keep) { const d = Math.hypot((k.x0 + k.x1) / 2 - cx, (k.y0 + k.y1) / 2 - cy); if (d < bd) { bd = d; t = k; } }
      t.x0 = Math.min(t.x0, s.x0); t.x1 = Math.max(t.x1, s.x1); t.y0 = Math.min(t.y0, s.y0); t.y1 = Math.max(t.y1, s.y1);
    }
    // 줄 순서: 위에서 아래로(세로로 반 넘게 겹치면 같은 줄), 줄 안에서 왼쪽부터
    keep.sort((a, b) => a.y0 - b.y0);
    const lines: (typeof keep)[] = [];
    for (const k of keep) { const L = lines.find((l) => Math.min(l[0].y1, k.y1) - Math.max(l[0].y0, k.y0) > 0.5 * Math.min(l[0].y1 - l[0].y0, k.y1 - k.y0)); if (L) L.push(k); else lines.push([k]); }
    // 크기가 크게 다른 줄(얼굴만 따로 그린 작은 줄 등)은 첫 줄과 섞지 않는다 — 첫 줄과 높이가 비슷한 줄만
    const h0 = Math.max(...lines[0].map((b) => b.y1 - b.y0 + 1));
    boxes = lines.filter((l) => Math.abs(Math.max(...l.map((b) => b.y1 - b.y0 + 1)) - h0) <= h0 * 0.2).flatMap((l) => l.sort((a, b) => a.x0 - b.x0)).map((b) => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 }));
  }
  const cellW = Math.max(...boxes.map((b) => b.w)), cellH = Math.max(...boxes.map((b) => b.h));
  // 같은 크기 칸으로 키운 상자(바닥·가운데 맞춤)에서 시작해 ±3칸 맞추기
  const base = boxes.map((b) => ({ x: b.x - Math.floor((cellW - b.w) / 2), y: b.y - (cellH - b.h), w: cellW, h: cellH }));
  const px = (x: number, y: number) => (x < 0 || y < 0 || x >= im.w || y >= im.h ? null : isFg(x, y) ? at(im, x, y) : null);
  const frames: Frame[] = base.map((b, f) => {
    if (f === 0 || how === "grid") return { ...b, dx: 0, dy: 0 };
    let best = { s: -1, dx: 0, dy: 0 };
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      let s = 0;
      for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) { const p = px(base[0].x + x, base[0].y + y), q = px(b.x + x + dx, b.y + y + dy); if (p && q && p[0] === q[0] && p[1] === q[1] && p[2] === q[2]) s++; }
      if (s > best.s || (s === best.s && Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.dy))) best = { s, dx, dy };
    }
    return { ...b, dx: best.dx, dy: best.dy };
  });
  return { frames, cellW, cellH, bg, how };
}

/**
 * 프레임을 잘라 낸 RGBA 조각들(배경은 투명으로).
 * lockBottom(0~0.5): **몸통 고정** — 아래쪽 이 비율의 줄을 첫 프레임 것으로 모든 프레임에 쓴다. AI 는 표정마다 몸통을 조금씩 다르게
 * 그려서(11-24 시험: 같게 그린 칸 76%) 그대로 움직이면 몸이 떨린다. 표정 시트는 켜는 게 맞고, 동작 시트(걷기 등)는 끄는 게 맞다.
 */
/**
 * 11-25: 옆 프레임의 날개 끝처럼 **칸 옆 가장자리에 붙은 작은 조각**을 지운다(용 4방향 1번 칸에 2번 날개 조각이 들어왔다).
 * 본체(가장 큰 덩어리)의 10% 미만이고 왼쪽·오른쪽 가장자리에 닿은 덩어리만 — 떠 있는 작은 장식(가장자리에 안 닿음)은 남긴다.
 */
function dropEdgeBits(out: Buffer, w: number, h: number): Buffer {
  const lab = new Int32Array(w * h).fill(-1), sizes: number[] = [], edge: boolean[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!out[i * 4 + 3] || lab[i] >= 0) continue;
    const id = sizes.length; sizes.push(0); edge.push(false);
    const st = [i]; lab[i] = id;
    while (st.length) {
      const q = st.pop()!; sizes[id]++;
      const x = q % w, y = (q - x) / w;
      if (x === 0 || x === w - 1) edge[id] = true;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx; if (lab[k] >= 0 || !out[k * 4 + 3]) continue;
        lab[k] = id; st.push(k);
      }
    }
  }
  if (sizes.length < 2) return out;
  const big = Math.max(...sizes);
  for (let i = 0; i < w * h; i++) { const id = lab[i]; if (id >= 0 && edge[id] && sizes[id] < big * 0.1) out.fill(0, i * 4, i * 4 + 4); }
  return out;
}

/**
 * 11-25 사장님 "왜 안 지워진 거야?": 군인 4방향 테두리에 하늘색 점 11개가 남았다. 그림 AI 가 배경(#B0C4DE)과 캐릭터 사이에
 * 조금 밝은 번짐(185,208,234 — 배경과 거리 33)을 그렸는데, 배경 지우기 문턱이 30 이라 1 차이로 살아남았다.
 * 문턱만 올리면 기사 은색 갑옷(배경과 거리 20, 393칸)이 같이 지워진다 → **외톨이만** 지운다:
 * 배경색과 가깝고(거리 < 48) · 투명과 맞닿고 · 붙은 칠한 이웃 중 배경색과 가까운 칸이 하나도 없는 칸(갑옷처럼 넓은 밝은 면의 가장자리는 남는다).
 */
export const PIXEL_BG: [number, number, number] = [0xb0, 0xc4, 0xde];
export function dropBgSpecks(out: Buffer, w: number, h: number, bg: [number, number, number] = PIXEL_BG): number {
  // 11-25 둘째 고침: 옆모습 군인에 붙어 있는 **두 칸짜리** 번짐이 남았다(외톨이 한 칸만 지웠다) →
  // 배경색과 가까운 칸끼리 이은 덩어리 중 **6칸 이하 · 투명과 맞닿은** 것을 지운다. 갑옷처럼 넓은 면(수백 칸)은 남는다.
  const near = (q: number) => { const i = q * 4; return !!out[i + 3] && Math.abs(out[i] - bg[0]) + Math.abs(out[i + 1] - bg[1]) + Math.abs(out[i + 2] - bg[2]) < 48; };
  const seen = new Uint8Array(w * h); let killed = 0;
  for (let s0 = 0; s0 < w * h; s0++) {
    if (seen[s0] || !near(s0)) continue;
    const comp: number[] = [], st = [s0]; seen[s0] = 1; let clear = false;
    while (st.length) {
      const q = st.pop()!; comp.push(q);
      const x = q % w, y = (q - x) / w;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { clear = true; continue; }
        const k = ny * w + nx;
        if (!out[k * 4 + 3]) { clear = true; continue; }
        if (!seen[k] && near(k)) { seen[k] = 1; st.push(k); }
      }
    }
    if (clear && comp.length <= 6) { for (const q of comp) out.fill(0, q * 4, q * 4 + 4); killed += comp.length; }
  }
  return killed;
}

export async function cutFrames(small: Buffer, set: FrameSet, opt: { lockBottom?: number; dropEdgeBits?: boolean } = {}): Promise<Buffer[]> {
  const { data, info } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const im: Img = { d: data, w: info.width, h: info.height };
  return set.frames.map((f) => {
    const out = Buffer.alloc(set.cellW * set.cellH * 4);
    for (let y = 0; y < set.cellH; y++) for (let x = 0; x < set.cellW; x++) {
      const sx = f.x + f.dx + x, sy = f.y + f.dy + y;
      if (sx < 0 || sy < 0 || sx >= im.w || sy >= im.h) continue;
      const p = at(im, sx, sy); if (p[3] < 128 || (set.bg && near(p, set.bg))) continue;
      out[(y * set.cellW + x) * 4] = p[0]; out[(y * set.cellW + x) * 4 + 1] = p[1]; out[(y * set.cellW + x) * 4 + 2] = p[2]; out[(y * set.cellW + x) * 4 + 3] = 255;
    }
    if (opt.dropEdgeBits) { if (!process.env.PIXEL_NO_SPECKS) dropBgSpecks(out, set.cellW, set.cellH, set.bg ?? PIXEL_BG); return dropEdgeBits(out, set.cellW, set.cellH); } // PIXEL_NO_SPECKS: 자의 심은 고장 전용
    return out;
  }).map((out, f, all) => {
    const lock = Math.min(0.5, Math.max(0, opt.lockBottom ?? 0));
    if (!lock || f === 0) return out;
    const y0 = Math.floor(set.cellH * (1 - lock)), row = set.cellW * 4;
    all[0].copy(out, y0 * row, y0 * row, set.cellH * row);
    return out;
  });
}

/** 게임용 시트: 프레임을 가로로 한 줄, 1배(한 칸 = 1px), 배경 투명. */
export async function sheetOf(cuts: Buffer[], set: FrameSet): Promise<Buffer> {
  return sharp({ create: { width: set.cellW * cuts.length, height: set.cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cuts.map((input, i) => ({ input, raw: { width: set.cellW, height: set.cellH, channels: 4 as const }, left: i * set.cellW, top: 0 }))).png().toBuffer();
}

/** 움직이는 GIF: scale 배, 프레임마다 ms, 배경색 채움(GIF 반투명 가장자리 문제를 피한다). stripes=true 면 미리보기 줄무늬. */
export async function gifOf(cuts: Buffer[], set: FrameSet, o: { scale: number; ms: number; bg?: [number, number, number]; stripes?: boolean }): Promise<Buffer> {
  const W = set.cellW * o.scale, H = set.cellH * o.scale, b = o.bg ?? set.bg ?? [240, 240, 244];
  const stripes = o.stripes ? Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="p" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="10" height="36" fill="#ffffff" fill-opacity="0.42"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`) : null;
  const pngs = await Promise.all(cuts.map(async (c) => {
    const flat = await sharp({ create: { width: set.cellW, height: set.cellH, channels: 4, background: { r: b[0], g: b[1], b: b[2], alpha: 1 } } }).composite([{ input: c, raw: { width: set.cellW, height: set.cellH, channels: 4 } }]).png().toBuffer();
    const big = await sharp(flat).resize(W, H, { kernel: "nearest" }).png().toBuffer();
    return stripes ? sharp(big).composite([{ input: stripes }]).png().toBuffer() : big;
  }));
  return sharp(pngs, { join: { animated: true } }).gif({ delay: cuts.map(() => o.ms), loop: 0, effort: 7 }).toBuffer();
}
