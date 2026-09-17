/**
 * **예측기에 밥을 주면 정말 더 잘 맞히는가** (168회차 09-18). 돈 0, 모델 0. 읽기만 한다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_feed_probe.mts
 *
 * 계기판 첫 판독: 50일 동안 예측이 0.700 상수였다. 운영 예측기(`estimateApproval`)가 **사람 판정**만 읽는데 그게 2건이라서다.
 * 현실(유니티)·기계 판정 100여 건은 진화가 유전자를 고르는 데만 쓰이고 예측기에는 안 들어갔다.
 *
 * **얼린 기대(돌리기 전에 적음)**: 시간순으로 걸으며 "그때까지의 판정만 보고" 예측했을 때의 Brier 가,
 * 같은 행들에 0.7 을 외쳤을 때의 Brier 보다 **0.01 이상 작아야**(`evolve.ts` 의 MIN_IMPROVEMENT 와 같은 문턱) 밥을 잇는다.
 * 아니면 잇지 않는다 — 밥을 줘도 더 못 맞히면 문제는 밥이 아니라 예측기다.
 * 앞 1/5 은 역사가 얕아 시험하지 않는다(진화의 뒷걸음 시험과 같은 규칙).
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { machineScoredRows } = await import("../../src/lib/genesis/machineScores");
const { scoreKeys, genomeFor } = await import("../../src/lib/genesis/predict");
const { BASE_GENOME } = await import("../../src/lib/genesis/genome");

const db = createServiceClient();
const { data: cos } = await db.from("work_predictions").select("company_id").limit(5000);
const ids = [...new Set(((cos ?? []) as { company_id: string }[]).map((c) => c.company_id))];
let verdictAll = true, tested = 0;
for (const id of ids) {
  const rows = await machineScoredRows(db, id); // 오래된 것부터
  if (rows.length < 20) { console.log(`회사 ${id.slice(0, 8)}: 판정 ${rows.length}건 — 시험하기에 적다`); continue; }
  tested++;
  const genome = await genomeFor(db, id);
  const warm = Math.ceil(rows.length / 5);
  const run = (g: typeof genome) => {
    let fed = 0, flat = 0, n = 0; const ps: number[] = [];
    const bySkill = new Map<string, { fed: number; flat: number; n: number }>();
    for (let i = warm; i < rows.length; i++) {
      const keys = rows[i].basis?.features ?? []; if (!keys.length) continue;
      const p = scoreKeys(rows.slice(0, i).reverse(), g, keys).pApproved;
      const y = rows[i].approved; ps.push(p);
      const a = (p - y) ** 2, b = (0.7 - y) ** 2; fed += a; flat += b; n++;
      const s = bySkill.get(rows[i].skill_id) ?? { fed: 0, flat: 0, n: 0 }; s.fed += a; s.flat += b; s.n++; bySkill.set(rows[i].skill_id, s);
    }
    return { fed: fed / n, flat: flat / n, n, ps, bySkill };
  };
  const r = run(genome), rb = run({ ...BASE_GENOME });
  const ok = r.flat - r.fed >= 0.01;
  if (!ok) verdictAll = false;
  console.log(`회사 ${id.slice(0, 8)} · 판정 ${rows.length}건 중 뒤 ${r.n}건으로 시험`);
  console.log(`   0.7 상수의 Brier ${r.flat.toFixed(4)} → 밥을 준 예측기 ${r.fed.toFixed(4)} (지금 유전자) / ${rb.fed.toFixed(4)} (출발 유전자)  ⇒ ${ok ? "맞음 — 더 잘 맞힌다" : "어긋남 — 더 못 맞힌다"} (차 ${(r.flat - r.fed).toFixed(4)})`);
  console.log(`   말한 확률의 범위 ${Math.min(...r.ps).toFixed(2)} ~ ${Math.max(...r.ps).toFixed(2)} · 서로 다른 값 ${new Set(r.ps.map((p) => p.toFixed(2))).size}가지`);
  for (const [skill, s] of r.bySkill) console.log(`   · ${skill}: ${s.n}건 · 상수 ${(s.flat / s.n).toFixed(3)} → 먹인 것 ${(s.fed / s.n).toFixed(3)}`);
}
console.log(tested ? (verdictAll ? "\n얼린 기대를 넘었다 — 예측기에 현실·기계 판정을 잇는다." : "\n얼린 기대를 못 넘은 회사가 있다 — 잇지 않는다.") : "\n시험할 회사가 없다.");
process.exit(tested && verdictAll ? 0 : 1);
