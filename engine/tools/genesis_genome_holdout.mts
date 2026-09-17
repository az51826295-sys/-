/**
 * 유전자 후보를 떼어 둔 자료로 견주는 자 (116회차 09-15). 돈 0, 아무것도 쓰지 않는다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_genome_holdout.mts [회사이름]
 *
 * 진화가 무엇을 보고 골랐는지, 그 선택이 **고르는 데 쓰지 않은 자료**에서도 버티는지 한 표로 본다.
 * 115회차의 첫 채택이 선택 편향인지 확인하려고 만들었고(결과: 버팀), 앞으로 진화가 돌 때마다 이걸로 확인한다.
 *
 * 읽는 법: '앞' 은 후보를 고르는 데 쓴 구간, '떼어 둔 쪽' 은 고르는 동안 한 번도 안 본 구간.
 * 앞에서만 좋아지고 떼어 둔 쪽에서 나빠지는 후보가 **선택 편향**이다 — 진화의 문(HOLDOUT_MIN)이 그걸 막는다.
 */
import type { ScoredRow } from "../../src/lib/genesis/predict";
import type { PredictionGenome } from "../../src/lib/genesis/genome";

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { machineScoredRows } = await import("../../src/lib/genesis/machineScores");
const { genomeFor, scoreKeys } = await import("../../src/lib/genesis/predict");
const { candidatesFrom, describeGene } = await import("../../src/lib/genesis/genome");
const { MIN_DECIDED, MIN_IMPROVEMENT } = await import("../../src/lib/genesis/evolve");

const db = createServiceClient();
const name = process.argv.find((a) => !a.startsWith("-") && !a.includes("/") && !a.includes("\\") && a !== process.argv[0] && a !== process.argv[1]);
const { data: cos } = await db.from("companies").select("id, name");
const companies = ((cos ?? []) as { id: string; name: string | null }[]).filter((c) => !name || c.name === name);

// evolve.ts 와 **같은 셈**이어야 한다(다르면 자가 다른 것을 재는 것이다). 값이 바뀌면 여기도 같이 바꾼다.
const WARMUP_FOLDS = 3, HOLDOUT_SHARE = 0.25;
function backtest(rs: ScoredRow[], g: PredictionGenome, from?: number): number {
  const warmup = from ?? Math.ceil(rs.length / WARMUP_FOLDS);
  let s = 0, n = 0;
  for (let i = warmup; i < rs.length; i++) {
    const keys = rs[i].basis?.features ?? [];
    if (!keys.length) continue;
    const { pApproved } = scoreKeys(rs.slice(0, i).reverse(), g, keys);
    s += (pApproved - rs[i].approved) ** 2;
    n++;
  }
  return n > 0 ? s / n : 1;
}

let bad = 0;
for (const co of companies) {
  const rows = await machineScoredRows(db, co.id);
  if (rows.length < MIN_DECIDED) { console.log(`${co.name}: 기계 판정 ${rows.length}건 (<${MIN_DECIDED}) — 건너뜀`); continue; }
  const cut = Math.max(MIN_DECIDED, Math.floor(rows.length * (1 - HOLDOUT_SHARE)));
  const train = rows.slice(0, cut);
  const base = await genomeFor(db, co.id);
  const bT = backtest(train, base), bH = backtest(rows, base, cut);
  console.log(`\n== ${co.name} · 기계 판정 ${rows.length}건 (고르는 데 앞 ${cut} · 떼어 둔 뒤 ${rows.length - cut})`);
  console.log(`   지금 쓰는 유전자 ${JSON.stringify(base)}`);
  console.log(`   기준 브라이어: 앞 ${bT.toFixed(4)} · 떼어 둔 쪽 ${bH.toFixed(4)}\n`);
  const cands = candidatesFrom(base)
    .map((c) => ({ c, t: backtest(train, c.genome), h: backtest(rows, c.genome, cut) }))
    .sort((a, b) => a.t - b.t);
  console.log("   후보 (앞에서 잘한 순)                   앞 개선   떼어 둔 쪽 개선   판정");
  let trap = 0;
  for (const { c, t, h } of cands.slice(0, 8)) {
    const dT = bT - t, dH = bH - h;
    const verdict = dT < MIN_IMPROVEMENT ? "앞에서 부족" : dH < 0 ? "**선택 편향 — 막힘**" : "버팀";
    if (dT >= MIN_IMPROVEMENT && dH < 0) trap++;
    console.log(`   ${describeGene(c).padEnd(26)} ${(dT >= 0 ? "+" : "") + dT.toFixed(4)}    ${(dH >= 0 ? "+" : "") + dH.toFixed(4)}        ${verdict}`);
  }
  const top = cands[0];
  const pass = bT - top.t >= MIN_IMPROVEMENT && bH - top.h >= 0;
  console.log(`\n   → 앞에서 1등: ${describeGene(top.c)} · ${pass ? "떼어 둔 쪽에서도 버팀 → 채택 가능" : bT - top.t < MIN_IMPROVEMENT ? "개선이 문턱 미만 → 채택 안 함" : "떼어 둔 쪽에서 무너짐 → 채택 안 함"}`);
  console.log(`   → 이 문이 실제로 막은 후보: ${trap}개 (앞에서는 좋아 보였지만 떼어 둔 쪽에서 나빠짐)`);
  if (rows.length >= MIN_DECIDED && cands.length === 0) bad++;
}
console.log(bad ? `\n실패 ${bad}` : "\n끝");
process.exitCode = bad ? 1 : 0;
