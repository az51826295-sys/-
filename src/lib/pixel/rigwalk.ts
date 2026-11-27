/**
 * 기본 그림으로 걷기를 **코드가 움직인다**(11-26 사장님: "걷는 게 아니고 출렁인다" · "눈이 변하니까 얼굴이 뭉개져 보여").
 *
 * 그림 AI 걷기는 프레임마다 몸 전체를 새로 그린다 → 넘어갈 때마다 150~650칸이 옷·지팡이·눈에서 바뀌어
 * 걸음이 아니라 일렁임으로 보였고(10종 다), 다리는 거의 안 움직였다(발 폭 차 0~5칸).
 * 여기서는 **기본 그림 한 장의 칸을 옮기기만** 한다. 새로 그리는 칸이 없으니:
 *   - 머리·눈·옷은 네 프레임 모두 기본 그림과 같은 칸(바뀜 0)
 *   - 키·크기도 기본 그림과 같다(4방향·걷기 키가 어긋나던 문제가 걷기에선 없다)
 *   - 돈 0
 * 움직임: 다리 사이 틈으로 왼다리·오른다리를 찾아 번갈아 들고(키의 1/32, 최소 1칸), 한 발 디딜 때 윗몸이 1칸 내려앉는다.
 * 다리 틈이 없는 그림(슬라임·박쥐·발까지 덮는 로브)은 몸 전체를 1칸 위아래로만.
 * 아직 안 하는 것: 팔 흔들기, 옆모습 걷기.
 */
import sharp from "sharp";

export type RigWalk = { frames: Buffer[]; cellW: number; cellH: number; mode: "legs" | "bob" | "hybrid"; facts: string[] };

type Legs = { top: number; bot: number; hip: number; legTop: number; Lx: [number, number]; Rx: [number, number] } | null;
/** 기본 그림에서 다리 자리 찾기(아래에서 위로, 발 가운데 근처 빈 틈을 따라) — rigWalk·hybridWalk 공용 */
export function findLegs(src: Buffer, W: number, H: number): Legs {
  const on = (x: number, y: number) => src[(y * W + x) * 4 + 3] > 0;
  let top = -1, bot = -1, left = W, right = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { if (top < 0) top = y; bot = y; left = Math.min(left, x); right = Math.max(right, x); }
  if (top < 0) return null;
  let sx = 0, n = 0;
  for (let y = bot - 2; y <= bot; y++) for (let x = 0; x < W; x++) if (on(x, y)) { sx += x; n++; }
  let prevMid = n ? sx / n : (left + right) / 2;
  const reach = Math.max(4, Math.round((right - left + 1) * 0.3));
  const rows: { y: number; L: [number, number]; R: [number, number] }[] = [];
  for (let y = bot; y >= top + Math.floor((bot - top + 1) * 0.4); y--) {
    const runs: [number, number][] = [];
    for (let x = 0; x < W; x++) if (on(x, y)) { let e = x; while (e + 1 < W && on(e + 1, y)) e++; runs.push([x, e]); x = e; }
    let best: (typeof rows)[0] | null = null, bestD = Infinity, mid = prevMid;
    for (let i = 0; i + 1 < runs.length; i++) {
      const m = (runs[i][1] + 1 + runs[i + 1][0] - 1) / 2, d = Math.abs(m - prevMid);
      if (d <= (rows.length ? 2 : reach) && d < bestD) { bestD = d; best = { y, L: runs[i], R: runs[i + 1] }; mid = m; }
    }
    if (!best) break;
    rows.push(best); prevMid = mid;
  }
  if (rows.length < 2) return null;
  const hip = rows[rows.length - 1].y;
  return { top, bot, hip, legTop: Math.max(top, hip - Math.max(1, Math.round((bot - hip + 1) / 4))),
    Lx: [Math.min(...rows.map((r) => r.L[0])), Math.max(...rows.map((r) => r.L[1]))], Rx: [Math.min(...rows.map((r) => r.R[0])), Math.max(...rows.map((r) => r.R[1]))] };
}

/**
 * 섞어 걷기(11-26 라이벌 측정 뒤): 픽셀랩 걷기는 다리가 진짜 걷는다(발 폭 차 10칸) — 대신 얼굴이 34~72% 바뀌고 검·방패를 지웠다.
 * 우리 코드 걷기는 반대(얼굴 0%, 소품 유지, 다리는 제자리). → **다리 띠만 그림 AI 프레임에서, 나머지는 전부 기본 그림에서.**
 *   - 다리 띠: 기본 그림 다리 x 범위 ±여유, 엉덩이 줄 아래. AI 프레임은 발끝을 기본 그림 바닥에, 엉덩이 가운데를 기본 그림 가운데에 맞춰 붙인다.
 *   - 다리 띠 밖(땅에 닿은 지팡이 끝·방패 아래)은 기본 그림 그대로.
 *   - 윗몸은 기본 그림 그대로 — 발이 가장 벌어진 프레임에서 1칸 내려앉는다.
 * AI 프레임 키가 기본 그림과 15% 넘게 다르면 다리 길이가 안 맞으니 쓰지 않는다(null).
 */
/**
 * 11-27 사장님 "걷기가 일정하지 않아 한쪽이 너무 치우쳐져 있어": 덮인 다리는 AI 4장을 그대로 써서 왼걸음·오른걸음 크기가 달랐다.
 * 아랫몸(몸 아래 45%)이 좌우 대칭이면(망토·가운데 칼) 뒤집어도 소품이 반대로 안 넘어간다 → 반 바퀴 + 뒤집기 6장으로 걸음을 고르게.
 * 대칭 = 아랫몸 무게중심 기준 좌우를 뒤집어 같은 색끼리 겹치는 비율(IoU). 지팡이 든 마법사처럼 한쪽에 소품이 있으면 낮다.
 */
export function lowerSymmetry(src: Buffer, W: number, H: number): number {
  let top = -1, bot = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (src[(y * W + x) * 4 + 3]) { if (top < 0) top = y; bot = y; }
  if (top < 0) return 0;
  const y0 = bot - Math.round((bot - top + 1) * 0.45);
  let sx = 0, k = 0;
  for (let y = y0; y <= bot; y++) for (let x = 0; x < W; x++) if (src[(y * W + x) * 4 + 3]) { sx += x; k++; }
  const c = sx / Math.max(1, k);
  let both = 0, any = 0;
  for (let y = y0; y <= bot; y++) for (let x = 0; x < W; x++) {
    const m = Math.round(2 * c - x); const i = (y * W + x) * 4, j = (y * W + m) * 4;
    const a = src[i + 3] > 0, b = m >= 0 && m < W && src[j + 3] > 0;
    if (a || b) any++;
    // 색까지 같아야 겹친 것(윤곽만 보면 마법사 지팡이 같은 가는 소품을 못 본다 — 0.91)
    if (a && b && Math.abs(src[i] - src[j]) + Math.abs(src[i + 1] - src[j + 1]) + Math.abs(src[i + 2] - src[j + 2]) <= 60) both++;
  }
  return any ? both / any : 0;
}

export function hybridWalk(base: { data: Buffer; w: number; h: number }, ai: Buffer[], aiW: number, aiH: number, opt: { mirrorHalf?: boolean } = {}): RigWalk | null {
  const { data: src, w: W, h: H } = base;
  // 11-27 셋째: 사장님 기사왕 셋째 판은 망토가 다리를 다 덮어 다리 틈이 0줄 → null → 코드 걷기(몸 위아래만)로 빠졌다.
  // 다리 틈이 없어도 칠한 몸이 있으면 "덮인 다리"로 본다(엉덩이 = 맨 아래 줄 → 다리 틈 1줄 < 15%). 슬라임처럼 다리 없는 것도 AI 가 그린 아랫몸을 쓴다.
  let legs = findLegs(src, W, H);
  if (!legs) {
    let t = -1, b = -1, l = W, r = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (src[(y * W + x) * 4 + 3]) { if (t < 0) t = y; b = y; l = Math.min(l, x); r = Math.max(r, x); }
    if (t < 0) return null;
    const c = Math.round((l + r) / 2);
    legs = { top: t, bot: b, hip: b, legTop: b, Lx: [c, c], Rx: [c, c] };
  }
  const facts: string[] = [];
  const bh = legs.bot - legs.top + 1;
  // 11-27 사장님 "발만 움직이고 다른 데는 멈춰 있다"(망토 두른 기사왕): 망토·긴 옷이 다리를 덮으면 다리 틈이 맨 아래(발)에만 보여
  // 발 몇 줄만 바뀌었다. 다리 틈이 키의 15% 안 되면(팩: 사제 9%·마법사 11% 걸림, 기사 20%·궁수 21%·상인 19% 안 걸림) **덮인 다리** → 허리(키의 55%) 아래를 통째로(가로 전부) AI 프레임에서 가져온다 —
  // 망토·치마가 걸음 따라 흔들린다. 머리·가슴은 그대로 기본 그림(얼굴 0% 유지). 허리 밑에 찬 소품은 AI 그림을 따른다.
  const pad = Math.max(2, Math.round(bh / 12));
  // 11-27 둘째: 사장님 기사왕은 다리 틈이 길게 잡혀(6장 = 덮인 다리 안 걸림) 망토가 그대로 멈춰 있었다 → 다리 틈 길이만으로는 못 가린다.
  // **망토 자**: 몸 아래 30% 줄에서 다리 띠 밖에 칠한 칸 / 띠 안 칸. 팩 8종 0.00~0.05, 망토 기사왕 0.31 → 0.15 이상이면 망토가 다리 옆으로 바닥까지 늘어진 것.
  const lb0 = Math.max(0, legs.Lx[0] - pad), lb1 = Math.min(W - 1, legs.Rx[1] + pad);
  let capeOut = 0, capeIn = 0;
  for (let y = legs.bot - Math.round(bh * 0.3); y <= legs.bot; y++) for (let x = 0; x < W; x++) if (src[(y * W + x) * 4 + 3]) { if (x < lb0 || x > lb1) capeOut++; else capeIn++; }
  const capeRatio = capeOut / Math.max(1, capeIn);
  const shortGap = legs.bot - legs.hip + 1 < bh * 0.15;
  // 11-27 여섯째: 사장님 "머리만 따로 뽑고 몸에 붙이자" → 기본은 **머리만 기본 그림, 몸 전체는 AI 걸음**(이음 줄을 목 근처에서 찾는다).
  // 옛 다리 띠 방식은 PIXEL_WALK_LEGS=1 일 때만(비교용).
  const headOnly = !process.env.PIXEL_WALK_LEGS;
  const covered = headOnly || shortGap || capeRatio >= 0.15;
  let hip = covered ? legs.top + Math.round(bh * 0.55) : legs.hip;
  let legLen = legs.bot - hip + 1;
  const band: [number, number] = covered ? [0, W - 1] : [lb0, lb1];
  let cx = (legs.Lx[0] + legs.Rx[1]) / 2;
  if (covered) { let s = 0, k = 0; for (let y = hip; y < Math.min(hip + 3, H); y++) for (let x = 0; x < W; x++) if (src[(y * W + x) * 4 + 3]) { s += x; k++; } if (k) cx = s / k; facts.push(headOnly ? "머리만 기본 그림 · 몸은 AI 걸음" : `덮인 다리(${shortGap ? `다리 틈 ${legs.bot - legs.hip + 1}칸 < 키 ${bh}의 15%` : ""}${shortGap && capeRatio >= 0.15 ? " · " : ""}${capeRatio >= 0.15 ? `망토 자 ${capeRatio.toFixed(2)} ≥ 0.15` : ""}) → 허리 ${hip}줄 아래 통째로`); }
  const frames: Buffer[] = [], spreads: number[] = [];
  const legImgs: { o: Buffer }[] = [];
  // 11-26 첫 판: AI 가 45칸으로 그렸다(기본 54) → 다리 띠만 쓰니 **모든 프레임을 같은 배율로** nearest 로 맞춘다(30% 넘게 다르면 포기)
  const hOf = (c: Buffer, w: number, hh: number) => { let t = -1, b = -1; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (c[(y * w + x) * 4 + 3]) { if (t < 0) t = y; b = y; } return t < 0 ? 0 : b - t + 1; };
  const hs = ai.map((c) => hOf(c, aiW, aiH)).sort((a, b) => a - b), medH = hs[hs.length >> 1];
  if (!medH || Math.abs(medH - bh) / bh > 0.3) { facts.push(`AI 프레임 키 ${medH}칸 · 기본 ${bh}칸 — 30% 넘게 달라 못 씀`); return { frames: [], cellW: W, cellH: H, mode: "hybrid", facts }; }
  if (medH !== bh) {
    const r = bh / medH, nw = Math.round(aiW * r), nh = Math.round(aiH * r);
    ai = ai.map((c0) => { const o = Buffer.alloc(nw * nh * 4); for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const sy = Math.min(aiH - 1, Math.floor(y / r)), sx = Math.min(aiW - 1, Math.floor(x / r)); c0.copy(o, (y * nw + x) * 4, (sy * aiW + sx) * 4, (sy * aiW + sx) * 4 + 4); } return o; });
    facts.push(`AI 키 ${medH}칸 → 기본 ${bh}칸에 맞춰 ${r.toFixed(2)}배`);
    aiW = nw; aiH = nh;
  }
  const bots = ai.map((c) => { let b = -1; for (let y = aiH - 1; y >= 0 && b < 0; y--) for (let x = 0; x < aiW; x++) if (c[(y * aiW + x) * 4 + 3]) { b = y; break; } return b; });
  if (bots.some((b) => b < 0)) return null;
  // 11-27 넷째: 사장님 "반이 똑 떨어져 있다" — 허리를 키의 55% 로 못 박으니 위(기본 그림)와 아래(AI)가 이음 줄에서 모양·너비가 안 맞았다.
  // 덮인 다리면 **이음 줄을 찾는다**: 키의 25~65% 줄마다, 프레임마다 가로 −4~+4칸 밀어 보며 기본 그림 두 줄과 AI 두 줄이 가장 덜 어긋나는 자리.
  // 모든 프레임 어긋남 합이 가장 작은 줄 하나를 쓰고(장마다 이음 줄이 다르면 허리가 출렁인다), 가로는 장마다 가장 잘 맞은 만큼 민다.
  let seamDx: number[] | null = null;
  if (covered && !process.env.PIXEL_SEAM_FIXED) { // PIXEL_SEAM_FIXED=1: 옛 55% 줄(시험 비교용)
    const px = (d: Buffer, w: number, hh: number, x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= hh ? -1 : d[(y * w + x) * 4 + 3] ? (d[(y * w + x) * 4] >> 4 << 8) | (d[(y * w + x) * 4 + 1] >> 4 << 4) | (d[(y * w + x) * 4 + 2] >> 4) : -1);
    const miss = (c: Buffer, y: number, dy: number, dx: number) => { let m = 0, t = 0; for (const yy of [y - 1, y]) for (let x = 0; x < W; x++) { const a = px(src, W, H, x, yy), b = px(c, aiW, aiH, x - dx, yy - dy); if (a < 0 && b < 0) continue; t++; if ((a < 0) !== (b < 0)) m += 1; else if (a !== b) m += 0.35; } return t ? m / t : 1; };
    let best = { y: hip, cost: Infinity, dxs: [] as number[] };
    // 머리만: 목 근처(키 15~50%)에서, 폭이 좁은 줄일수록 싸게(목은 좁다 — 어깨·모자 챙에서 자르지 않게)
    const rowW = (y: number) => { let l = W, r = -1; for (let x = 0; x < W; x++) if (src[(y * W + x) * 4 + 3]) { l = Math.min(l, x); r = Math.max(r, x); } return r < 0 ? 0 : r - l + 1; };
    const y0s = legs.top + Math.round(bh * (headOnly ? 0.15 : 0.25)), y1s = legs.top + Math.round(bh * (headOnly ? 0.5 : 0.65));
    let maxW = 1; for (let y = y0s; y <= y1s; y++) maxW = Math.max(maxW, rowW(y));
    for (let y = y0s; y <= y1s; y++) {
      let cost = 0; const dxs: number[] = [];
      for (const [f, c] of ai.entries()) {
        const dy = legs.bot - bots[f];
        // 가로 기준: 그 줄 근처 칠한 가운데를 맞춘 뒤 ±4칸
        let s1 = 0, k1 = 0, s2 = 0, k2 = 0;
        for (let x = 0; x < W; x++) if (src[(y * W + x) * 4 + 3]) { s1 += x; k1++; }
        for (let x = 0; x < aiW; x++) { const yy = y - dy; if (yy >= 0 && yy < aiH && c[(yy * aiW + x) * 4 + 3]) { s2 += x; k2++; } }
        const d0 = k1 && k2 ? Math.round(s1 / k1 - s2 / k2) : 0;
        let bm = Infinity, bd = d0;
        for (let d = d0 - 4; d <= d0 + 4; d++) { const m = miss(c, y, dy, d); if (m < bm) { bm = m; bd = d; } }
        cost += bm; dxs.push(bd);
      }
      if (headOnly) cost *= 0.5 + (0.5 * rowW(y)) / maxW;
      if (cost < best.cost) best = { y, cost, dxs };
    }
    facts.push(`이음 줄 ${hip} → ${best.y}(어긋남 ${(best.cost / ai.length * 100).toFixed(0)}% · 가로 ${best.dxs.join("/")})`);
    hip = best.y; legLen = legs.bot - hip + 1; seamDx = best.dxs;
  }
  for (const [f, c] of ai.entries()) {
    let top = -1; const bot = bots[f];
    for (let y = 0; y < aiH && top < 0; y++) for (let x = 0; x < aiW; x++) if (c[(y * aiW + x) * 4 + 3]) { top = y; break; }
    const h = bot - top + 1;
    // AI 프레임의 엉덩이 줄: 같은 비율 자리(덮인 다리면 바닥을 맞춘 뒤 같은 줄)
    const aHip = seamDx ? hip - (legs.bot - bot) : bot - Math.round(legLen * (h / bh)) + 1;
    // AI 엉덩이 줄 근처(아래로 3줄)의 칠한 가운데 → 기본 그림 다리 가운데에 맞춘다
    let sx = 0, n = 0;
    for (let y = aHip; y < Math.min(aHip + 3, aiH); y++) for (let x = 0; x < aiW; x++) if (c[(y * aiW + x) * 4 + 3]) { sx += x; n++; }
    const dx = seamDx ? seamDx[f] : Math.round(cx - (n ? sx / n : aiW / 2)), dy = legs.bot - bot;
    const o = Buffer.alloc(W * H * 4);
    let fl = 1e9, fr = -1;
    for (let y = aHip; y <= bot; y++) for (let x = 0; x < aiW; x++) {
      const i = (y * aiW + x) * 4; if (!c[i + 3]) continue;
      const X = x + dx, Y = y + dy; if (X < band[0] || X > band[1] || Y < 0 || Y >= H) continue;
      c.copy(o, (Y * W + X) * 4, i, i + 4);
      if (Y >= legs.bot - 2) { fl = Math.min(fl, X); fr = Math.max(fr, X); }
    }
    legImgs.push({ o }); spreads.push(fr - fl + 1);
  }
  // 11-26 "좌우 걸음이 안 고르다": 반 바퀴(왼발)만 AI 가 그리고 나머지 반 바퀴는 다리 띠를 다리 가운데 기준으로 좌우 뒤집어 만든다 → 왼발·오른발이 칸 단위로 같다
  if (opt.mirrorHalf && covered) {
    // 11-27 일곱째: 사장님 "절뚝거려" — AI 는 4장 중 한 발 장 둘을 같은 발로 그리곤 한다(마법사·기사 6판 중 4판). 다시 그려도 잘 안 고쳐진다
    // → 반 바퀴만 AI 에서 쓰고 나머지 반 바퀴는 **다리 자리만** 뒤집는다(무릎 아래 · 다리 x 범위). 몸·지팡이·망토 위쪽은 안 뒤집으니 소품이 반대로 안 넘어간다.
    const n = legImgs.length;
    const legCx = (legs.Lx[0] + legs.Rx[1]) / 2;
    const half = Math.max(Math.round((lb1 - lb0) / 2), Math.round(bh / 6));
    const m0 = Math.max(0, Math.round(legCx - half)), m1 = Math.min(W - 1, Math.round(legCx + half));
    const knee = legs.bot - Math.round(bh * 0.25);
    for (let k = 0; k < n; k++) {
      const src2 = legImgs[k].o, o = Buffer.from(src2);
      for (let y = knee; y < H; y++) for (let x = m0; x <= m1; x++) o.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
      for (let y = knee; y < H; y++) for (let x = m0; x <= m1; x++) { const i = (y * W + x) * 4; if (!src2[i + 3]) continue; const X = Math.round(2 * legCx - x); if (X < m0 || X > m1) continue; src2.copy(o, (y * W + X) * 4, i, i + 4); }
      legImgs.push({ o }); spreads.push(spreads[k]);
    }
    facts.push(`반 바퀴 ${n}장 + 다리만 좌우 뒤집기 ${n}장(무릎 ${knee}줄 아래 · x${m0}~${m1})`);
  } else if (opt.mirrorHalf) {
    const n = legImgs.length;
    for (let k = 0; k < n; k++) {
      const src2 = legImgs[k].o, o = Buffer.alloc(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (!src2[i + 3]) continue; const X = Math.round(2 * cx - x); if (X < band[0] || X > band[1]) continue; src2.copy(o, (y * W + X) * 4, i, i + 4); }
      legImgs.push({ o }); spreads.push(spreads[k]);
    }
    facts.push(`반 바퀴 ${n}장 + 좌우 뒤집기 ${n}장`);
  }
  const maxS = Math.max(...spreads);
  for (const [f, { o }] of legImgs.entries()) {
    const dip = spreads[f] >= maxS - 1 && maxS - Math.min(...spreads) >= 2 ? 1 : 0;
    const out = Buffer.alloc(W * H * 4);
    // ① 다리 띠 밖의 아래쪽(소품)은 기본 그림
    for (let y = hip; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (src[i + 3] && (x < band[0] || x > band[1])) src.copy(out, i, i, i + 4); }
    // ② AI 다리
    for (let i = 0; i < o.length; i += 4) if (o[i + 3]) o.copy(out, i, i, i + 4);
    // ③ 윗몸(엉덩이 줄 위) 기본 그림 — 다리와 이음매를 덮도록 1줄 겹친다
    for (let y = 0; y <= hip; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const Y = y + dip; if (Y >= H) continue; if (src[i + 3]) src.copy(out, (Y * W + x) * 4, i, i + 4); }
    frames.push(out);
  }
  facts.push(`다리 띠 x${band[0]}~${band[1]} · 엉덩이 ${hip} · 발 폭 ${spreads.join("/")} · 내려앉기 ${spreads.map((s) => (s >= maxS - 1 && maxS - Math.min(...spreads) >= 2 ? 1 : 0)).join("/")}`);
  return { frames, cellW: W, cellH: H, mode: "hybrid", facts };
}

export async function rigWalk(png: Buffer, o: { bob?: boolean } = {}): Promise<RigWalk> {
  const { data: src0, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let W = info.width, H = info.height;
  const on = (d: Buffer, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3] > 0;
  // 위쪽 여유 1칸 확보(위아래로 움직일 자리)
  let top = -1, bot = -1, left = W, right = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(src0, W, x, y)) { if (top < 0) top = y; bot = y; left = Math.min(left, x); right = Math.max(right, x); }
  if (top < 0) throw new Error("빈 그림");
  let src = src0;
  if (top < 1) { const pad = 1 - top; const o = Buffer.alloc(W * (H + pad) * 4); src0.copy(o, pad * W * 4); src = o; H += pad; top += pad; bot += pad; }
  const facts: string[] = [];
  const h = bot - top + 1;

  // 발 가운데: 맨 아래 3줄의 칠한 칸 평균 x
  let sx = 0, n = 0;
  for (let y = bot - 2; y <= bot; y++) for (let x = 0; x < W; x++) if (on(src, W, x, y)) { sx += x; n++; }
  const cx = n ? sx / n : (left + right) / 2;

  // 아래에서 위로: 발 가운데 근처의 빈 틈(양옆이 칠해진)을 따라 올라간다 → 다리 줄
  type Row = { y: number; gap: [number, number]; L: [number, number]; R: [number, number] };
  const rows: Row[] = [];
  const reach = Math.max(4, Math.round((right - left + 1) * 0.3));
  let prevMid = cx;
  for (let y = bot; y >= top + Math.floor(h * 0.4); y--) {
    // 이 줄의 칠한 덩어리들
    const runs: [number, number][] = [];
    for (let x = 0; x < W; x++) if (on(src, W, x, y)) { let e = x; while (e + 1 < W && on(src, W, e + 1, y)) e++; runs.push([x, e]); x = e; }
    let best: Row | null = null, bestD = Infinity;
    for (let i = 0; i + 1 < runs.length; i++) {
      const g: [number, number] = [runs[i][1] + 1, runs[i + 1][0] - 1];
      const mid = (g[0] + g[1]) / 2, d = Math.abs(mid - prevMid);
      if (d <= (rows.length ? 2 : reach) && d < bestD) { bestD = d; best = { y, gap: g, L: runs[i], R: runs[i + 1] }; }
    }
    if (!best) break;
    rows.push(best); prevMid = (best.gap[0] + best.gap[1]) / 2;
  }

  const cellW = W, cellH = H;
  const frames: Buffer[] = [];
  const blank = () => Buffer.alloc(W * H * 4);
  const put = (o: Buffer, x: number, y: number, i: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; src.copy(o, (y * W + x) * 4, i, i + 4); };

  if (o.bob) {
    // 11-26 사장님 "박쥐가 애매해": 날개가 그대로라 둥둥 뜨기만 했다 → **날갯짓**.
    // 몸 띠 = 위쪽 20%(머리·귀)의 가로 범위. 그 밖으로 뻗은 칸이 날개다(가운데 가로 폭이 몸 띠의 1.6배 넘을 때만).
    // 날개는 기둥(세로줄)째 옮긴다: 몸에서 멀수록 많이 — 끝이 위로 k칸(올림) / 아래로 k칸(내림). 날개를 내릴 때 몸은 1칸 뜬다.
    let bL = W, bR = -1;
    for (let y = top; y < top + Math.ceil(h * 0.2); y++) for (let x = 0; x < W; x++) if (on(src, W, x, y)) { bL = Math.min(bL, x); bR = Math.max(bR, x); } // 위 20%: 박쥐는 30% 아래부터 날개가 귀 높이까지 올라온다
    const span = right - left + 1, band = bR - bL + 1;
    if (bR >= 0 && span > band * 1.6) {
      const maxD = Math.max(left < bL ? bL - left : 0, right > bR ? right - bR : 0) || 1;
      const k = Math.max(2, Math.round(h / 12));
      // 기둥 옮기기로 위·아래가 잘리지 않게 위아래 여유를 둔다
      // 실제로 옮겨질 칸의 위·아래 끝을 먼저 잰다 — 캔버스 안에 들면 4방향과 같은 캔버스 그대로(발은 날개만큼 안 움직이니 bot+k 로 재면 안 된다)
      let minY = H, maxY = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!on(src, W, x, y)) continue;
        const d = x < bL ? bL - x : x > bR ? x - bR : 0, r = d ? Math.round((k * d) / maxD) : 1;
        minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + (d ? r : 0));
      }
      const pad = minY < 0 || maxY >= H ? k + 1 : 0, H2 = H + 2 * pad;
      const mk = (wing: number, body: number) => {
        const out = Buffer.alloc(W * H2 * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4; if (!src[i + 3]) continue;
          const d = x < bL ? bL - x : x > bR ? x - bR : 0;
          const dy = d ? Math.round((wing * d) / maxD) : body;
          const Y = y + pad + dy; if (Y < 0 || Y >= H2) continue;
          src.copy(out, (Y * W + x) * 4, i, i + 4);
        }
        return out;
      };
      // 1 중간 · 2 올림 · 3 중간 · 4 내림(몸 1칸 뜸) — 6장: 올림·내림 사이에 반쯤
      for (const [wing, body] of [[0, 0], [-Math.ceil(k / 2), 0], [-k, 0], [-Math.ceil(k / 2), 0], [0, -1], [k, -1]] as const) frames.push(mk(wing, body));
      facts.push(`날갯짓: 몸 띠 x${bL}~${bR} · 날개 끝 위아래 ${k}칸 · 6장`);
      return { frames, cellW, cellH: H2, mode: "bob", facts };
    }
  }
  if (rows.length < 2 || o.bob) { // bob: 다리가 없거나(슬라임) 날개를 못 찾은 나는 캐릭터
    // 다리 틈 없음 → 몸 전체 위아래 1칸
    for (const dy of [0, -1, 0, -1]) {
      const o = blank();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (src[i + 3]) put(o, x, y + dy, i); }
      frames.push(o);
    }
    facts.push(`다리 틈 ${rows.length}줄 — 몸 위아래 1칸만`);
    return { frames, cellW, cellH, mode: "bob", facts };
  }

  // 다리 칸: 다리 줄의 왼/오른 덩어리 x 범위를 합친 것(지팡이 끝 같은 건 범위 밖이라 그대로 둔다)
  const hip = rows[rows.length - 1].y;
  const Lx: [number, number] = [Math.min(...rows.map((r) => r.L[0])), Math.max(...rows.map((r) => r.L[1]))];
  const Rx: [number, number] = [Math.min(...rows.map((r) => r.R[0])), Math.max(...rows.map((r) => r.R[1]))];
  // 다리 위쪽(가랑이 위 몇 줄)도 같이 움직여야 다리가 늘어나 보이지 않는다 → 다리 길이의 1/4 만큼 위로 넓힌다
  const legTop = Math.max(top, hip - Math.max(1, Math.round((bot - hip + 1) / 4)));
  const lift = Math.max(1, Math.round(h / 32));
  facts.push(`다리 줄 ${hip}~${bot}(틈 ${rows.length}줄) · 왼다리 x${Lx[0]}~${Lx[1]} · 오른다리 x${Rx[0]}~${Rx[1]} · 들기 ${lift}칸 · 윗몸 내려앉기 1칸`);
  const inL = (x: number, y: number) => y >= legTop && x >= Lx[0] && x <= Lx[1];
  const inR = (x: number, y: number) => y >= legTop && x >= Rx[0] && x <= Rx[1];

  // 프레임: 1 왼발 듦 · 2 기본 · 3 오른발 듦 · 4 기본
  for (const step of ["L", null, "R", null] as const) {
    const o = blank();
    if (!step) { src.copy(o); frames.push(o); continue; }
    const lifted = step === "L" ? inL : inR;
    // ① 움직이지 않는 아래쪽(디딘 다리·땅에 닿은 소품)
    for (let y = legTop; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (src[i + 3] && !lifted(x, y)) put(o, x, y, i); }
    // ② 든 다리: lift 칸 위로
    for (let y = legTop; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (src[i + 3] && lifted(x, y)) put(o, x, y - lift, i); }
    // ③ 윗몸: 1칸 내려앉아 다리 위를 덮는다(아래로 옮기면 세로 물건에 틈이 안 생긴다)
    for (let y = 0; y < legTop; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (src[i + 3]) put(o, x, y + 1, i); }
    frames.push(o);
  }
  return { frames, cellW, cellH, mode: "legs", facts };
}
