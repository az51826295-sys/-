/**
 * 그림 판정 — 싼 AI · 비싼 AI · 올리기 · 기계+AI (11-23). 설계·판정식: engine/docs/image-judge-cascade-design.md
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/image_judge_cascade.mts --task t1|t2 [--probe 5]
 *
 * --probe N : N 쌍만 A·B 로 돌려 쌍당 값을 잰다(전체 어림 찍고 끝).
 * 결과: engine/work/image-judge/<task>.json
 */
import { z } from "zod";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { costOf } = await import("../../src/lib/costs/pricing");

const arg = (n: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const TASK = arg("--task") ?? "t1";
const PROBE = Number(arg("--probe") ?? 0);
const CHEAP = "gpt-5.6-luna", BIG = "gpt-5", TAU = 0.8, N_TEST = 120, N_DEV = 40;
const DIR = "engine/work/image-judge";
mkdirSync(DIR, { recursive: true });

let seed = 20261123;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

type Pair = { id: string; a: string; b: string; truth: "same" | "different" | "1" | "2"; prompt?: string };

// ---------- 시험지 만들기 ----------
function t1Pairs(): { dev: Pair[]; test: Pair[] } {
  const W = "engine/work/datasets/wikiart";
  const meta = JSON.parse(readFileSync(`${W}/meta.json`, "utf-8")) as { file: string; artist: string }[];
  const by = new Map<string, string[]>();
  for (const m of meta) by.set(m.artist, [...(by.get(m.artist) ?? []), `${W}/${m.file}`]);
  const artists = [...by.keys()];
  const make = (lo: number, hi: number, n: number, tag: string) => {
    const pool = new Map(artists.map((a) => [a, by.get(a)!.slice(lo, hi)]));
    const out: Pair[] = [];
    const seen = new Set<string>();
    while (out.length < n) {
      const same = out.length % 2 === 0;
      const x = pick(artists), y = same ? x : pick(artists.filter((a) => a !== x));
      const a = pick(pool.get(x)!), b = pick(pool.get(y)!);
      if (a === b || seen.has(a + b) || seen.has(b + a)) continue;
      seen.add(a + b);
      const flip = rnd() < 0.5;
      out.push({ id: `${tag}${out.length}`, a: flip ? b : a, b: flip ? a : b, truth: same ? "same" : "different" });
    }
    return out;
  };
  return { dev: make(0, 15, N_DEV, "d"), test: make(15, 50, N_TEST, "t") };
}
function t2Pairs(): Pair[] {
  const H = "engine/work/datasets/hpdv2";
  const rows = JSON.parse(readFileSync(`${H}/test.json`, "utf-8")) as { prompt: string; image_path: string[]; raw_annotations: { annotation: number[] }[] }[];
  const out: Pair[] = [];
  const order = rows.map((_, i) => i).sort(() => rnd() - 0.5);
  for (const i of order) {
    if (out.length >= N_TEST) break;
    const r = rows[i];
    const k = r.image_path.length;
    // 평균 순위(작을수록 좋음)
    const mean = Array.from({ length: k }, (_, j) => r.raw_annotations.reduce((s, a) => s + a.annotation[j], 0) / r.raw_annotations.length);
    const cand: [number, number][] = [];
    for (let x = 0; x < k; x++) for (let y = 0; y < k; y++) {
      if (x === y || Math.abs(mean[x] - mean[y]) < 3) continue;
      const xBetter = r.raw_annotations.filter((a) => a.annotation[x] < a.annotation[y]).length;
      if (mean[x] < mean[y] && xBetter > r.raw_annotations.length / 2) cand.push([x, y]);
    }
    if (!cand.length) continue;
    const [good, bad] = pick(cand);
    const flip = rnd() < 0.5;
    out.push({ id: `h${i}`, prompt: r.prompt, a: `${H}/test/${r.image_path[flip ? bad : good]}`, b: `${H}/test/${r.image_path[flip ? good : bad]}`, truth: flip ? "2" : "1" });
  }
  return out;
}

// ---------- 기계 특징 (T1 D 팔) ----------
async function feat(p: string) {
  const { data, info } = await sharp(p).resize(96, 96, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const hue = new Array(12).fill(0), sat = new Array(4).fill(0), val = new Array(4).fill(0);
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 3] / 255, g = data[i * 3 + 1] / 255, b = data[i * 3 + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const s = mx ? d / mx : 0;
    hue[Math.min(11, Math.floor(h * 2))] += s; sat[Math.min(3, Math.floor(s * 4))]++; val[Math.min(3, Math.floor(mx * 4))]++;
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  let grad = 0;
  for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) grad += Math.abs(gray[y * W + x] - gray[y * W + x - 1]) + Math.abs(gray[y * W + x] - gray[(y - 1) * W + x]);
  const norm = (v: number[]) => { const s = v.reduce((a, b) => a + b, 0) || 1; return v.map((x) => x / s); };
  return { hue: norm(hue), sat: norm(sat), val: norm(val), grad: grad / (W * H) };
}
type F = Awaited<ReturnType<typeof feat>>;
const l1 = (a: number[], b: number[]) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
const dist = (a: F, b: F) => l1(a.hue, b.hue) + l1(a.sat, b.sat) + l1(a.val, b.val) + 4 * Math.abs(a.grad - b.grad);

// ---------- AI 판정 ----------
const schema = z.object({ 답: z.string(), 자신감: z.number(), 이유: z.string() });
const SYS_T1 = "You are an art expert. You see two paintings. Decide whether the SAME artist painted both. Judge brushwork, palette, composition habits — not subject. Answer `답` as exactly `same` or `different`. `자신감` = your probability (0 to 1) that your answer is right. `이유` one sentence.";
const SYS_T2 = "You see a text prompt and two AI-generated images (image 1 first, image 2 second). Pick the image most human raters would prefer overall (prompt match, quality, aesthetics). Answer `답` as exactly `1` or `2`. `자신감` = your probability (0 to 1) that your answer is right. `이유` one sentence.";
const b64 = async (p: string) => (await sharp(p).resize(512, 512, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer()).toString("base64");

type Ans = { 답: string; conf: number; usd: number; err?: string };
async function ask(model: string, p: Pair): Promise<Ans> {
  const ai = createOpenAIProvider({ judgmentModel: model });
  try {
    const r = await ai.generateStructuredOutput({
      systemInstructions: TASK === "t1" ? SYS_T1 : SYS_T2,
      input: TASK === "t1" ? "Painting 1 and painting 2 are attached in that order." : `Prompt: ${p.prompt}\nImage 1 and image 2 are attached in that order.`,
      images: [await b64(p.a), await b64(p.b)], schema, schemaName: "pair", maxTokens: 16000, tier: "judgment",
    });
    const o = r.output as { 답: string; 자신감: number };
    return { 답: String(o.답).trim().toLowerCase(), conf: Number(o.자신감), usd: costOf({ backend: model, inputTokens: r.inputTokens, outputTokens: r.outputTokens }) };
  } catch (e) {
    const x = e as { inputTokens?: number; outputTokens?: number; message?: string };
    return { 답: "(떨어짐)", conf: 0, usd: costOf({ backend: model, inputTokens: x.inputTokens ?? 0, outputTokens: x.outputTokens ?? 0 }), err: String(x.message ?? e).slice(0, 50) };
  }
}
async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}

// ---------- 돌리기 ----------
const { dev, test } = TASK === "t1" ? t1Pairs() : { dev: [] as Pair[], test: t2Pairs() };
console.log(`${TASK}: 시험 ${test.length}쌍${dev.length ? ` · 개발 ${dev.length}쌍` : ""}`);
const pairs = PROBE ? test.slice(0, PROBE) : test;
const [A, B] = await Promise.all([pool(pairs, 6, (p) => ask(CHEAP, p)), pool(pairs, 4, (p) => ask(BIG, p))]);
const usd = (xs: Ans[]) => xs.reduce((s, x) => s + x.usd, 0);
if (PROBE) {
  const per = (usd(A) + usd(B)) / pairs.length;
  console.log(`쌍당 A $${(usd(A) / pairs.length).toFixed(4)} · B $${(usd(B) / pairs.length).toFixed(4)} → 시험 전체 어림 $${(per * test.length).toFixed(2)}`);
  console.log("A", A.map((a, i) => `${a.답}/${a.conf}${a.답 === pairs[i].truth ? "✓" : "✗"}`).join(" "));
  console.log("B", B.map((a, i) => `${a.답}/${a.conf}${a.답 === pairs[i].truth ? "✓" : "✗"}`).join(" "));
  process.exit(0);
}
const acc = (ans: string[]) => ans.filter((a, i) => a === pairs[i].truth).length / pairs.length;
const C = pairs.map((_, i) => (A[i].conf >= TAU && !A[i].err ? { 답: A[i].답, usd: A[i].usd, up: false } : { 답: B[i].답, usd: A[i].usd + B[i].usd, up: true }));
const res: Record<string, unknown> = { task: TASK, n: pairs.length };
const line = (n: string, a: number, u: number, extra = "") => console.log(`${n.padEnd(12)} 정확도 ${(a * 100).toFixed(1)}% · $${u.toFixed(4)}${extra}`);
const accA = acc(A.map((x) => x.답)), accB = acc(B.map((x) => x.답)), accC = acc(C.map((x) => x.답));
const uA = usd(A), uB = usd(B), uC = C.reduce((s, x) => s + x.usd, 0);
line("A 싼 혼자", accA, uA); line("B 비싼 혼자", accB, uB); line("C 올리기", accC, uC, ` · 올림 ${C.filter((x) => x.up).length}/${pairs.length}`);
Object.assign(res, { accA, accB, accC, uA, uB, uC });

let accD = NaN, uD = NaN;
if (TASK === "t1") {
  // 개발 쌍으로 기계 문턱을 정하고 잠근다(시험 쌍은 안 본다).
  const fcache = new Map<string, F>();
  const fget = async (p: string) => fcache.get(p) ?? (fcache.set(p, await feat(p)), fcache.get(p)!);
  const dd = await Promise.all(dev.map(async (p) => ({ d: dist(await fget(p.a), await fget(p.b)), same: p.truth === "same" })));
  const ds = [...new Set(dd.map((x) => x.d))].sort((a, b) => a - b);
  let lo = -Infinity, hi = Infinity;
  for (const t of ds) { const sel = dd.filter((x) => x.d <= t); if (sel.length >= 3 && sel.filter((x) => x.same).length / sel.length >= 0.9) lo = t; }
  for (const t of [...ds].reverse()) { const sel = dd.filter((x) => x.d >= t); if (sel.length >= 3 && sel.filter((x) => !x.same).length / sel.length >= 0.9) hi = t; }
  console.log(`기계 문턱(개발에서 잠금): 같음 ≤ ${lo.toFixed(3)} · 다름 ≥ ${hi.toFixed(3)}`);
  const D = await Promise.all(pairs.map(async (p, i) => {
    const d = dist(await fget(p.a), await fget(p.b));
    if (d <= lo) return { 답: "same", usd: 0, by: "기계" };
    if (d >= hi) return { 답: "different", usd: 0, by: "기계" };
    return { 답: C[i].답, usd: C[i].usd, by: "AI" };
  }));
  accD = acc(D.map((x) => x.답)); uD = D.reduce((s, x) => s + x.usd, 0);
  const 기계 = D.filter((x) => x.by === "기계");
  const 기계맞음 = D.filter((x, i) => x.by === "기계" && x.답 === pairs[i].truth).length;
  line("D 기계+AI", accD, uD, ` · 기계가 끝냄 ${기계.length}/${pairs.length}(그중 맞음 ${기계맞음})`);
  Object.assign(res, { accD, uD, lo, hi, 기계: 기계.length, 기계맞음 });
}
const pp = (x: number) => x * 100;
const headroom = accA < accB - 0.03;
console.log(`\n판정: B ${pp(accB).toFixed(1)}%${accB <= 0.6 ? " → 누구도 못 하는 과제(판정 안 냄)" : ""}`);
if (accB > 0.6) {
  if (!headroom) console.log("  ① A ≥ B − 3%p → 싼 AI 로 충분, C·D 판정 안 냄");
  else {
    console.log(`  ② C ${accC >= accB - 0.03 && uC <= uB * 0.5 ? "선다" : "안 선다"} (정확도 ${pp(accC - accB).toFixed(1)}%p · 값 ${((uC / uB) * 100).toFixed(0)}%)`);
    if (TASK === "t1") console.log(`  ③ D ${accD >= accC - 0.02 && uD <= uC * 0.7 ? "선다" : "안 선다"} (C 대비 정확도 ${pp(accD - accC).toFixed(1)}%p · 값 ${((uD / uC) * 100).toFixed(0)}%)`);
  }
}
writeFileSync(`${DIR}/${TASK}.json`, JSON.stringify({ ...res, rows: pairs.map((p, i) => ({ id: p.id, truth: p.truth, A: A[i], B: B[i] })) }, null, 1));
