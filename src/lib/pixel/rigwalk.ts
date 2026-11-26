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

export type RigWalk = { frames: Buffer[]; cellW: number; cellH: number; mode: "legs" | "bob"; facts: string[] };

export async function rigWalk(png: Buffer): Promise<RigWalk> {
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

  if (rows.length < 2) {
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
