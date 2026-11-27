// 11-27 A 방식 "꼭두각시 걷기"(돈 0): 그림 AI 없이 기본 그림 하나를 조각으로 나눠 코드가 움직인다.
// 사장님 "방식좀 생각해보자 → 다해보고 투표" 의 A 안. 원리상 절뚝임·끊김·얼굴 바뀜이 없다(모든 칸이 기본 그림 칸).
//  1) 다리 찾기: 맨 아래 줄부터 위로, 가운데 틈 왼쪽·오른쪽 덩어리 = 두 다리(한 발만 남은 맨 아래 줄은 가운데 기준 옆으로 나눔).
//     두 다리가 붙는 줄(가랑이·망토 단)에서 멈춘다. 지팡이처럼 빈칸으로 떨어진 덩어리는 몸에 남는다.
//  2) 6장: 딛기(몸 1칸 내려앉음) → 왼발 2칸 듦 → 왼발 1칸 → 딛기 → 오른발 2칸 → 오른발 1칸.
//     든 다리는 몸 뒤로(몸이 덮는다) → 짧아 보인다. 몸은 디딘 발 쪽으로 1칸 옮긴다(무게 옮김, 끄면 0).
export type PuppetWalk = { frames: Buffer[]; cellW: number; cellH: number; facts: string[] };

export function puppetWalk(base: { data: Buffer; w: number; h: number }, o: { sway?: number; lift?: number } = {}): PuppetWalk {
  const { data: src, w: W, h: H } = base;
  const facts: string[] = [];
  let top = -1, bot = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (src[(y * W + x) * 4 + 3]) { if (top < 0) top = y; bot = y; }
  if (top < 0) return { frames: [], cellW: W, cellH: H, facts: ["빈 그림"] };
  const bh = bot - top + 1;
  // 다리 가운데: 아래 20% 줄 칠한 칸의 가로 평균
  let sx = 0, k = 0;
  for (let y = bot - Math.round(bh * 0.2); y <= bot; y++) for (let x = 0; x < W; x++) if (src[(y * W + x) * 4 + 3]) { sx += x; k++; }
  const c = k ? sx / k : W / 2;
  const maxRun = Math.max(3, Math.round(bh / 4));
  const side = new Int8Array(W * H); // 0 몸, 1 왼다리, 2 오른다리
  let sawGap = false, legTop = bot + 1;
  for (let y = bot; y >= 0 && bot - y < bh * 0.55; y--) {
    const runs: [number, number][] = []; let s = -1;
    for (let x = 0; x <= W; x++) { const on = x < W && src[(y * W + x) * 4 + 3] > 0; if (on && s < 0) s = x; if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; } }
    if (!runs.length) break;
    // 가운데에 걸친 가는 덩어리(왕 옷의 가운데 띠처럼 바닥까지 내려온 것, 폭 3 이하)는 몸으로 두고 그 양옆을 다리로 본다
    const mid = (r: [number, number]) => r[1] - r[0] < 3 && r[0] <= c + 1.5 && r[1] >= c - 1.5;
    const side0 = runs.filter((r) => !mid(r));
    let li = -1; for (let i = 0; i < side0.length; i++) if (side0[i][1] < c) li = i;
    const L = li >= 0 ? side0[li] : null, R = side0[li + 1] && side0[li + 1][0] > c ? side0[li + 1] : null;
    if (L && R && L[1] - L[0] < maxRun && R[1] - R[0] < maxRun) {
      for (let x = L[0]; x <= L[1]; x++) side[y * W + x] = 1;
      for (let x = R[0]; x <= R[1]; x++) side[y * W + x] = 2;
      sawGap = true; legTop = y; continue;
    }
    if (!sawGap) { // 맨 아래 한 발 줄: 가운데에 가장 가까운 덩어리를 가운데 기준 옆으로
      const near = runs.reduce((a, r) => (Math.abs((r[0] + r[1]) / 2 - c) < Math.abs((a[0] + a[1]) / 2 - c) ? r : a));
      if (near[1] - near[0] < maxRun * 2 && Math.abs((near[0] + near[1]) / 2 - c) < bh / 4) {
        for (let x = near[0]; x <= near[1]; x++) side[y * W + x] = x < c ? 1 : 2;
        legTop = y; continue;
      }
    }
    break;
  }
  const legRows = bot - legTop + 1;
  const lift = o.lift ?? Math.max(legRows >= 3 ? 2 : 1, Math.min(3, Math.round(legRows / 4)));
  const sway = o.sway ?? 1;
  facts.push(sawGap ? `꼭두각시: 다리 ${legRows}줄(${legTop}~${bot}) · 가운데 ${c.toFixed(1)} · 드는 높이 ${lift}` : "꼭두각시: 다리 틈을 못 찾음 → 몸 내려앉기만");
  // [왼발 듦, 오른발 듦, 몸 아래로, 몸 옆으로]
  const plan: [number, number, number, number][] = sawGap
    ? [[0, 0, 1, 0], [lift, 0, 0, sway], [Math.ceil(lift / 2), 0, 0, sway], [0, 0, 1, 0], [0, lift, 0, -sway], [0, Math.ceil(lift / 2), 0, -sway]]
    : [[0, 0, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const put = (f: Buffer, x: number, y: number, i: number, under: boolean) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const j = (y * W + x) * 4; if (under && f[j + 3]) return;
    src.copy(f, j, i, i + 4);
  };
  const frames = plan.map(([lL, lR, dy, dx]) => {
    const f = Buffer.alloc(W * H * 4);
    // 디딘 다리 → 몸 → 든 다리(몸 뒤로)
    for (const pass of [0, 1, 2]) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (!src[i + 3]) continue;
      const s = side[y * W + x], up = s === 1 ? lL : s === 2 ? lR : 0;
      if (pass === 0 && s && !up) put(f, x, y, i, false);
      if (pass === 1 && !s) {
        put(f, x + dx, y + dy, i, false);
        // 몸이 옆으로 가면 다리 위 끝이 몸과 떨어지지 않게: 다리 맨 윗줄 바로 위 몸 칸은 제자리에도 한 번 더(빈 칸에만)
      }
      if (pass === 2 && s && up) put(f, x + (dx ? Math.sign(dx) * 0 : 0), y - up, i, true);
    }
    // 몸이 옆으로 밀리면 가랑이 줄에 생기는 1칸 틈을 몸 칸으로 메운다(빈 칸에만)
    if (dx) for (let y = legTop - 2; y < legTop + 2 && y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (src[i + 3] && !side[y * W + x]) put(f, x, y, i, true); }
    return f;
  });
  return { frames, cellW: W, cellH: H, facts };
}
