/**
 * 돈 안 드는 강화 (11-23) — 유료 AI 호출 0. 설계: engine/docs/image-judge-cascade-design.md "2판(무료)".
 *  (3) 자신감 다시 맞추기: t1.json 에 이미 적힌 답만 쓴다. 유효 90쌍을 앞 45(맞추기)/뒤 45(재기)로 나눈다.
 *  (1) CLIP(내 기계에서 도는 공개 모델)으로 그림을 숫자 묶음으로 → 기계 판정 두 가지:
 *      a. 두 그림 거리 문턱(개발 40쌍에서 90% 이상 맞는 구간을 잠금)
 *      b. 화가 중심점(개발 그림 15장/화가의 평균) — 두 그림이 같은 중심점에 붙으면 같음
 *    기계가 확실하면 끝내고, 애매하면 기록된 올리기(C) 답을 쓴다 = D2.
 *
 *   npx tsx engine/tools/image_judge_free.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const T = await import(pathToFileURL(resolve("engine/work/clip-env/node_modules/@huggingface/transformers/dist/transformers.node.mjs")).href);
T.env.cacheDir = resolve("engine/work/clip-env/models");

// ---- 시험 쌍을 1판과 똑같이 다시 만든다(같은 씨앗·같은 순서) ----
let seed = 20261123;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
type Pair = { id: string; a: string; b: string; truth: "same" | "different" };
const W = "engine/work/datasets/wikiart";
const meta = JSON.parse(readFileSync(`${W}/meta.json`, "utf-8")) as { file: string; artist: string }[];
const by = new Map<string, string[]>();
for (const m of meta) by.set(m.artist, [...(by.get(m.artist) ?? []), `${W}/${m.file}`]);
const artists = [...by.keys()];
const make = (lo: number, hi: number, n: number, tag: string) => {
  const pool = new Map(artists.map((a) => [a, by.get(a)!.slice(lo, hi)]));
  const out: Pair[] = []; const seen = new Set<string>();
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
const dev = make(0, 15, 40, "d"), test = make(15, 50, 120, "t");
// 2판 고침: 중심점은 앞 10장, "확실" 문턱은 11~15번째 그림으로 만든 쌍에서 잡는다(같은 그림을 두 번 쓰지 않게).
const cal = make(10, 15, 40, "c");
const run1 = JSON.parse(readFileSync("engine/work/image-judge/t1.json", "utf-8")) as { rows: { id: string; truth: string; A: { 답: string; conf: number; usd: number; err?: string }; B: { 답: string; conf: number; usd: number; err?: string } }[] };
const rowById = new Map(run1.rows.map((r) => [r.id, r]));
for (const p of test) if (rowById.get(p.id)?.truth !== p.truth) throw new Error(`쌍이 1판과 다름: ${p.id}`);
const valid = test.filter((p) => { const r = rowById.get(p.id)!; return !r.A.err && !r.B.err; });
const fitSet = valid.slice(0, 45), evalSet = valid.slice(45);
const pct = (x: number) => (x * 100).toFixed(1) + "%";
const accOf = (ps: Pair[], f: (p: Pair) => string) => ps.filter((p) => f(p) === p.truth).length / ps.length;

// ---- (3) 자신감 다시 맞추기: 맞추기 45쌍에서 "C 정확도 최대, 같으면 덜 올리는" 문턱 → 재기 45쌍 ----
const cAns = (p: Pair, tau: number) => { const r = rowById.get(p.id)!; return r.A.conf >= tau ? r.A.답 : r.B.답; };
const cUsd = (ps: Pair[], tau: number) => ps.reduce((s, p) => { const r = rowById.get(p.id)!; return s + r.A.usd + (r.A.conf >= tau ? 0 : r.B.usd); }, 0);
const taus = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.93, 0.95, 0.97, 0.99, 1.01];
let best = 0.8, bestAcc = -1;
for (const t of taus) { const a = accOf(fitSet, (p) => cAns(p, t)); if (a > bestAcc + 1e-9) { bestAcc = a; best = t; } }
const B = (p: Pair) => rowById.get(p.id)!.B.답, A = (p: Pair) => rowById.get(p.id)!.A.답;
const uB = (ps: Pair[]) => ps.reduce((s, p) => s + rowById.get(p.id)!.B.usd, 0);
console.log(`(3) 자신감 문턱: 맞추기 45쌍에서 고른 τ=${best}(그때 ${pct(bestAcc)})`);
console.log(`    재기 45쌍: A ${pct(accOf(evalSet, A))} · B ${pct(accOf(evalSet, B))} · C(τ=0.8) ${pct(accOf(evalSet, (p) => cAns(p, 0.8)))} 값 ${(cUsd(evalSet, 0.8) / uB(evalSet) * 100).toFixed(0)}% · C(τ=${best}) ${pct(accOf(evalSet, (p) => cAns(p, best)))} 값 ${(cUsd(evalSet, best) / uB(evalSet) * 100).toFixed(0)}%`);

// ---- (1) CLIP ----
const MODEL = "Xenova/clip-vit-base-patch32";
const processor = await T.AutoProcessor.from_pretrained(MODEL);
const vision = await T.CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });
const emb = new Map<string, Float32Array>();
async function embed(p: string) {
  if (emb.has(p)) return emb.get(p)!;
  const img = await T.RawImage.read(p);
  const { image_embeds } = await vision(await processor(img));
  const v = Float32Array.from(image_embeds.data as Float32Array);
  const n = Math.hypot(...v); for (let i = 0; i < v.length; i++) v[i] /= n;
  emb.set(p, v); return v;
}
const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
const t0 = Date.now();
for (const p of [...dev, ...test, ...cal]) { await embed(p.a); await embed(p.b); }
for (const a of artists) for (const f of by.get(a)!.slice(0, 15)) await embed(f);
console.log(`CLIP: 그림 ${emb.size}장 숫자로 바꿈 · ${((Date.now() - t0) / 1000).toFixed(0)}초 · 유료 호출 0`);

// a. 거리 문턱 (개발 40쌍)
const sim = (p: Pair) => cos(emb.get(p.a)!, emb.get(p.b)!);
const dd = dev.map((p) => ({ s: sim(p), same: p.truth === "same" }));
const ss = [...new Set(dd.map((x) => x.s))].sort((x, y) => x - y);
let hiSame = Infinity, loDiff = -Infinity;
for (const t of [...ss].reverse()) { const sel = dd.filter((x) => x.s >= t); if (sel.length >= 3 && sel.filter((x) => x.same).length / sel.length >= 0.9) hiSame = t; }
for (const t of ss) { const sel = dd.filter((x) => x.s <= t); if (sel.length >= 3 && sel.filter((x) => !x.same).length / sel.length >= 0.9) loDiff = t; }
// 하나짜리 문턱(기계 혼자 참고용): 개발에서 정확도 최대
let one = 0, oneAcc = -1;
for (const t of ss) { const a = dd.filter((x) => (x.s >= t) === x.same).length / dd.length; if (a > oneAcc) { oneAcc = a; one = t; } }

// b. 화가 중심점 (개발 그림 15장/화가)
const cent = new Map<string, Float32Array>();
for (const a of artists) {
  const vs = by.get(a)!.slice(0, 10).map((f) => emb.get(f)!);
  const c = new Float32Array(vs[0].length); for (const v of vs) for (let i = 0; i < c.length; i++) c[i] += v[i];
  const n = Math.hypot(...c); for (let i = 0; i < c.length; i++) c[i] /= n; cent.set(a, c);
}
const nearest = (v: Float32Array) => { const s = artists.map((a) => ({ a, s: cos(v, cent.get(a)!) })).sort((x, y) => y.s - x.s); return { a: s[0].a, margin: s[0].s - s[1].s }; };
const centAns = (p: Pair) => (nearest(emb.get(p.a)!).a === nearest(emb.get(p.b)!).a ? "same" : "different");
// 중심점이 "확실" = 두 그림 다 1등·2등 차이가 개발에서 정한 값 이상. 개발 쌍에서 90% 이상 맞는 가장 작은 차이를 잠근다.
const mOf = (p: Pair) => Math.min(nearest(emb.get(p.a)!).margin, nearest(emb.get(p.b)!).margin);
const ms = [...new Set(cal.map(mOf))].sort((x, y) => x - y);
let mLock = Infinity;
for (const m of [...ms].reverse()) { const sel = cal.filter((p) => mOf(p) >= m); if (sel.length >= 3 && sel.filter((p) => centAns(p) === p.truth).length / sel.length >= 0.9) mLock = m; }
console.log(`잠금(개발 40쌍): 거리 같음 ≥ ${hiSame.toFixed(3)} · 다름 ≤ ${loDiff.toFixed(3)} · 중심점 확실 margin ≥ ${mLock === Infinity ? "없음" : mLock.toFixed(4)}`);

// 재기: 유효 90쌍 전체(기계 문턱은 개발에서만 정했으니 시험 쌍 전부를 써도 된다)
const machineA = (p: Pair) => { const s = sim(p); return s >= hiSame ? "same" : s <= loDiff ? "different" : null; };
const machineB = (p: Pair) => (mOf(p) >= mLock ? centAns(p) : null);
const report = (name: string, mf: (p: Pair) => string | null) => {
  let usd = 0, byM = 0, mOk = 0;
  const ans = (p: Pair) => { const m = mf(p); if (m) { byM++; if (m === p.truth) mOk++; return m; } usd += cUsd([p], 0.8); return cAns(p, 0.8); };
  const acc = accOf(valid, ans);
  console.log(`  ${name.padEnd(14)} ${pct(acc)} · $${usd.toFixed(3)} · 기계가 끝냄 ${byM}/${valid.length}(맞음 ${mOk})`);
  return { acc, usd };
};
const uBv = uB(valid), uCv = cUsd(valid, 0.8), accB = accOf(valid, B), accC = accOf(valid, (p) => cAns(p, 0.8));
console.log(`\n유효 90쌍: A ${pct(accOf(valid, A))} · B ${pct(accB)} $${uBv.toFixed(3)} · C ${pct(accC)} $${uCv.toFixed(3)}`);
console.log(`  기계 혼자(CLIP 거리 하나 문턱) ${pct(accOf(valid, (p) => (sim(p) >= one ? "same" : "different")))} · 기계 혼자(중심점) ${pct(accOf(valid, centAns))} · 값 $0`);
const d2a = report("D2a 거리+C", machineA);
const d2b = report("D2b 중심점+C", machineB);
for (const [n, d] of [["D2a", d2a], ["D2b", d2b]] as const)
  console.log(`  ${n} 판정(잠근 식): C 대비 ${((d.acc - accC) * 100).toFixed(1)}%p · 값 ${(d.usd / uCv * 100).toFixed(0)}% → ${d.acc >= accC - 0.02 && d.usd <= uCv * 0.7 ? "선다" : "안 선다"} · B 대비 ${((d.acc - accB) * 100).toFixed(1)}%p 값 ${(d.usd / uBv * 100).toFixed(0)}%`);
writeFileSync("engine/work/image-judge/t1-free.json", JSON.stringify({ best, hiSame, loDiff, one, mLock, d2a, d2b, accB, accC }, null, 1));
