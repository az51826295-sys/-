/**
 * 판단자(기계) 후보 — "옮겨 적기 충실도": 1배 칸 색이 원본(AI 그림)의 그 칸 한가운데 색과 크게 다른 칸 = 옮기다 생긴 고장.
 * 용 4방향(검은 점 있음) vs 용 한 장(깨끗) 을 같은 자로. 돈 0.
 *   npx tsx engine/work/realdot/motion/fidelity_probe.mts
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
const luma = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
async function fidelity(rawPng: Buffer, label: string, opt: Record<string, unknown> = {}) {
  const r = await realDot(rawPng, opt);
  const [cx, cy] = r.cuts;
  const raw = await sharp(rawPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sm = await sharp(r.small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0, bad = 0, darkBad = 0;
  for (let j = 0; j < cy.length - 1; j++) for (let i = 0; i < cx.length - 1; i++) {
    const k = (j * sm.info.width + i) * 4;
    if (sm.data[k + 3] < 128) continue;
    // 원본 칸 한가운데 30%의 중앙값
    const w = cx[i + 1] - cx[i], h = cy[j + 1] - cy[j];
    const x0 = Math.round(cx[i] + w * 0.35), x1 = Math.max(x0 + 1, Math.round(cx[i + 1] - w * 0.35));
    const y0 = Math.round(cy[j] + h * 0.35), y1 = Math.max(y0 + 1, Math.round(cy[j + 1] - h * 0.35));
    const R: number[] = [], G: number[] = [], B: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const q = (y * raw.info.width + x) * 4; R.push(raw.data[q]); G.push(raw.data[q + 1]); B.push(raw.data[q + 2]); }
    const md = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
    const mr = md(R), mg = md(G), mb = md(B);
    const d = Math.abs(mr - sm.data[k]) + Math.abs(mg - sm.data[k + 1]) + Math.abs(mb - sm.data[k + 2]);
    n++;
    if (d > 120) { bad++; if (luma(sm.data[k], sm.data[k + 1], sm.data[k + 2]) + 50 < luma(mr, mg, mb)) darkBad++; }
  }
  console.log(`${label}: 칸 ${n} · 원본 한가운데와 크게 다른 칸 ${bad} (${((100 * bad) / n).toFixed(2)}%) · 그중 더 어두워진 칸 ${darkBad} (${((100 * darkBad) / n).toFixed(2)}%) · 주기 ${r.period[0]}`);
  return r;
}
await fidelity(readFileSync(`${D}/turn-raw.png`), "4방향(점 있음)");
await fidelity(readFileSync(`${D}/raw.png`), "용 한 장(깨끗)");
await fidelity(readFileSync(`${D}/turn-raw.png`), "4방향 median", { cell: "median" });
