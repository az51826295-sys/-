// 예산 문지기 자 시험 (200회차) — 고장을 심어 잡히는지. 모델 0, 돈 0.
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { planFor, startRun, stopRun, activeRun, blockedByUnattended, clearUnattendedQueue } = await import("../../src/lib/genesis/unattended");
const db = createServiceClient();
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

const before = await activeRun(db);
if (before && !before.run.stopped) { console.error("지금 도는 무인 판이 있다 — 시험을 안 한다"); process.exit(1); }

// 칸 실측 표기가 구조로 막히는가 (사장님 제약 1)
check("6시간 판은 칸 실측 아님", planFor(6).nodeMeasurement === false, planFor(6));
check("48시간 판도 칸 실측 아님", planFor(48).nodeMeasurement === false, planFor(48));
check("72시간 판만 칸 실측", planFor(72).nodeMeasurement === true, planFor(72));
check("상한이 시간에 비례", planFor(6).usdCap < planFor(48).usdCap, [planFor(6).usdCap, planFor(48).usdCap]);
check("첫 판들은 신뢰성만", planFor(6).tests === "신뢰성");

// 깃발이 실제로 로키를 막는가
const day = new Date(Date.now() + 9*3600_000).toISOString().slice(0,10);
await db.from("genesis_runs").delete().eq("kind","unattended").eq("run_date", day);
const opened = await startRun(db, planFor(6));
if (!opened.ok) { console.error("판을 못 열었다:", opened.why); process.exit(1); }
try {
  check("판이 도는 동안은 안 막힌다", (await blockedByUnattended(db)) === null, await blockedByUnattended(db));
  const a = (await activeRun(db))!;
  await stopRun(db, a.id, a.run, "시험: 하루 상한 도달");
  const why = await blockedByUnattended(db);
  check("멈추면 로키가 막힌다", typeof why === "string" && /멈춤/.test(why), why);
  check("막힌 이유가 전해진다", typeof why === "string" && /하루 상한/.test(why), why);
  // 시간이 다 된 판도 막혀야 한다
  await db.from("genesis_runs").update({ result: { ...planFor(6), startedAt: new Date(Date.now() - 7*3600_000).toISOString() } }).eq("id", a.id);
  // 201회차: 동작을 **일부러 바꿨다** — 판의 창이 끝나면 안 막는다(끝난 판이 사장님 일까지 막던 버그).
  // 옛 시험은 그 옛 동작을 적어 둔 것이라 같이 고친다. 이건 측정 기준이 아니라 동작 명세다.
  const why2 = await blockedByUnattended(db);
  check("시간이 다 되면 **안** 막는다(판이 끝난 것)", why2 === null, why2);
} finally {
  await db.from("genesis_runs").delete().eq("kind","unattended").eq("run_date", day);
  console.log("치움");
}
check("판이 없으면 평소대로 안 막힌다", (await blockedByUnattended(db)) === null);

// ── 생존 신호(꺼지면 멈춘다) 시험 — 사장님 09-20 ──────────────────
{
  const { planFor: pf, startRun: sr, activeRun: ar, blockedByUnattended: bu } = await import("../../src/lib/genesis/unattended");
  const day2 = new Date(Date.now() + 9*3600_000).toISOString().slice(0,10);
  await db.from("genesis_runs").delete().eq("kind","unattended").eq("run_date", day2);
  const o = await sr(db, pf(6));
  if (o.ok) {
    try {
      check("연 직후엔 신호가 신선해 안 막힌다", (await bu(db)) === null, await bu(db));
      const a2 = (await ar(db))!;
      // 신호를 10분 전으로 돌린다 = 문지기가 죽은 상황
      await db.from("genesis_runs").update({ result: { ...a2.run, heartbeat: new Date(Date.now() - 10*60_000).toISOString() } }).eq("id", a2.id);
      const w = (await bu(db)) ?? "";
      check("**문지기가 죽으면 로키가 멈춘다**", /생존 신호/.test(w), w);
      // 신호가 아예 없으면(옛 판) 도 막혀야 한다 — 기본이 거부
      await db.from("genesis_runs").update({ result: { ...a2.run, heartbeat: undefined } }).eq("id", a2.id);
      const w2 = (await bu(db)) ?? "";
      check("신호가 아예 없어도 막힌다(기본 거부)", /생존 신호/.test(w2), w2);
    } finally { await db.from("genesis_runs").delete().eq("kind","unattended").eq("run_date", day2); }
  } else check("신호 시험용 판 열기", false, o);
}
// ── 사장님 볼 산출물 셈이 고쳐졌나 — 실제 데이터로 ──────────────
{
  const since = new Date(Date.now() - 3*86400_000).toISOString();
  const { count: oldWay } = await db.from("deliverables").select("id",{count:"exact",head:true}).gte("created_at", since).is("content_json->>askJudge", null);
  const { count: newWay } = await db.from("deliverables").select("id",{count:"exact",head:true}).gte("created_at", since).is("content_json->>askJudge", null).is("content_json->>loop", null);
  check(`고리 통과한 판을 사람 몫에서 뺀다 (옛 셈 ${oldWay} → 새 셈 ${newWay})`, (newWay ?? 0) < (oldWay ?? 0), { oldWay, newWay });
}

// ── 판이 끝난 뒤엔 안 막아야 한다 (201회차 버그) ──────────────────
{
  const { planFor: pf3, blockedByUnattended: bu3 } = await import("../../src/lib/genesis/unattended");
  const day3 = new Date(Date.now() + 9*3600_000).toISOString().slice(0,10);
  await db.from("genesis_runs").delete().eq("kind","unattended").eq("run_date", day3);
  // 6시간 판이 7시간 전에 시작해서 이미 끝났고, 멈춤으로 적혀 있다
  const ended = { ...pf3(6), startedAt: new Date(Date.now() - 7*3600_000).toISOString(), stopped: true, stopReason: "계획한 시간이 다 됐다", heartbeat: new Date(Date.now() - 6*3600_000).toISOString() };
  const { data: ins } = await db.from("genesis_runs").insert({ kind: "unattended", run_date: day3, status: "done", result: ended }).select("id").single();
  try {
    check("**끝난 판은 로키를 안 막는다**", (await bu3(db)) === null, await bu3(db));
  } finally { if (ins?.id) await db.from("genesis_runs").delete().eq("id", ins.id as string); }
}
// ── **치우고 나서 창을 열어야 한다** (203회차 09-21).
// 상한에 1시간 만에 닿은 판이 계획한 6시간 내내 사장님까지 잠금면 안 되고,
// 그렇다고 남은 대기열을 둔 채 창을 열면 로키가 그걸 계속 집어 상한을 넘긴다.
{
  const CO = "00add05a-e81d-4e04-9980-34bb412a8780", DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83";
  const day4 = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  await db.from("genesis_runs").delete().eq("kind", "unattended").eq("run_date", day4);
  const op = await startRun(db, planFor(6));
  const made: string[] = [];
  try {
    if (!op.ok) throw new Error(op.why);
    for (const st of ["waiting", "waiting", "working"]) {
      const { data } = await db.from("assignments").insert({ company_id: CO, company_employee_id: DEV, title: `자 시험 ${st}`, description: "자 시험", status: st,
        role_input_json: { approved: true, unattended: true }, role_input_schema_id: "small_app_assignment_v1", priority: "normal" }).select("id").single();
      if (data) made.push(data.id as string);
    }
    const a = (await activeRun(db))!;
    // (가) **일부러 막아 둔다** — 안 치운 채 멈추면 창이 열리면 안 된다
    await stopRun(db, a.id, a.run, "자 시험: 상한 도달", false);
    check("**안 치우고 멈추면 창은 닫힌 채로**", typeof (await blockedByUnattended(db)) === "string", await blockedByUnattended(db));
    // (나) 치운다 — 안 시작한 것만, 돌고 있는 것은 그대로
    const r = await clearUnattendedQueue(db);
    check("안 시작한 것만 치운다", r.cancelled === 2 && r.left === 0, r);
    const { data: still } = await db.from("assignments").select("status").eq("id", made[2]).maybeSingle();
    check("**돌고 있는 일은 안 건드린다**", still?.status === "working", still);
    // (다) 치운 것이 확인됐을 때만 창이 열린다
    const a2 = (await activeRun(db))!;
    await stopRun(db, a2.id, a2.run, "자 시험: 상한 도달", true);
    check("**치우고 멈추면 평소 운영으로**", (await blockedByUnattended(db)) === null, await blockedByUnattended(db));
  } finally {
    if (made.length) await db.from("assignments").delete().in("id", made);
    await db.from("genesis_runs").delete().eq("kind", "unattended").eq("run_date", day4);
  }
}

console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
