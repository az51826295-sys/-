/**
 * 자를 의심하는 자 (124회차 09-15). 돈 0, 유니티 0, 아무것도 쓰지 않는다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ruler_audit.mts [--selftest]
 *
 * `--selftest`: 09-15 에 **사람이 손으로 찾은 세 가지**를 이 자가 스스로 찾는지 본다(고장 재현 칸).
 *   · 규격_조각_크기 떨어진 값이 전부 0.01 · 규격_조각_자리 문턱이 정답을 떨어뜨림 · head_count 6.295 가 통과도 실패도
 */
const { collectRulerStats, auditRulers } = await import("../../src/lib/genesis/rulerAudit");

if (process.argv.includes("--selftest")) {
  let bad = 0;
  const check = (n: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(got)); };
  const z = { oneSided: 0, both: 0 };
  const stats = new Map([
    // 09-15 실제 기록 그대로
    ["규격_조각_크기", { pass: [1.29, 1.28, 1.19], fail: [0.01, 0.01, 0.01, 0.01], passNoNum: 0, failNoNum: 0, ...z }],
    ["기대_head_count", { pass: [6.295], fail: [6.295, 6.296, 6.293], passNoNum: 0, failNoNum: 0, ...z }],
    ["씬이_열리고_예외가_없다", { pass: [], fail: [], passNoNum: 40, failNoNum: 0, ...z }],
    ["절대_못_넘는_줄", { pass: [], fail: [0.5, 0.6, 0.7, 0.8, 0.9], passNoNum: 0, failNoNum: 0, ...z }],
    ["멀쩡한_줄", { pass: [1.1, 1.2, 1.3], fail: [0.2], passNoNum: 0, failNoNum: 0, ...z }],
    // 131회차: 09-16 실제 기록 — 계획이 `3~∞` 로 적어 45번 재서 한 번도 안 떨어진 자
    ["기대_ground_color_count", { pass: [], fail: [], passNoNum: 45, failNoNum: 0, oneSided: 45, both: 0 }],
    // 반대편: 양쪽을 제대로 막은 자는 한쪽만 막힌 판이 몇 번 섞여도 표시하지 않는다
    ["기대_coin_count", { pass: [], fail: [], passNoNum: 18, failNoNum: 2, oneSided: 6, both: 14 }],
  ]);
  const flags = auditRulers(stats);
  for (const f of flags) console.log(`  [${f.kind}] ${f.check} — ${f.why}`);
  const has = (c: string, k: string) => flags.some((f) => f.check === c && f.kind === k);
  check("떨어진 값이 전부 0.01 인 자를 잡는다", has("규격_조각_크기", "한 값에 몰림"));
  check("같은 6.295 가 통과도 실패도 한 자를 잡는다", has("기대_head_count", "같은 값이 통과도 실패도"));
  check("한 번도 안 떨어진 자(이빨 없음)를 잡는다", has("씬이_열리고_예외가_없다", "한 번도 떨어진 적 없음"));
  check("한 번도 통과 못 한 자를 잡는다", has("절대_못_넘는_줄", "한 번도 통과 못 함"));
  check("한쪽만 막힌 자(`3~∞`)를 잡는다 — 130회차에 사람이 손으로 찾은 것", has("기대_ground_color_count", "한쪽만 막힌 자"));
  check("양쪽 막은 판이 더 많은 자는 반쪽이라 하지 않는다", !has("기대_coin_count", "한쪽만 막힌 자"), flags.filter((f) => f.check === "기대_coin_count"));
  check("멀쩡한 자는 안 건드린다", !flags.some((f) => f.check === "멀쩡한_줄"), flags.filter((f) => f.check === "멀쩡한_줄"));
  console.log(bad ? `\n실패 ${bad}` : "\n전부 통과");
  process.exitCode = bad ? 1 : 0;
} else {
  const { createServiceClient } = await import("../../src/lib/supabase/service");
  const db = createServiceClient();
  const { data: cos } = await db.from("companies").select("id, name");
  for (const co of (cos ?? []) as { id: string; name: string | null }[]) {
    const stats = await collectRulerStats(db, co.id);
    if (!stats.size) continue;
    const flags = auditRulers(stats);
    console.log(`\n== ${co.name} · 자 ${stats.size}개 · 수상한 것 ${flags.length}개`);
    for (const f of flags) console.log(`  [${f.kind}] ${f.check}\n      ${f.why}`);
    if (!flags.length) console.log("  (없음)");
  }
  console.log("\n표시만 한다 — 고치는 것은 사람이 본 뒤에. 자를 스스로 느슨하게 만들면 그건 자가 아니다.");
}
