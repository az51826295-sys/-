import sharp from "sharp";

/**
 * **AI 가 뽑은 "도트 같은 그림" → 진짜 도트** (11-24, 사장님 "AI 로 뽑으니까 진짜 도트가 아니더라 · 4,900원").
 *
 * AI 도트는 도트 크기가 일정하지 않다: 한 칸이 8.6px 이다가 9.1px 이 되고, 경계마다 중간색(안티에일리어싱)이
 * 끼어 있다. 예전 `pixelize` 는 128 격자를 **그림 모서리부터** 덮어서 AI 의 칸과 어긋났고 — 얼굴이 더 뭉개졌다.
 *
 * 여기서는 그림이 스스로 가진 격자를 찾는다:
 *  1. 가로·세로로 색이 바뀌는 자리(경계)를 센다.
 *  2. **소수 주기**(예: 8.65px)와 시작점을 같이 고른다 — 경계가 가장 많이 앉는 빗.
 *  3. 빗살을 하나씩 **근처 진짜 경계로 붙인다** — 칸 크기가 흘러도 따라간다.
 *  4. 칸마다 가운데 쪽 화소들의 **최빈색**(중간색은 가장자리에 있으니 안쪽만 본다).
 *  5. 색을 줄이고 알파를 0/255 로 굳힌다 → 한 칸 = 한 색, 경계는 칼같이.
 */

export type RealDotOptions = {
  colors?: number;        // 최종 색 수 (2~64)
  period?: number;        // 사람이 도트 크기를 알면 준다 (px). 없으면 찾는다.
  scale?: number;         // 내보낼 때 한 칸을 몇 px 로 (보기용)
};

export type RealDotResult = {
  small: Buffer;          // 논리 해상도 PNG (한 칸 = 1px)
  big: Buffer;            // 확대 PNG (nearest)
  period: [number, number];
  logical: [number, number];
  colors: number;
  cuts: [number[], number[]]; // 원본(긴 변 2048 이하로 줄인 뒤) 좌표에서 칸 경계 — 나란히 비교할 때 자리를 맞추는 데 쓴다
};

type Raw = { data: Buffer; w: number; h: number };

async function raw(input: Buffer): Promise<Raw> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** 위치별 경계 세기. axis=0 → 세로선(x 마다), axis=1 → 가로선(y 마다). */
function edgeProfile(r: Raw, axis: 0 | 1): Float64Array {
  const { data, w, h } = r;
  const n = axis === 0 ? w : h;
  const prof = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = axis === 0 ? x + 1 : x, ny = axis === 0 ? y : y + 1;
      if (nx >= w || ny >= h) continue;
      const i = (y * w + x) * 4, j = (ny * w + nx) * 4;
      let d = 0;
      for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(data[i + c] - data[j + c]));
      if (d > 3) prof[axis === 0 ? x + 1 : y + 1] += d;   // 경계 세기를 그대로 더한다 — 부드럽게 늘린 그림은 차이가 여러 px 에 나뉘어 작다
    }
  }
  return prof;
}

/**
 * 소수 주기 p 와 시작점 o 를 같이 고른다 — **경계 세기의 푸리에 힘**으로.
 *
 * 경계가 k·p 자리에만 있으면 주파수 1/p 에서 모든 경계가 같은 위상으로 더해진다(강함).
 * 배수 주기(3p)에선 위상이 흩어져 약하고, 약수(p/2)는 고조파라 강하지만 흐림이 고조파부터 깎는다.
 * 그래서 **센 봉우리 중 가장 긴 주기**를 고른다. (빗 방식은 작은 도트에서 진짜의 3배를 집었다 — 11-24 자 5/6.)
 */
function power(prof: Float64Array, mean: number, p: number): { pw: number; phase: number } {
  let re = 0, im = 0;
  const w = (2 * Math.PI) / p;
  for (let x = 0; x < prof.length; x++) {
    const v = prof[x] - mean;
    if (!v) continue;
    re += v * Math.cos(w * x); im -= v * Math.sin(w * x);
  }
  return { pw: re * re + im * im, phase: Math.atan2(im, re) };
}

type Prof = { prof: Float64Array; mean: number; sq: number };
function prep(prof: Float64Array): Prof | null {
  let total = 0, sq = 0;
  for (const v of prof) total += v;
  if (total < 500) return null;
  const mean = total / prof.length;
  for (const v of prof) sq += (v - mean) ** 2;
  return { prof, mean, sq };
}

/**
 * 두 축을 **같이** 본다 — 도트는 정사각형이라 주기가 하나다. 축마다 따로 고르면 7 과 7.46 처럼 갈라졌다.
 * 범위: 4px ~ min(32, 짧은 변 / 24). 칸이 24 줄도 안 되는 "도트"는 그림 구조(시트 칸·머리 묶음)를 주기로 읽은 것이다
 * — 11-24 nabi 시트가 39.7px 를 집어 얼굴이 네모 몇 개가 됐다.
 * AI 도트는 칸 크기가 흔들려서 봉우리가 퍼진다(6.24~6.74) → 힘을 ±3% 로 부드럽게 한 뒤 고른다.
 */
function findPeriod(px: Float64Array, py: Float64Array, lo = 4, hiCap = 32): { p: number; ox: number; oy: number; score: number } {
  const X = prep(px), Y = prep(py);
  if (!X || !Y) return { p: 0, ox: 0, oy: 0, score: 0 };
  const hi = Math.min(hiCap, Math.min(px.length, py.length) / 24);
  const rows: { p: number; pw: number; phx: number; phy: number }[] = [];
  for (let p = lo; p <= hi; p += 0.02) {
    const a = power(X.prof, X.mean, p), b = power(Y.prof, Y.mean, p);
    rows.push({ p, pw: a.pw / X.sq + b.pw / Y.sq, phx: a.phase, phy: b.phase });
  }
  if (!rows.length) return { p: 0, ox: 0, oy: 0, score: 0 };
  // 봉우리 고르기: 원래 힘 + 이웃 ±3% 평균을 같이 본다 — AI 도트는 칸 크기가 흔들려 봉우리가 퍼지고(6.24~6.74),
  // 깨끗한 확대는 봉우리가 바늘처럼 좁다. 둘 중 큰 값.
  const score = rows.map((r) => {
    const near = rows.filter((q) => Math.abs(q.p - r.p) <= r.p * 0.03);
    return Math.max(r.pw, (near.reduce((s, q) => s + q.pw, 0) / near.length) * 1.5);
  });
  const max = Math.max(...score);
  if (max < 6) return { p: 0, ox: 0, oy: 0, score: max };      // 우연과 크게 다르지 않다 — 격자가 없다
  const pi = score.indexOf(max);
  let best = pi;
  for (let t = 0; t < rows.length; t++) if (Math.abs(rows[t].p - rows[pi].p) <= rows[pi].p * 0.03 && rows[t].pw > rows[best].pw) best = t;
  const r = rows[best];
  const ph = (phase: number) => { const o = (-phase / (2 * Math.PI)) * r.p; return ((o % r.p) + r.p) % r.p; };
  return { p: r.p, ox: ph(r.phx), oy: ph(r.phy), score: max };
}

/**
 * 빗살(o + k·p)을 칸 경계로. 주기는 푸리에가 소수점까지 맞추므로 빗살을 **그대로** 쓰되,
 * 바로 옆(±20%)에 훨씬 센 경계가 있을 때만 그쪽으로 옮긴다 — AI 그림의 칸 흔들림을 따라가되 칸 수는 빗살이 정한다.
 * (앞 경계에서 이어 붙이는 "따라가기"는 합성 시험에서 칸을 48 → 49 로 늘렸다 — 11-24.)
 */
function snapCuts(prof: Float64Array, p: number, o: number): number[] {
  const n = prof.length;
  const win = Math.max(1, Math.round(p * 0.2));
  const cuts: number[] = [0];
  for (let k = o; k < n; k += p) {
    const c = Math.round(k);
    if (c <= 0 || c >= n) continue;
    let at = c;
    const v0 = prof[c] ?? 0;
    let bv = v0;
    for (let d = -win; d <= win; d++) { const v = prof[c + d] ?? 0; if (v > bv) { bv = v; at = c + d; } }
    if (bv < v0 * 1.3) at = c;
    const prev = cuts[cuts.length - 1];
    if (at - prev < p * 0.6) at = c;
    if (at - prev >= 1) cuts.push(at);
  }
  cuts.push(n);
  if (cuts.length > 2 && cuts[1] - cuts[0] < p * 0.5) cuts.splice(1, 1);
  if (cuts.length > 2 && cuts[cuts.length - 1] - cuts[cuts.length - 2] < p * 0.5) cuts.splice(cuts.length - 2, 1);
  return cuts;
}

/** 칸 안쪽(가장자리 25% 뺀) 화소의 최빈색. 중간색은 가장자리에 몰려 있다. */
function cellColor(r: Raw, x0: number, x1: number, y0: number, y1: number): [number, number, number, number] {
  const ix = Math.floor((x1 - x0) * 0.25), iy = Math.floor((y1 - y0) * 0.25);
  const ax = x0 + ix, bx = Math.max(ax + 1, x1 - ix), ay = y0 + iy, by = Math.max(ay + 1, y1 - iy);
  const count = new Map<number, number>();
  let bestK = 0, bestN = 0;
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
    const i = (y * r.w + x) * 4;
    const a = r.data[i + 3] < 128 ? 0 : 255;
    // 5비트로 묶어 세서 미세한 잡티가 표를 나누지 않게 한다
    const k = a === 0 ? -1 : ((r.data[i] >> 3) << 10) | ((r.data[i + 1] >> 3) << 5) | (r.data[i + 2] >> 3);
    const v = (count.get(k) ?? 0) + 1;
    count.set(k, v);
    if (v > bestN) { bestN = v; bestK = k; }
  }
  if (bestK === -1) return [0, 0, 0, 0];
  // 묶음 안 실제 평균색
  let sr = 0, sg = 0, sb = 0, m = 0;
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
    const i = (y * r.w + x) * 4;
    if (r.data[i + 3] < 128) continue;
    const k = ((r.data[i] >> 3) << 10) | ((r.data[i + 1] >> 3) << 5) | (r.data[i + 2] >> 3);
    if (k === bestK) { sr += r.data[i]; sg += r.data[i + 1]; sb += r.data[i + 2]; m++; }
  }
  return [Math.round(sr / m), Math.round(sg / m), Math.round(sb / m), 255];
}

/** k-means 로 색 줄이기(불투명 칸만). 결정적: 시작점은 밝기 순 균등 뽑기. */
function quantize(cells: Uint8ClampedArray, k: number): number {
  const idx: number[] = [];
  for (let i = 0; i < cells.length; i += 4) if (cells[i + 3]) idx.push(i);
  if (!idx.length) return 0;
  const uniq = new Map<number, number>();
  for (const i of idx) uniq.set((cells[i] << 16) | (cells[i + 1] << 8) | cells[i + 2], i);
  if (uniq.size <= k) return uniq.size;
  const pts = idx.map((i) => [cells[i], cells[i + 1], cells[i + 2]]);
  const sorted = [...pts].sort((a, b) => a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11 - (b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11));
  let cent = Array.from({ length: k }, (_, j) => [...sorted[Math.floor((j + 0.5) * sorted.length / k)]]);
  const lab = new Int32Array(pts.length);
  for (let it = 0; it < 12; it++) {
    for (let n = 0; n < pts.length; n++) {
      let bd = Infinity, bj = 0;
      for (let j = 0; j < k; j++) {
        const d = (pts[n][0] - cent[j][0]) ** 2 * 0.3 + (pts[n][1] - cent[j][1]) ** 2 * 0.59 + (pts[n][2] - cent[j][2]) ** 2 * 0.11;
        if (d < bd) { bd = d; bj = j; }
      }
      lab[n] = bj;
    }
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let n = 0; n < pts.length; n++) { const s = sum[lab[n]]; s[0] += pts[n][0]; s[1] += pts[n][1]; s[2] += pts[n][2]; s[3]++; }
    cent = cent.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
  }
  idx.forEach((i, n) => { const c = cent[lab[n]]; cells[i] = Math.round(c[0]); cells[i + 1] = Math.round(c[1]); cells[i + 2] = Math.round(c[2]); });
  return new Set(Array.from(lab)).size;
}

export async function realDot(input: Buffer, opt: RealDotOptions = {}): Promise<RealDotResult> {
  // 너무 큰 그림은 계산이 길다 — 긴 변 2048 까지만(도트 칸 크기는 비율로 유지된다).
  const meta = await sharp(input).metadata();
  const longSide = Math.max(meta.width ?? 0, meta.height ?? 0);
  const src = longSide > 2048 ? await sharp(input).resize({ width: meta.width! >= meta.height! ? 2048 : undefined, height: meta.height! > meta.width! ? 2048 : undefined, kernel: "nearest" }).png().toBuffer() : input;
  const r = await raw(src);

  const px = edgeProfile(r, 0), py = edgeProfile(r, 1);
  const f = opt.period ? { p: opt.period, ox: 0, oy: 0, score: 0 } : findPeriod(px, py);
  if (!f.p) throw new Error("도트 격자를 못 찾았어요 — 도트 그림이 아니거나 너무 작아요.");
  const fx = { p: f.p }, fy = { p: f.p };
  const cx = snapCuts(px, f.p, f.ox), cy = snapCuts(py, f.p, f.oy);
  const W = cx.length - 1, H = cy.length - 1;
  const cells = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = cellColor(r, cx[i], cx[i + 1], cy[j], cy[j + 1]);
    cells.set(c, (j * W + i) * 4);
  }
  const used = quantize(cells, Math.min(64, Math.max(2, opt.colors ?? 32)));

  const small = await sharp(Buffer.from(cells.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const scale = opt.scale ?? Math.max(1, Math.floor(1024 / Math.max(W, H)));
  const big = await sharp(small).resize(W * scale, H * scale, { kernel: "nearest" }).png().toBuffer();
  return { small, big, period: [+fx.p.toFixed(2), +fy.p.toFixed(2)], logical: [W, H], colors: used, cuts: [cx, cy] };
}
