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
  // 226회차 09-28: **재료가 언제 것인지 말하지 않고 있었다.** 이 자가 "수상한 것 18개" 를 내놓았고
  // 나는 그것을 지금 상태로 읽었는데, 재료인 유니티 검사 기록은 **09-05~09-09 에서 끝나** 18일 전
  // 것이었다. 죽은 시스템에 대한 경고를 지금 경고로 읽으면 엉뚱한 곳을 고친다.
  // 오늘 여덟 번째 같은 모양이다 — 자는 **자기가 무엇을 언제 봤는지** 같이 적어야 한다.
  const 창 = await (async () => {
    const q = () => db.from("conversation_messages").select("created_at").not("attachments->unityChecks", "is", null);
    const [{ data: 오래 }, { data: 최근 }] = await Promise.all([
      q().order("created_at", { ascending: true }).limit(1),
      q().order("created_at", { ascending: false }).limit(1),
    ]);
    const a = (오래 as { created_at: string }[] | null)?.[0]?.created_at ?? null;
    const b = (최근 as { created_at: string }[] | null)?.[0]?.created_at ?? null;
    return { 처음: a, 끝: b, 며칠전: b ? (Date.now() - new Date(b).getTime()) / 86400_000 : null };
  })();
  console.log(
    창.처음
      ? `재료: 유니티 검사 기록 ${창.처음.slice(0, 10)} ~ ${창.끝!.slice(0, 10)} (최근 것이 ${창.며칠전!.toFixed(1)}일 전)`
      : "재료: 유니티 검사 기록이 없다 — 이 자는 지금 아무것도 못 잰다",
  );
  if ((창.며칠전 ?? 0) > 3) {
    console.log(
      `  ! **이 재료는 ${창.며칠전!.toFixed(0)}일 전에 멈췄다.** 아래 목록은 그때의 자에 대한 것이고,\n` +
        "    지금 도는 판에 대한 경고가 아니다. 고치기 전에 그 자가 아직 쓰이는지 먼저 본다.",
    );
  }

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
