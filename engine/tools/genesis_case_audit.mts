/** 학습 재료 감사 (103회차 09-14). 규칙 고리가 "실패" 로 세는 사례를 사람이 읽을 수 있게 뽑는다. 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_case_audit.mts */
const { collectCases } = await import("../../src/lib/genesis/cases");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name");
for (const co of (cos ?? []) as { id: string; name: string | null }[]) {
  const cases = await collectCases(db, co.id);
  const bad = cases.filter((c) => c.bad);
  if (!bad.length) continue;
  console.log(`== ${co.name}: 실패 ${bad.length} / 전체 ${cases.length}`);
  for (const c of bad) {
    console.log(`\n[${c.source}] ${c.at.slice(0, 16)}\n  요청: ${c.task.slice(0, 140)}\n  답: ${c.output.slice(0, 160)}\n  왜 실패: ${c.note.slice(0, 200)}`);
  }
}
