/**
 * 진짜 도트 일관성 — **둘째 판: 변환기 자신의 일관성** (11-24, 첫 판 뒤에 등록 · 숫자 보기 전에 잠금).
 *
 *   npx tsx engine/tools/realdot_consistency2.mts [--sabotage]
 *
 * 첫 판(realdot_consistency.mts)은 "변환 뒤 몸통 칸이 같은가"를 쟀다 → 60짝 중 4짝만 통과.
 * 그런데 그건 두 원인이 섞인 숫자다: ① AI 가 표정마다 몸통을 조금씩 다르게 그렸다 ② 변환기가 같은 그림을 다르게 바꿨다.
 * 이 판은 ②만 잰다.
 *
 * ## 판정식 (잠금)
 * 짝마다 첫 판과 같은 방식으로 몸통 줄(아래 1/4)을 ±2칸 안에서 가장 잘 맞춘 뒤, 배경이 아닌 칸마다
 *   - 원본에서 두 칸의 **안쪽 50%** 평균색 차(RGB 차 합)가 ≤ 12 면 "AI 가 같게 그린 칸"
 *   - 그런 칸 중 변환 결과 색이 같은 비율 = **C (변환기 일관성)**
 *   - 배경 아닌 칸 중 "같게 그린 칸" 비율 = **S (AI 그림의 일관성)** — 판정에 안 쓴다
 * C ≥ 0.95 통과 · C < 0.85 실패 · 사이 애매. 같게 그린 칸이 20개 미만이면 "못 잼"(실패로 세지 않는다).
 * 격자를 못 찾은 그림은 "변환 실패"로 따로 센다.
 * --sabotage: 변환 결과를 받은 뒤 셋째 프레임 몸통 칸의 1/3 을 다른 팔레트 색으로 바꾼다 → C 가 떨어져야 한다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { realDot } from "../../src/lib/pixel/realdot";

const SAB = process.argv.includes("--sabotage");
const DIR = "C:/Users/az518/Desktop/두근도트-시트";
const LOCK = { same: 12, pass: 0.95, fail: 0.85, minCells: 20, shift: 2, torso: 0.75 } as const;
const NAMES = ["haru", "jiwoo", "nabi", "soeun", "taeo", "yeonu"];
const inputs = [...NAMES.map((n) => ({ name: n, kind: "strip" as const })), ...[...NAMES, "yuna"].map((n) => ({ name: n, kind: "sheet" as const }))].filter((i) => !process.env.CONS_ONLY || i.kind === process.env.CONS_ONLY);
// 변환기 변형(자는 그대로): CONS_COLORS=16 · CONS_CELL=median
const VAR = { colors: Number(process.env.CONS_COLORS) || 32, cell: (process.env.CONS_CELL as "mode" | "median" | undefined) ?? "mode", merge: process.env.CONS_MERGE === undefined ? 0 : Number(process.env.CONS_MERGE) };
const TAG = `${VAR.cell}-${VAR.colors}-m${VAR.merge}${process.env.CONS_ONLY ? "-" + process.env.CONS_ONLY : ""}`;
type Img = { d: Buffer; w: number; h: number };
const rawOf = async (b: Buffer): Promise<Img> => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, w: info.width, h: info.height }; };
const rgb = (im: Img, x: number, y: number) => { const i = (y * im.w + x) * 4; return [im.d[i], im.d[i + 1], im.d[i + 2]]; };
const dist = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
type Box = { x0: number; y0: number; w: number; h: number };

function framesOf(kind: "strip" | "sheet", sm: Img): { boxes: Box[]; bg: number[] | null } {
  if (kind === "sheet") { const fw = Math.floor(sm.w / 3), fh = Math.floor(sm.h / 2); const b: Box[] = []; for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) b.push({ x0: Math.round((i * sm.w) / 3), y0: Math.round((j * sm.h) / 2), w: fw, h: fh }); return { boxes: b, bg: null }; }
  const bg = rgb(sm, 0, 0), isBg = (x: number, y: number) => dist(rgb(sm, x, y), bg) < 30;
  let cut = sm.h; for (let y = Math.floor(sm.h * 0.4); y < sm.h; y++) { let e = true; for (let x = 0; x < sm.w; x++) if (!isBg(x, y)) { e = false; break; } if (e) { cut = y; break; } }
  const used = Array.from({ length: sm.w }, (_, x) => { for (let y = 0; y < cut; y++) if (!isBg(x, y)) return true; return false; });
  const runs: [number, number][] = []; for (let x = 0; x < sm.w; x++) if (used[x]) { if (runs.length && x - runs[runs.length - 1][1] <= 3) runs[runs.length - 1][1] = x; else runs.push([x, x]); }
  return { boxes: runs.map(([a, b]) => { let t = cut, d = 0; for (let x = a; x <= b; x++) for (let y = 0; y < cut; y++) if (!isBg(x, y)) { t = Math.min(t, y); d = Math.max(d, y); } return { x0: a, y0: t, w: b - a + 1, h: d - t + 1 }; }), bg };
}

const rows: { input: string; pair: string; C: number; S: number; n: number; verdict: string; sab: boolean }[] = [];
const broken: string[] = [];
for (const inp of inputs) {
  const src = readFileSync(`${DIR}/${inp.name}-${inp.kind}.png`);
  let r; try { r = await realDot(src, VAR); } catch { broken.push(`${inp.name}-${inp.kind}`); continue; }
  const sm = await rawOf(r.small), orig = await rawOf(src), [cx, cy] = r.cuts;
  const F = framesOf(inp.kind, sm);
  if (SAB && F.boxes[2]) { // 심은 고장: 셋째 프레임 몸통 칸 1/3 을 첫 칸 색과 다른 색으로
    const b = F.boxes[2]; let k = 0;
    for (let y = b.y0 + Math.floor(b.h * LOCK.torso); y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) if (k++ % 3 === 0) { const i = (y * sm.w + x) * 4; sm.d[i] = 255 - sm.d[i]; sm.d[i + 1] = 255 - sm.d[i + 1]; }
  }
  // 원본 칸 안쪽 50% 평균색
  const inner = (i: number, j: number) => {
    const x0 = cx[i], x1 = cx[i + 1], y0 = cy[j], y1 = cy[j + 1], mx = (x1 - x0) / 4, my = (y1 - y0) / 4;
    let s = [0, 0, 0], n = 0;
    for (let y = Math.floor(y0 + my); y < Math.ceil(y1 - my); y++) for (let x = Math.floor(x0 + mx); x < Math.ceil(x1 - mx); x++) { const c = rgb(orig, x, y); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++; }
    return n ? s.map((v) => v / n) : [0, 0, 0];
  };
  const isBgC = (x: number, y: number) => F.bg ? dist(rgb(sm, x, y), F.bg) < 30 : false;
  for (let f = 1; f < F.boxes.length; f++) {
    const a = F.boxes[0], b = F.boxes[f], ys = Math.floor(a.h * LOCK.torso);
    let best = { C: -1, S: 0, n: 0 };
    for (let dy = -LOCK.shift; dy <= LOCK.shift; dy++) for (let dx = -LOCK.shift; dx <= LOCK.shift; dx++) {
      let drawnSame = 0, convSame = 0, total = 0;
      for (let y = ys; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        const ax = a.x0 + x, ay = a.y0 + y, bx = b.x0 + x + dx, by = b.y0 + y + dy;
        if (bx < 0 || by < 0 || bx >= sm.w || by >= sm.h || ay >= sm.h || ax >= sm.w) continue;
        if (isBgC(ax, ay) && isBgC(bx, by)) continue;
        total++;
        if (dist(inner(ax, ay), inner(bx, by)) <= LOCK.same) { drawnSame++; if (dist(rgb(sm, ax, ay), rgb(sm, bx, by)) === 0) convSame++; }
      }
      const C = drawnSame ? convSame / drawnSame : 0;
      // 고르는 기준은 "같게 그린 칸" 수(그림이 가장 잘 겹치는 자리) — C 로 고르면 자가 제 점수를 올리는 자리를 고른다
      if (drawnSame > best.n || (drawnSame === best.n && C > best.C)) best = { C, S: total ? drawnSame / total : 0, n: drawnSame };
    }
    const verdict = best.n < LOCK.minCells ? "못 잼" : best.C >= LOCK.pass ? "통과" : best.C < LOCK.fail ? "실패" : "애매";
    rows.push({ input: `${inp.name}-${inp.kind}`, pair: `1↔${f + 1}`, C: best.C, S: best.S, n: best.n, verdict, sab: SAB && f === 2 });
  }
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
for (const k of ["strip", "sheet"]) {
  const rs = rows.filter((r) => r.input.endsWith(k));
  const cnt = (v: string) => rs.filter((r) => r.verdict === v).length;
  console.log(`[${k}] ${rs.length}짝 · 통과 ${cnt("통과")} · 애매 ${cnt("애매")} · 실패 ${cnt("실패")} · 못 잼 ${cnt("못 잼")} · 변환기 일관성 C 중앙값 ${pct(med(rs.map((r) => r.C)))} · AI 그림 일관성 S 중앙값 ${pct(med(rs.map((r) => r.S)))}`);
}
console.log(`격자 못 찾음: ${broken.join(", ") || "없음"}`);
for (const r of rows) if (r.verdict !== "통과") console.log(`  ${r.verdict} ${r.input} ${r.pair} C ${pct(r.C)} (같게 그린 칸 ${r.n}) S ${pct(r.S)}`);
if (SAB) { const sb = rows.filter((r) => r.sab); console.log(`심은 고장 ${sb.length}짝 중 통과로 남은 것 ${sb.filter((r) => r.verdict === "통과").length} (0 이어야 이빨이 있다)`); }
mkdirSync("engine/work/realdot", { recursive: true });
writeFileSync(`engine/work/realdot/consistency2-${TAG}${SAB ? "-sabotage" : ""}.json`, JSON.stringify({ lock: LOCK, rows, broken }, null, 1));
