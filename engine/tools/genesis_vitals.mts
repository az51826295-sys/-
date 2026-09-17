/**
 * **Genesis 가 살아 있는가 — 계기판 v0.1** (168회차 09-18). 돈 0, 모델 0. 읽기만 한다.
 *   npx tsx engine/tools/genesis_vitals.mts --selftest                      — 지어낸 네 생물로 계기판 자체를 잰다(고장 재현 포함)
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_vitals.mts    — 운영 기록으로 실제 값을 읽는다(회사마다)
 *
 * 공식은 `src/lib/genesis/vitals.ts` 에 숫자를 보기 전에 얼렸다: LP = 앞 창 평균 예측오차 − 최근 창 평균 예측오차(÷ 최근 창 비용),
 * Grounding = 바깥에서 채점된 예측 ÷ 커밋된 예측, 멈춤 = |LP| ≤ 0.02, 영역당 채점 8건부터 잰다.
 */
const { computeVitals, loadVitals } = await import("../../src/lib/genesis/vitals");
type Scored = Parameters<typeof computeVitals>[1][number];

if (process.argv.includes("--selftest")) {
  let bad = 0, seen = 0;
  const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
  const at = (i: number) => new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString();
  const mk = (skill: string, ps: number[], ys: number[], cost = 0.1): Scored[] => ps.map((p, i) => ({ skill, p, y: (ys[i] ? 1 : 0) as 0 | 1, at: at(i), source: "reality" as const, executionId: `e${i}`, costUsd: cost }));
  const hyp = { verified: 0, rejected: 0, pending: 0 };

  // ① 배우는 생물: 처음엔 0.7 을 외치다 틀리고, 뒤로 갈수록 맞는 확률을 말한다.
  const ys = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const learner = mk("a", [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.35, 0.35, 0.3, 0.3, 0.35, 0.3], ys);
  const v1 = computeVitals({ a: { n: 12, ps: learner.map((r) => r.p) } }, learner, hyp);
  check("배우는 생물 → 살아 있다, LP>0, $당 LP 가 나온다", v1.alive.verdict === "살아 있다" && v1.domains[0].lp!.delta > 0.02 && v1.domains[0].lp!.perUsd! > 0, v1.alive);

  // ② 고장 재현 — 상수를 외치는 생물(09-14 에 실제로 본 것: 예측이 전부 0.700). 오차가 우연히 줄어도 살아 있다고 하면 안 된다.
  const lucky = mk("a", Array(12).fill(0.7), [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  const v2 = computeVitals({ a: { n: 12, ps: Array(12).fill(0.7) } }, lucky, hyp);
  check("고장: 상수 예측은 운 좋게 오차가 줄어도 '멈춰 있다'", v2.alive.verdict === "멈춰 있다" && v2.distinctP === 1, v2.alive);

  // ②-b 첫 실측이 잡은 구멍: 회사 전체로는 확률값이 둘이지만(다른 영역 덕에) **이 영역은 상수**다. 세계가 좋아져서 오차가 준 것을 학습이라 하면 안 된다.
  const other = mk("b", [0.6, 0.7, 0.6, 0.7, 0.6, 0.7, 0.6, 0.7], [1, 0, 1, 0, 1, 0, 1, 0]);
  const v2b = computeVitals({ a: { n: 12, ps: Array(12).fill(0.7) }, b: { n: 8, ps: other.map((r) => r.p) } }, [...lucky, ...other], hyp);
  check("고장: 영역 하나가 상수인데 오차가 줄었다 → 그 영역은 '상수(예측 아님)', 회사는 '살아 있다' 아님", v2b.domains.find((d) => d.skill === "a")!.lp!.state === "상수(예측 아님)" && v2b.alive.verdict !== "살아 있다", v2b.alive);

  // ③ 고장 재현 — 굶는 생물: 예측은 100건인데 채점은 9건.
  const few = mk("a", [0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6], [1, 0, 1, 0, 1, 0, 1, 0, 1]);
  const v3 = computeVitals({ a: { n: 100, ps: [...few.map((r) => r.p), ...Array(91).fill(0.55)] } }, few, hyp);
  check("고장: 채점이 9%뿐이면 '굶고 있다'", v3.alive.verdict === "굶고 있다" && v3.grounding < 0.1, v3.alive);

  // ④ 나빠지는 생물.
  const worse = mk("a", [0.3, 0.3, 0.35, 0.3, 0.3, 0.35, 0.8, 0.8, 0.85, 0.8, 0.8, 0.85], ys);
  const v4 = computeVitals({ a: { n: 12, ps: worse.map((r) => r.p) } }, worse, hyp);
  check("나빠지는 생물 → '나빠지는 중', 살아 있다고 안 한다", v4.domains[0].lp!.state === "나빠지는 중" && v4.alive.verdict !== "살아 있다", v4.alive);

  // ⑤ 못 재는 것은 0 이 아니라 못 잼.
  const v5 = computeVitals({ a: { n: 5, ps: [0.5, 0.6, 0.5, 0.6, 0.5] } }, mk("a", [0.5, 0.6, 0.5], [1, 0, 1]), hyp);
  check("채점 3건 → '못 잰다'(LP 를 0 으로 적지 않는다)", v5.alive.verdict === "못 잰다" && v5.domains[0].lp === null, v5.alive);
  check("모순 해소율은 못 잼(null)이지 0 이 아니다", v1.contradictions === null);
  check("보정표: 0.7 이라 말한 것들의 실제 비율이 나온다", v2.calibration.length === 1 && v2.calibration[0].said === 0.7 && v2.calibration[0].got === 0.5, v2.calibration);

  console.log(`\n본 줄 ${seen} · 어긋남 ${bad}`);
  process.exit(bad === 0 ? 0 : 1);
}

const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: cos } = await db.from("work_predictions").select("company_id").limit(5000);
const ids = [...new Set(((cos ?? []) as { company_id: string }[]).map((c) => c.company_id))];
console.log(`예측을 가진 회사 ${ids.length}곳\n`);
for (const id of ids) {
  const v = await loadVitals(db, id);
  if (v.committed < 5) continue;
  console.log(`━━ 회사 ${id.slice(0, 8)} ━━  **${v.alive.verdict}** — ${v.alive.why}`);
  console.log(`   예측 ${v.committed} · 바깥 채점 ${v.scored} (Grounding ${Math.round(v.grounding * 100)}%) = 누른 판정 ${v.bySource.human} · 행동에서 읽은 판정 ${v.bySource.implicit} · 현실(유니티) ${v.bySource.reality} · 기계 판정 ${v.bySource.machine}`);
  console.log(`   Brier ${v.brier ?? "못 잼"} · 서로 다른 확률값 ${v.distinctP}가지`);
  for (const b of v.calibration) console.log(`     "${b.bucket}" 라고 말한 ${b.n}건: 말한 평균 ${b.said} → 실제 ${b.got}`);
  for (const d of v.domains) {
    const lp = d.lp ? `LP ${d.lp.delta > 0 ? "+" : ""}${d.lp.delta} (오차 ${d.lp.prevErr}→${d.lp.recentErr}) · 최근 창 $${d.lp.costUsd}${d.lp.perUsd !== null ? ` · $1당 ${d.lp.perUsd}` : ""} · ${d.lp.state}` : `LP 못 잼(채점 ${d.scored}건)`;
    const se = d.secondEncounter ? ` · 2회차 우위 ${d.secondEncounter.delta > 0 ? "+" : ""}${d.secondEncounter.delta} (성공률 ${d.secondEncounter.prevRate}→${d.secondEncounter.recentRate})` : "";
    console.log(`   · ${d.skill}: 예측 ${d.committed} · 채점 ${d.scored} · 확률값 ${d.distinctP}가지 · ${lp}${se}`);
  }
  console.log(`   원인 가설(규칙): 낸 것 ${v.hypotheses.proposed} · 블라인드 통과 ${v.hypotheses.verified} · 떨어짐 ${v.hypotheses.rejected}${v.hypotheses.rate !== null ? ` · 통과율 ${Math.round(v.hypotheses.rate * 100)}%` : ""}`);
  console.log(`   모순 해소율: 못 잼(모순을 적는 곳이 없다)\n`);
}
