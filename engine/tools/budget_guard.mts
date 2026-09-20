/**
 * **예산 문지기 — 로키 바깥** (200회차 09-20). 사장님: "로키가 자기 지출을 세면, 로키가 죽거나 꼬일 때 문지기도 같이 죽어요."
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/budget_guard.mts --open 6          — 6시간 무인 판을 연다(신뢰성만)
 *   npx tsx engine/tools/rookery_env.mts engine/tools/budget_guard.mts --watch           — 지킨다(1분마다). 이 창을 켜 둔 동안만 지킨다
 *   npx tsx engine/tools/rookery_env.mts engine/tools/budget_guard.mts                   — 지금 상태만 본다
 *   npx tsx engine/tools/rookery_env.mts engine/tools/budget_guard.mts --stop "이유"      — 손으로 멈춘다
 *
 * 이 프로세스는 **세고 정한다**. 로키는 깃발에 복종만 한다(src/lib/genesis/unattended.ts).
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { planFor, activeRun, startRun, stopRun, noteSeen } = await import("../../src/lib/genesis/unattended");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const hm = () => new Date().toLocaleTimeString("ko-KR", { hour12: false });

if (arg("--open")) {
  const hours = Number(arg("--open"));
  if (!(hours > 0)) { console.error("시간을 숫자로"); process.exit(2); }
  const cur = await activeRun(db);
  if (cur && !cur.run.stopped) { console.error(`이미 도는 판이 있다(${cur.run.hours}시간, ${cur.run.startedAt})`); process.exit(1); }
  const run = planFor(hours);
  const r = await startRun(db, run);
  if (!r.ok) { console.error("못 열었다:", r.why); process.exit(1); }
  console.log(`무인 판 열림 — ${hours}시간 · 전체 상한 $${run.usdCap} · 하루 $${run.usdPerDayCap} · 같은 실패 ${run.maxSameFailStreak}번이면 정지 · 사장님 볼 것 ${run.humanReviewCap}개 상한`);
  console.log(`**칸 실측 ${run.nodeMeasurement ? "맞음" : "아님"}** (72시간 미만은 agent-days 칸의 실측이 아니다)`);
  console.log(`지키려면: npx tsx engine/tools/rookery_env.mts engine/tools/budget_guard.mts --watch`);
  process.exit(0);
}

async function look() {
  const a = await activeRun(db);
  if (!a) { console.log(`${hm()} 도는 무인 판 없음`); return null; }
  const { id, run } = a;
  const since = run.startedAt;
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const { data: u } = await db.from("model_usage").select("cost_usd, created_at").gte("created_at", since);
  const usd = (u ?? []).reduce((n, x) => n + Number(x.cost_usd ?? 0), 0);
  const usdToday = (u ?? []).filter((x) => (x.created_at as string) >= dayAgo).reduce((n, x) => n + Number(x.cost_usd ?? 0), 0);
  // 같은 실패가 연속으로 몇 번인가
  const { data: ex } = await db.from("work_executions").select("status, error_code, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20);
  let failStreak = 0, lastCode: string | null = null;
  for (const e of ex ?? []) {
    if (e.status !== "failed") break;
    if (lastCode === null) lastCode = (e.error_code as string) ?? "?";
    else if (lastCode !== ((e.error_code as string) ?? "?")) break;
    failStreak++;
  }
  // 사장님이 봐야 할 산출물 = **기계가 판정 못 한 것**(사장님 09-20: "'검증된 산출물' 은 심판이 기계로 판정한 것만 세야").
  // 내 첫 설계는 askJudge(고치는 판 전용)만 봐서 **처음 만드는 판을 전부 '사람이 봐야 할 것' 으로 셌다** — 상한 3개가 첫 세 판에 차 버린다.
  // 고리 심판(content_json.loop)도 기계 판정이다. 둘 다 없는 것만 사람 몫이다.
  const { count: needHuman } = await db.from("deliverables").select("id", { count: "exact", head: true })
    .gte("created_at", since).is("content_json->askJudge", null).is("content_json->loop", null);
  const endsAt = new Date(new Date(run.startedAt).getTime() + run.hours * 3600_000);
  const left = Math.max(0, Math.round((endsAt.getTime() - Date.now()) / 60000));
  console.log(`${hm()} 무인 ${run.hours}h · 남은 ${Math.floor(left / 60)}시간 ${left % 60}분 · $${usd.toFixed(3)}/${run.usdCap} (오늘 $${usdToday.toFixed(3)}/${run.usdPerDayCap}) · 같은 실패 연속 ${failStreak}${lastCode ? `(${lastCode})` : ""} · 사장님 볼 것 ${needHuman ?? 0}/${run.humanReviewCap}${run.stopped ? ` · **멈춤: ${run.stopReason}**` : ""}`);
  const seen = { at: new Date().toISOString(), usd, usdToday, failStreak, needHuman: needHuman ?? 0 };
  if (run.stopped) return null;
  let reason: string | null = null;
  if (usd >= run.usdCap) reason = `전체 상한 $${run.usdCap} 도달($${usd.toFixed(3)})`;
  else if (usdToday >= run.usdPerDayCap) reason = `하루 상한 $${run.usdPerDayCap} 도달($${usdToday.toFixed(3)})`;
  else if (failStreak >= run.maxSameFailStreak) reason = `같은 실패 ${failStreak}번 연속(${lastCode}) — 고장에 돈을 태우고 있다`;
  else if ((needHuman ?? 0) >= run.humanReviewCap) reason = `사장님이 볼 산출물 ${needHuman}개 — 상한 ${run.humanReviewCap}. 더 쌓으면 검토가 일요일 밤을 다 먹는다`;
  else if (Date.now() > endsAt.getTime()) reason = "계획한 시간이 다 됐다";
  if (reason) { await stopRun(db, id, run, reason); console.log(`  → **멈춤**: ${reason}`); return null; }
  await noteSeen(db, id, run, seen);
  return run;
}

if (arg("--stop")) {
  const a = await activeRun(db);
  if (!a) { console.log("도는 판 없음"); process.exit(0); }
  await stopRun(db, a.id, a.run, `손으로 멈춤: ${arg("--stop")}`);
  console.log("멈췄다"); process.exit(0);
}
if (!process.argv.includes("--watch")) { await look(); process.exit(0); }
console.log("문지기 시작 — 이 창을 닫으면 안 지킨다. 1분마다 본다.");
for (;;) { try { if (!(await look())) break; } catch (e) { console.error("문지기 오류:", e instanceof Error ? e.message : e); } await new Promise((r) => setTimeout(r, 60_000)); }
console.log("문지기 끝");
