/**
 * 자르기 자 (11-25, 실패율 자 2바퀴에서 사람 눈이 잡음: 드워프 1번 오른팔이 잘려 2번 칸으로 — 판단자는 통과시켰다). 돈 0.
 *   npx tsx engine/tools/cut_check.mts [--sabotage]
 * 기대(먼저 적음): 같은 너비 후보(B)를 만드는 길로 드워프·악마 원본을 자르면
 *   ① 어느 칸에도 "칸 가장자리에 닿은 떨어진 조각"(본체 밖 덩어리)이 없다
 *   ② 1번 칸 그림이 원본 1번 캐릭터 너비를 다 담는다(잘린 팔 없음: 1번 칸 칠한 너비 ≥ 원본 1번 덩어리 너비 − 1)
 * --sabotage: 골짜기 대신 같은 너비 4등분 → ①·② 가 깨져야 한다.
 */
import sharp from "sharp";
const SAB = process.argv.includes("--sabotage");
const { realDot } = await import("../../src/lib/pixel/realdot");
const { findFrames, cutFrames } = await import("../../src/lib/pixel/frames");
let ok = 0, n = 0;
const expect = (name: string, pass: boolean, got: unknown) => { n++; if (pass) ok++; console.log(`${pass ? "✓" : "✗"} ${name}: ${JSON.stringify(got)}`); };
const R = "C:/Users/az518/Desktop/두근도트-스레드/realdot/bench/r2";
for (const name of ["dwarf-turn", "demon-walk"]) {
  const rd = await realDot(`${R}/${name}-raw.png` as unknown as Buffer);
  const set = await findFrames(rd.small, { cols: 4, rows: 1, valleys: !SAB });
  const cuts = await cutFrames(rd.small, set, {});
  // ① 칸마다 덩어리(4-이웃)를 세고, 본체가 아닌데 칸 왼쪽·오른쪽 가장자리에 닿은 덩어리 수
  let stray = 0; const widths: number[] = [];
  for (const c of cuts) {
    const W = set.cellW, H = set.cellH, lab = new Int32Array(W * H).fill(-1); const comps: { n: number; edge: boolean; x0: number; x1: number }[] = [];
    for (let i = 0; i < W * H; i++) {
      if (!c[i * 4 + 3] || lab[i] >= 0) continue;
      const id = comps.length, cp = { n: 0, edge: false, x0: W, x1: -1 }; comps.push(cp); const st = [i]; lab[i] = id;
      while (st.length) { const q = st.pop()!; cp.n++; const x = q % W, y = (q - x) / W; cp.x0 = Math.min(cp.x0, x); cp.x1 = Math.max(cp.x1, x); if (x === 0 || x === W - 1) cp.edge = true; for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = ny * W + nx; if (lab[k] < 0 && c[k * 4 + 3]) { lab[k] = id; st.push(k); } } }
    }
    const big = comps.reduce((a, b) => (b.n > a.n ? b : a), comps[0]);
    stray += comps.filter((cp) => cp !== big && cp.edge && cp.n >= 4).length;
    widths.push(big ? big.x1 - big.x0 + 1 : 0);
  }
  expect(`① ${name}: 가장자리에 닿은 떨어진 조각 0`, stray === 0, { stray });
  // ② 원본 1번 덩어리 너비(자동 나누기로 잰 것) 와 1번 칸 본체 너비
  const occ = await sharp(rd.small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // 원본 1번 캐릭터: 왼쪽부터 처음 만나는 칠한 칸 묶음에서 칠한 칸이 0 인 세로줄이 나올 때까지
  let x = 0; const W0 = occ.info.width, H0 = occ.info.height; const bg0 = [occ.data[0], occ.data[1], occ.data[2]]; // 배경이 칠해진 그림이라 알파가 아니라 모서리 색과 다른 칸을 센다
  const col = (xx: number) => { let k = 0; for (let y = 0; y < H0; y++) { const i = (y * W0 + xx) * 4; if (occ.data[i + 3] >= 128 && Math.abs(occ.data[i] - bg0[0]) + Math.abs(occ.data[i + 1] - bg0[1]) + Math.abs(occ.data[i + 2] - bg0[2]) >= 30) k++; } return k; };
  while (x < W0 && col(x) === 0) x++; const s0 = x; while (x < W0 && col(x) > 0) x++;
  const orig = x - s0;
  // 악마처럼 날개가 이웃 프레임과 붙어 있으면 "원본 1번 너비" 를 잴 수 없다 — 못 잼은 실패가 아니다(세지 않는다)
  if (orig > (1.6 * W0) / 4) console.log(`· ② ${name}: 못 잼(프레임이 서로 붙어 있음, 원본 덩어리 ${orig}칸)`);
  else expect(`② ${name}: 1번 칸이 1번 캐릭터 너비를 다 담음`, widths[0] >= orig - 1, { cell1: widths[0], original: orig });
}
console.log(`\n${ok}/${n}${SAB ? " (심은 고장)" : ""}`);
