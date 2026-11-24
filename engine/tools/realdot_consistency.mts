/**
 * 진짜 도트 변환기 — **일관성 시험** (11-24 사장님: "성능 시험해 보자 · 일관성 · 로키 엔진을 빌려서").
 *
 *   npx tsx engine/tools/realdot_consistency.mts              본판
 *   npx tsx engine/tools/realdot_consistency.mts --sabotage   심은 고장: 셋째 프레임의 몸통을 반 칸 밀어 둔다 → 자가 잡아야 한다
 *   --no-ai                                                   애매한 칸을 AI 에 안 묻는다(기계만)
 *
 * ## 묻는 것
 * 같은 캐릭터의 표정 프레임들은 **몸통이 같은 그림**이다. 진짜 도트로 바꾼 뒤 프레임끼리 몸통이 **칸 단위로 똑같이 겹치나?**
 * 겹쳐야 "자르기"가 된다 — 프레임을 같은 크기로 잘라 번갈아 보여 줘도 몸이 떨리지 않고, 부위를 바꿔 끼울 수 있다.
 *
 * ## 재료 (고정)
 * 두근도트 캐릭터 시트 — 가로 strip 6장(haru·jiwoo·nabi·soeun·taeo·yeonu, 윗줄 6프레임) + 3×2 sheet 7장(+yuna).
 * 한 항목 = (첫 프레임, 다른 프레임 하나) 짝. strip 6×5 = 30 짝, sheet 7×5 = 35 짝.
 *
 * ## 기계가 재는 것 (판정식 — **돌리기 전에 잠금**)
 * - M1 프레임 크기: strip 은 배경으로 갈라 찾은 6덩어리의 칸 크기가 모두 같은가 · sheet 는 논리 폭이 3의 배수, 높이가 2의 배수인가.
 * - M2 몸통 일치율: 프레임 아래 1/4 줄(몸통)에서, ±2칸 안 정수 이동 중 가장 잘 맞는 자리의 **같은 색 칸 비율**.
 *       strip 은 둘 중 하나라도 배경이 아닌 칸만 센다 · sheet 는 배경이 그라데이션이라 전부 센다.
 * - 판정: M1 이 거짓이거나 M2 < 0.70 → 기계 "실패" · M1 참이고 M2 ≥ 0.90 → 기계 "통과" · 그 사이 → "애매".
 * - M3 결정성: 같은 그림을 두 번 바꾸면 결과 바이트가 같은가(그림마다 한 번).
 * - 비교용(판정에 안 씀): AI 원본 픽셀에서 같은 몸통 자리를 같은 방식(±한 칸 픽셀 이동)으로 맞춰 본 일치율 —
 *       "완전히 같은 픽셀" 비율과 "RGB 차 합 ≤ 24" 비율.
 *
 * ## 로키 엔진을 빌리는 자리
 * 애매한 짝만 판단자(gpt-5.6-luna)에게 두 몸통 그림을 보여 "같은 몸통 그림이 같은 칸에 놓였나"와 자신감을 받는다.
 * 그 다음은 로키의 `checkGate` 그대로 — 기계 판정이 있으면 그게 이기고($0), 없으면 자신감을 문턱(장부 없으면 0.93)과 비교해
 * 받음/올림. 올림 = 사람이 볼 것.
 *
 * ## 자가 이빨이 있나
 * --sabotage: 각 시트의 셋째 프레임 몸통 줄을 원본에서 반 칸(p/2 px) 옆으로 밀고 바꾼다. 그 짝들이 기계 "통과"로 남으면 자가 이빨이 없는 것.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { z } from "zod";
import { realDot } from "../../src/lib/pixel/realdot";
import { checkGate } from "../../src/lib/director/index";

for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_0-9]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const SAB = process.argv.includes("--sabotage"), NOAI = process.argv.includes("--no-ai");
const DIR = "C:/Users/az518/Desktop/두근도트-시트";
const OUT = "engine/work/realdot/consistency" + (SAB ? "-sabotage" : ""); mkdirSync(OUT, { recursive: true });
const LOCK = { fail: 0.70, pass: 0.90, shift: 2, torso: 0.75, near: 24 } as const;
const NAMES = ["haru", "jiwoo", "nabi", "soeun", "taeo", "yeonu"];
const inputs = [...NAMES.map((n) => ({ name: n, kind: "strip" as const, file: `${DIR}/${n}-strip.png` })), ...[...NAMES, "yuna"].map((n) => ({ name: n, kind: "sheet" as const, file: `${DIR}/${n}-sheet.png` }))];

type Img = { d: Buffer; w: number; h: number };
const rawOf = async (b: Buffer): Promise<Img> => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, w: info.width, h: info.height }; };
const rgb = (im: Img, x: number, y: number) => { const i = (y * im.w + x) * 4; return [im.d[i], im.d[i + 1], im.d[i + 2]]; };
const dist = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
type Box = { x0: number; y0: number; w: number; h: number };

/** 두 상자의 몸통 줄을 ±s 이동으로 맞춰 본 최고 일치율. cmp = 같다고 볼 기준, use = 셀 칸인가 */
function bestMatch(im: Img, a: Box, b: Box, s: number, torso: number, cmp: (p: number[], q: number[]) => boolean, use: (p: number[], q: number[]) => boolean) {
  let best = { score: -1, dx: 0, dy: 0 };
  const yStart = Math.floor(a.h * torso);
  for (let dy = -s; dy <= s; dy++) for (let dx = -s; dx <= s; dx++) {
    let same = 0, n = 0;
    for (let y = yStart; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const bx = b.x0 + x + dx, by = b.y0 + y + dy;
      if (bx < 0 || by < 0 || bx >= im.w || by >= im.h) continue;
      const p = rgb(im, a.x0 + x, a.y0 + y), q = rgb(im, bx, by);
      if (!use(p, q)) continue;
      n++; if (cmp(p, q)) same++;
    }
    const sc = n ? same / n : 0;
    if (sc > best.score) best = { score: sc, dx, dy };
  }
  return best;
}

/** 심은 고장: 원본에서 상자(원본 px) 아래 1/4 을 dx px 옆으로 민다 */
async function sabotage(buf: Buffer, box: Box, dx: number): Promise<Buffer> {
  const im = await rawOf(buf); const c = Buffer.from(im.d);
  const y0 = box.y0 + Math.floor(box.h * LOCK.torso);
  for (let y = y0; y < box.y0 + box.h; y++) for (let x = box.x0 + box.w - 1; x >= box.x0; x--) {
    const sx = x - dx; if (sx < box.x0) continue;
    im.d.copy(c, (y * im.w + x) * 4, (y * im.w + sx) * 4, (y * im.w + sx) * 4 + 4);
  }
  return sharp(c, { raw: { width: im.w, height: im.h, channels: 4 } }).png().toBuffer();
}

/** 변환 결과에서 프레임 상자(논리 칸) 찾기 */
function framesOf(kind: "strip" | "sheet", sm: Img): { boxes: Box[]; m1: boolean; why: string; bg: number[] | null } {
  if (kind === "sheet") {
    const ok = sm.w % 3 === 0 && sm.h % 2 === 0, fw = Math.floor(sm.w / 3), fh = Math.floor(sm.h / 2);
    const boxes: Box[] = []; for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) boxes.push({ x0: Math.round((i * sm.w) / 3), y0: Math.round((j * sm.h) / 2), w: fw, h: fh });
    return { boxes, m1: ok, why: `${sm.w}×${sm.h} 칸 → 한 프레임 ${(sm.w / 3).toFixed(2)}×${(sm.h / 2).toFixed(2)}`, bg: null };
  }
  const bg = rgb(sm, 0, 0), isBg = (x: number, y: number) => dist(rgb(sm, x, y), bg) < 30;
  let cut = sm.h; for (let y = Math.floor(sm.h * 0.4); y < sm.h; y++) { let e = true; for (let x = 0; x < sm.w; x++) if (!isBg(x, y)) { e = false; break; } if (e) { cut = y; break; } }
  const used = Array.from({ length: sm.w }, (_, x) => { for (let y = 0; y < cut; y++) if (!isBg(x, y)) return true; return false; });
  const runs: [number, number][] = []; for (let x = 0; x < sm.w; x++) if (used[x]) { if (runs.length && x - runs[runs.length - 1][1] <= 3) runs[runs.length - 1][1] = x; else runs.push([x, x]); }
  const boxes = runs.map(([a, b]) => { let t = cut, d = 0; for (let x = a; x <= b; x++) for (let y = 0; y < cut; y++) if (!isBg(x, y)) { t = Math.min(t, y); d = Math.max(d, y); } return { x0: a, y0: t, w: b - a + 1, h: d - t + 1 }; });
  const ws = new Set(boxes.map((b) => b.w)), hs = new Set(boxes.map((b) => b.h));
  return { boxes, m1: boxes.length === 6 && ws.size === 1 && hs.size === 1, why: `${boxes.length}덩어리 · 폭 ${[...ws].join("/")} · 높이 ${[...hs].join("/")}`, bg };
}

const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { costOf } = await import("../../src/lib/costs/pricing");
const ai = NOAI ? null : createOpenAIProvider({ judgmentModel: "gpt-5.6-luna" });
const schema = z.object({ same: z.boolean(), confidence: z.number(), why: z.string() });
let usd = 0;

type Row = { input: string; pair: string; m1: boolean; m2: number; shift: string; machine: "pass" | "fail" | "unsure"; ai?: { same: boolean; confidence: number; why: string }; action: string; origExact: number; origNear: number; sabotaged: boolean };
const rows: Row[] = []; const det: { input: string; same: boolean }[] = []; const grids: { input: string; period: number; logical: string; why: string }[] = [];

for (const inp of inputs) {
  let src = readFileSync(inp.file);
  let r0;
  try { r0 = await realDot(src, { colors: 32 }); }
  catch (e) {
    // 격자를 못 찾음 = 이 그림은 자를 수 없다 → 다섯 짝 모두 기계 실패로 적는다(빼면 분모가 줄어 좋아 보인다)
    for (let f = 1; f < 6; f++) rows.push({ input: `${inp.name}-${inp.kind}`, pair: `1↔${f + 1}`, m1: false, m2: 0, shift: "-", machine: "fail", action: "escalate", origExact: NaN, origNear: NaN, sabotaged: false });
    grids.push({ input: `${inp.name}-${inp.kind}`, period: 0, logical: "-", why: (e as Error).message });
    console.log(`${inp.name}-${inp.kind}: ✗ ${(e as Error).message}`);
    continue;
  }
  const sm0 = await rawOf(r0.small);
  const f0 = framesOf(inp.kind, sm0);
  const sabIdx = 2;
  if (SAB && f0.boxes[sabIdx]) {
    const b = f0.boxes[sabIdx], [cx, cy] = r0.cuts;
    const ob: Box = { x0: cx[b.x0], y0: cy[b.y0], w: cx[Math.min(b.x0 + b.w, cx.length - 1)] - cx[b.x0], h: cy[Math.min(b.y0 + b.h, cy.length - 1)] - cy[b.y0] };
    src = await sabotage(src, ob, Math.round(r0.period[0] / 2));
  }
  const r = SAB ? await realDot(src, { colors: 32 }) : r0;
  const again = await realDot(src, { colors: 32 });
  det.push({ input: `${inp.name}-${inp.kind}`, same: Buffer.compare(r.small, again.small) === 0 });
  const sm = await rawOf(r.small);
  const F = framesOf(inp.kind, sm);
  grids.push({ input: `${inp.name}-${inp.kind}`, period: r.period[0], logical: r.logical.join("×"), why: F.why });
  const orig = await rawOf(src), [cx, cy] = r.cuts;
  const useSm = F.bg ? (p: number[], q: number[]) => dist(p, F.bg!) >= 30 || dist(q, F.bg!) >= 30 : () => true;
  const bgO = F.bg ? rgb(orig, 0, 0) : null;
  const useO = bgO ? (p: number[], q: number[]) => dist(p, bgO) >= 30 || dist(q, bgO) >= 30 : () => true;
  for (let f = 1; f < F.boxes.length; f++) {
    const a = F.boxes[0], b = F.boxes[f];
    const m = bestMatch(sm, a, b, LOCK.shift, LOCK.torso, (p, q) => dist(p, q) === 0, useSm);
    // 원본 픽셀에서 같은 자리(칸 경계로 옮김), 이동은 ±한 칸 픽셀
    const toO = (bx: Box): Box => ({ x0: cx[bx.x0], y0: cy[bx.y0], w: cx[Math.min(bx.x0 + bx.w, cx.length - 1)] - cx[bx.x0], h: cy[Math.min(bx.y0 + bx.h, cy.length - 1)] - cy[bx.y0] });
    const P = Math.ceil(r.period[0]);
    const oe = bestMatch(orig, toO(a), toO(b), P, LOCK.torso, (p, q) => dist(p, q) === 0, useO);
    const on = bestMatch(orig, toO(a), toO(b), P, LOCK.torso, (p, q) => dist(p, q) <= LOCK.near, useO);
    const machine: Row["machine"] = !F.m1 || m.score < LOCK.fail ? "fail" : m.score >= LOCK.pass ? "pass" : "unsure";
    let aiv: Row["ai"];
    if (machine === "unsure" && ai) {
      const crop = async (bx: Box) => sharp(r.small).extract({ left: bx.x0, top: bx.y0 + Math.floor(bx.h * LOCK.torso), width: bx.w, height: bx.h - Math.floor(bx.h * LOCK.torso) }).resize({ width: bx.w * 12, kernel: "nearest" }).png().toBuffer();
      try {
        const res = await ai.generateStructuredOutput({
          systemInstructions: "You check pixel-art sprite frames. Two crops show the BODY (torso) rows of two frames of the same character, cut at the same place. Faces/expressions are not shown. Decide whether the body is the same drawing on the same pixel grid (small differences from a speech bubble, an arm gesture, or one-pixel noise are allowed if the body itself lines up). Give confidence 0–1.",
          input: `Machine facts: ${(m.score * 100).toFixed(1)}% of body cells identical at best shift dx=${m.dx}, dy=${m.dy} (cells). Image 1 = frame 1, image 2 = frame ${f + 1}.`,
          images: [(await crop(a)).toString("base64"), (await crop(b)).toString("base64")],
          schema, schemaName: "same_body", maxTokens: 16000, tier: "judgment",
        });
        usd += costOf(res.model, res.inputTokens ?? 0, res.outputTokens ?? 0) ?? 0;
        aiv = res.output;
      } catch (e) { aiv = { same: false, confidence: 0, why: `판단자 실패: ${(e as Error).message.slice(0, 80)}` }; }
    }
    const gate = checkGate([], { kind: "realdot-consistency", seat: "gpt-5.6-luna" }, aiv ? (aiv.same ? aiv.confidence : 1 - aiv.confidence) * (aiv.same ? 1 : 0) : undefined, machine === "unsure" ? undefined : machine);
    rows.push({ input: `${inp.name}-${inp.kind}`, pair: `1↔${f + 1}`, m1: F.m1, m2: m.score, shift: `${m.dx},${m.dy}`, machine, ai: aiv, action: gate.action, origExact: oe.score, origNear: on.score, sabotaged: SAB && f === sabIdx });
  }
  console.log(`${inp.name}-${inp.kind}: 칸 ${r.period[0]}px ${r.logical.join("×")} · ${F.why} · ${F.m1 ? "M1 ✓" : "M1 ✗"}`);
}

// ── 결과
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const by = (k: "strip" | "sheet") => rows.filter((r) => r.input.endsWith(k));
const sum = (rs: Row[]) => ({ n: rs.length, pass: rs.filter((r) => r.machine === "pass").length, fail: rs.filter((r) => r.machine === "fail").length, unsure: rs.filter((r) => r.machine === "unsure").length, accepted: rs.filter((r) => r.action === "accept").length,
  m2med: [...rs].map((r) => r.m2).sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? 0, oExact: [...rs].map((r) => r.origExact).sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? 0, oNear: [...rs].map((r) => r.origNear).sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? 0 });
for (const k of ["strip", "sheet"] as const) { const s = sum(by(k)); console.log(`\n[${k}] ${s.n}짝 · 기계 통과 ${s.pass} · 실패 ${s.fail} · 애매 ${s.unsure} → 받음 ${s.accepted} · 몸통 일치 중앙값 ${pct(s.m2med)} (AI 원본: 완전 같음 ${pct(s.oExact)} · 비슷 ${pct(s.oNear)})`); }
console.log(`결정성: ${det.filter((d) => d.same).length}/${det.length} 같은 결과`);
if (SAB) { const sb = rows.filter((r) => r.sabotaged); console.log(`\n심은 고장 ${sb.length}짝 중 기계 통과로 남은 것 ${sb.filter((r) => r.machine === "pass").length} (0 이어야 자가 이빨이 있다) · 받음으로 남은 것 ${sb.filter((r) => r.action === "accept").length}`); }
console.log(`판단자 값 $${usd.toFixed(4)}`);
for (const r of rows.filter((r) => r.machine !== "pass")) console.log(`  ${r.machine === "fail" ? "✗" : "?"} ${r.input} ${r.pair} 몸통 ${pct(r.m2)} M1 ${r.m1 ? "✓" : "✗"}${r.ai ? ` · AI ${r.ai.same ? "같음" : "다름"} ${r.ai.confidence} — ${r.ai.why.slice(0, 90)}` : ""} → ${r.action}`);
writeFileSync(`${OUT}/result.json`, JSON.stringify({ lock: LOCK, sabotage: SAB, rows, det, grids, usd }, null, 1));
