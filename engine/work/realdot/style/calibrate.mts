/**
 * 게임 그림체 거리 보정표 (11-25, 돈 0). 문턱을 정하기 **전에** 같은 게임 / 다른 게임 / 색만 바꾼 것이 어떻게 갈리는지 본다.
 *   G1 두근도트 6명 · G2 거짓말의 온도 3명. 같은 게임 프로필은 자기를 뺀 나머지로(leave-one-out).
 *   npx tsx engine/work/realdot/style/calibrate.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
const { figuresOf, styleDistance, histOf, meanLuma, type: _t } = (await import("../../../../src/lib/pixel/style")) as any;
void _t;
const D = "C:/Users/az518/Desktop/두근도트-시트";
const G: Record<string, string[]> = { dot: ["taeo", "haru", "nabi", "jiwoo", "soeun", "yeonu"].map((n) => `${D}/${n}-strip.png`), lie: ["han", "park", "yun"].map((n) => `${D}/lie/${n}-sheet.png`) };
const figs = new Map<string, { px: number[][]; edge: number[][]; height: number }[]>();
for (const f of Object.values(G).flat()) { try { figs.set(f, await figuresOf(readFileSync(f))); } catch (e) { console.log("빼고 감:", f.split("/").pop(), (e as Error).message); } }
for (const g of Object.keys(G)) G[g] = G[g].filter((f) => figs.has(f));

// profileOf 와 같은 식 — 여기서는 미리 뽑은 조각으로 바로 만든다(다시 변환하지 않게)
function prof(files: string[]) {
  const fs_ = files.flatMap((f) => figs.get(f)!); const all = fs_.flatMap((f) => f.px);
  const cnt = new Map<number, number>(); for (const p of all) { const k = (p[0] << 16) | (p[1] << 8) | p[2]; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  const cols = [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ c: [(k >> 16) & 255, (k >> 8) & 255, k & 255], n }));
  const pal: { c: number[]; n: number }[] = [];
  for (const x of cols) { const near = pal.find((p) => Math.hypot(p.c[0] - x.c[0], p.c[1] - x.c[1], p.c[2] - x.c[2]) < 14); if (near) near.n += x.n; else pal.push({ ...x }); }
  const keep = pal.filter((p) => p.n >= all.length * 0.002).slice(0, 48);
  const hs = fs_.map((f) => f.height).sort((a, b) => a - b);
  return { palette: keep.map((p) => p.c), weights: [], height: hs[hs.length >> 1], heights: hs, hist: histOf(all), figures: fs_.length, edgeLuma: meanLuma(fs_.flatMap((f) => f.edge)) };
}
const hue = (px: number[][]) => px.map(([r, g, b]) => [b, r, g]); // 색 돌리기(RGB → BRG): 모양은 같고 색만 다른 그림
const rows: string[] = ["kind\tchar\tgame\tpalDist\twithin\thistOv\tedgeDiff\theight\tgameH\tfigs"];
for (const [g, files] of Object.entries(G)) for (const f of files) {
  const name = f.split("/").pop()!.replace(/-(strip|sheet)\.png/, "");
  const own = prof(files.filter((x) => x !== f)); const other = prof(Object.entries(G).find(([k]) => k !== g)![1]);
  const fig = figs.get(f)![0];
  const m = (k: string, px: number[][], edge: number[][], p: any) => { const s = styleDistance(px, p, edge); rows.push(`${k}\t${name}\t${g}\t${s.palDist.toFixed(1)}\t${s.within.toFixed(2)}\t${s.histOv.toFixed(2)}\t${s.edgeDiff.toFixed(0)}\t${fig.height}\t${p.height}\t${figs.get(f)!.length}`); };
  m("same", fig.px, fig.edge, own); m("other", fig.px, fig.edge, other); m("hue", hue(fig.px), hue(fig.edge), own);
}
mkdirSync("engine/work/realdot/style", { recursive: true });
writeFileSync("engine/work/realdot/style/calibrate.tsv", rows.join("\n"));
console.log(rows.join("\n"));
void sharp;
