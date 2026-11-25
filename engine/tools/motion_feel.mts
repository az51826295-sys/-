/**
 * **움직임 어색함 자** (11-25, 사장님 "동작일 때 어색함이 없어야 돼"). 돈 0 — 이미 받은 시트(1배, 4칸 가로)를 잰다.
 *   npx tsx engine/tools/motion_feel.mts <폴더> [패턴=-walk-1x.png]
 * 잰다(먼저 적음 — 문턱은 1~3바퀴 실측 분포를 보고 정한다, 지금은 숫자만):
 *   머리 깜빡임  위 35%(머리)가 이웃 프레임끼리 바뀐 칸 비율. 위아래 1칸 흔들림은 빼고(−1·0·+1 중 최소) 잰다 — 걸으며 머리가 바뀌면 번쩍인다
 *   이음매      4→1 로 넘어갈 때 바뀐 칸 비율 ÷ 1→2·2→3·3→4 평균. 1 보다 크게 튀면 돌아올 때 툭 끊긴다
 *   사라짐      1번 프레임에 2% 넘게 있던 색 묶음이 다른 프레임에서 0.3% 아래로 — 소품(도끼·모자)이 나타났다 사라짐
 *   다리 움직임  아래 30% 가 1번과 다른 칸 비율의 최댓값 — 너무 작으면 제자리에서 안 걷는다
 *   키 흔들림   프레임 키(칸)의 최대−최소
 */
import { readdirSync } from "node:fs";
import sharp from "sharp";
const [D, pat = "-walk-1x.png"] = process.argv.slice(2);
type F = { d: Buffer; W: number; H: number };
const q = (d: Buffer, i: number) => ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
function diff(a: F, b: F, y0: number, y1: number): number {
  let best = 1;
  for (const sh of [-1, 0, 1]) {
    let n = 0, d = 0;
    for (let y = y0; y < y1; y++) { const yb = y + sh; if (yb < 0 || yb >= b.H) continue; for (let x = 0; x < a.W; x++) { const i = (y * a.W + x) * 4, j = (yb * b.W + x) * 4; const ua = a.d[i + 3] > 0, ub = b.d[j + 3] > 0; if (!ua && !ub) continue; n++; if (ua !== ub || Math.abs(a.d[i] - b.d[j]) + Math.abs(a.d[i + 1] - b.d[j + 1]) + Math.abs(a.d[i + 2] - b.d[j + 2]) > 60) d++; } }
    if (n) best = Math.min(best, d / n);
  }
  return best;
}
const rows: string[] = [];
for (const f of readdirSync(D).filter((x) => x.endsWith(pat)).sort()) {
  const p = `${D}/${f}`; const m = await sharp(p).metadata(); const cw = Math.floor(m.width! / 4), H = m.height!;
  const fr: F[] = await Promise.all([0, 1, 2, 3].map(async (i) => ({ d: await sharp(p).extract({ left: i * cw, top: 0, width: cw, height: H }).ensureAlpha().raw().toBuffer(), W: cw, H })));
  // 키 (각 프레임 칠한 줄 위·아래)
  const hs = fr.map((x) => { let t = -1, b = -1; for (let y = 0; y < H; y++) for (let xx = 0; xx < cw; xx++) if (x.d[(y * cw + xx) * 4 + 3]) { if (t < 0) t = y; b = y; } return b - t + 1; });
  const top = Math.max(1, Math.floor(H * 0.35)), legs = Math.floor(H * 0.7);
  const pairs = [[0, 1], [1, 2], [2, 3]] as const;
  const headFlicker = Math.max(...[...pairs, [3, 0] as const].map(([a, b]) => diff(fr[a], fr[b], 0, top)));
  const step = pairs.map(([a, b]) => diff(fr[a], fr[b], 0, H));
  const seam = diff(fr[3], fr[0], 0, H) / Math.max(0.001, step.reduce((s, v) => s + v, 0) / 3);
  const legMove = Math.max(...[1, 2, 3].map((k) => diff(fr[0], fr[k], legs, H)));
  // 사라짐: 색 묶음 비율
  const hist = fr.map((x) => { const h = new Map<number, number>(); let n = 0; for (let i = 0; i < x.d.length; i += 4) if (x.d[i + 3]) { n++; const k = q(x.d, i); h.set(k, (h.get(k) ?? 0) + 1); } for (const [k, v] of h) h.set(k, v / Math.max(1, n)); return h; });
  const lost: string[] = [];
  for (const [k, v] of hist[0]) if (v > 0.02) for (let i = 1; i < 4; i++) if ((hist[i].get(k) ?? 0) < 0.003) lost.push(`${i + 1}번에서 색${k}(${(v * 100).toFixed(0)}%)`);
  rows.push(`${f.replace(pat, "").padEnd(10)} 머리 깜빡임 ${(headFlicker * 100).toFixed(0).padStart(3)}% · 이음매 ${seam.toFixed(2)} · 다리 ${(legMove * 100).toFixed(0).padStart(3)}% · 키 흔들림 ${Math.max(...hs) - Math.min(...hs)} · 사라짐 ${lost.length ? lost.slice(0, 3).join(",") : "없음"}`);
}
console.log(rows.join("\n"));
