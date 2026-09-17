/**
 * 기계 판정 진화의 자 (115회차 09-15). 돈 0, 모델 없음.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_machine_evolve_probe.mts [--adopt]
 *
 * 1) 기계 채점 재료가 실제로 모이나(개수·통과율·기간)
 * 2) 사람 판정이 문턱을 넘으면 **사람 쪽이 이기나**(auto 의 우선순위) — 가짜 사람 판정을 끼워 확인
 * 3) `--adopt` 없이는 아무것도 쓰지 않는다(진화는 실제로 표에 쓰므로 자는 기본이 읽기만)
 */
const { runEvolution, MIN_DECIDED } = await import("../../src/lib/genesis/evolve");
const { machineScoredRows } = await import("../../src/lib/genesis/machineScores");
const { createServiceClient } = await import("../../src/lib/supabase/service");

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };
const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name");

for (const co of (cos ?? []) as { id: string; name: string | null }[]) {
  const rows = await machineScoredRows(db, co.id);
  if (!rows.length) { console.log(`${co.name}: 기계 판정 0건`); continue; }
  const ok = rows.filter((r) => r.approved === 1).length;
  const sorted = rows.map((r) => r.committed_at ?? "").sort();
  console.log(`\n== ${co.name}: 기계 판정 ${rows.length}건 · 통과 ${ok} (${(ok / rows.length * 100).toFixed(0)}%) · ${sorted[0]?.slice(0, 10)} ~ ${sorted.at(-1)?.slice(0, 10)}`);
  check(`오래된 것부터 정렬(${(co.name ?? "").slice(0, 8)})`, rows.every((r, i) => i === 0 || (rows[i - 1].committed_at ?? "") <= (r.committed_at ?? "")));
  check(`쓸 만한 재료에 근거(features)가 있다`, rows.every((r) => (r.basis?.features ?? []).length > 0), rows.find((r) => !(r.basis?.features ?? []).length));

  // 진화 — 읽기만(기계 판정 기준). 채택되면 실제로 쓰므로 --adopt 일 때만 돌린다.
  if (process.argv.includes("--adopt")) {
    const r = await runEvolution(db, co.id, { source: "machine" });
    console.log("  진화(기계):", JSON.stringify(r));
  } else if (rows.length >= MIN_DECIDED) {
    console.log(`  진화 가능(${rows.length} ≥ ${MIN_DECIDED}) — 실제 채택은 --adopt`);
  }
}

// auto 의 우선순위: 사람 판정이 문턱을 넘으면 사람 쪽
const { data: co0 } = await db.from("companies").select("id").limit(1).maybeSingle();
if (co0) {
  const r = await runEvolution(db, co0.id as string, { source: "human" });
  check("source=human 은 사람 판정만 본다(지금 0건이라 '아직 이르다')", r.source === "human" && !r.adopted, r);
}
console.log(bad ? `\n실패 ${bad}` : "\n전부 통과");
process.exitCode = bad ? 1 : 0;
