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
const { planFor, activeRun, startRun, stopRun, noteSeen, clearUnattendedQueue, budgetBoundary } = await import("../../src/lib/genesis/unattended");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
// 무인 판이 도는 회사(데모). 사장님 대화를 안 채우려고 여기서 돌린다 — 한도도 이 회사 것을 본다.
const CO = "00add05a-e81d-4e04-9980-34bb412a8780";
const hm = () => new Date().toLocaleTimeString("ko-KR", { hour12: false });

if (arg("--open")) {
  const hours = Number(arg("--open"));
  if (!(hours > 0)) { console.error("시간을 숫자로"); process.exit(2); }
  const cur = await activeRun(db);
  if (cur && !cur.run.stopped) { console.error(`이미 도는 판이 있다(${cur.run.hours}시간, ${cur.run.startedAt})`); process.exit(1); }
  // **잠그긴 상한을 그대로 쓴다** (203회차 09-21). `planFor(6)` 은 $1.25 를 내는데
  // 무인 판 2 의 잠근 조건은 $2.00 이다. 안 맞추면 도구가 잠근 문서를 조용히 어긴다.
  const capArg = arg("--cap");
  const run = planFor(hours, capArg ? { usdCap: Number(capArg) } : undefined);
  // **여는 시점에 두 한도를 견준다** (204회차 09-21). 무인 판 2는 문지기 상한에 닿기도 전에
  // 회사 30일 한도가 차서 끝났다. 두 예산이 서로를 모르면 늘 작은 쪽이 이긴다.
  const b = await budgetBoundary(db, CO);
  const smaller = Math.min(run.usdCap, Math.max(0, b.left));
  console.log(`한도 둘: 문지기 $${run.usdCap.toFixed(2)} · 회사 ${b.windowDays}일 $${b.limitUsd.toFixed(2)} 중 남은 것 $${b.left.toFixed(3)}(쓴 것 $${b.used.toFixed(3)})`);
  console.log(`→ **작은 쪽은 $${smaller.toFixed(3)}** ${b.left < run.usdCap ? "— 회사 한도가 먼저 닿는다" : "— 문지기 상한이 먼저 닿는다"}`);
  if (b.left <= 0) {
    console.error(`**안 열었다** — 회사 ${b.windowDays}일 한도가 이미 찼다($${b.used.toFixed(3)}/$${b.limitUsd.toFixed(2)}). 열어도 첫 판부터 튀긴다.`);
    console.error(`진행하려면 회사 한도를 올리거나, 다른 회사에서 돌리거나, 한도가 리셋될 때까지 기다려야 한다(돈 문제라 사장님 몴).`);
    process.exit(1);
  }
  if (b.left < run.usdCap) run.usdCap = Math.round(b.left * 100) / 100; // 작은 쪽으로 연다 — 문지기가 못 재는 벍에 부딪히지 않게

  run.criteriaLock = arg("--lock") ?? "없음"; // 잠근 조건 문서의 해시. 판정을 어느 규칙으로 할지가 여기서 정해진다.
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
  // ── 진행 없음 감시 (201회차) ──────────────────────────────────
  // **할 일이 있는데** 아무 진행이 없으면 막힌 것이다. 할 일이 없으면 조용한 게 정상이라 안 센다.
  // 진행의 정의: 모델 호출이 있었거나, 실행 행이 움직였거나(시작·끝·심장박동).
  const { count: liveEx } = await db.from("work_executions").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]);
  const { count: liveAs } = await db.from("assignments").select("id", { count: "exact", head: true }).in("status", ["waiting", "assigned", "queued", "working"]);
  // **묶인 자원도 센다** (사장님: "한 자원이 오래 묶여 있거나 ... 아무 진행이 없으면"). 이것 없이는 Vid 의 38시간 같은
  // 경우 — 할 일은 없는데 직원만 묶여 있는 상태 — 가 영영 안 잡힌다. 자 시험이 이 구멍을 짚었다(201회차).
  const { count: held } = await db.from("company_employees").select("id", { count: "exact", head: true }).neq("work_status", "ready");
  const hasWork = (liveEx ?? 0) + (liveAs ?? 0) + (held ?? 0) > 0;
  const { data: lastU } = await db.from("model_usage").select("created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: lastE } = await db.from("work_executions").select("updated_at").gte("created_at", since).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const marks = [lastU?.created_at, lastE?.updated_at, run.startedAt].filter(Boolean).map((t) => Date.parse(t as string));
  const lastProgress = Math.max(...marks);
  const stallMin = Math.round((Date.now() - lastProgress) / 60000);

  // 사장님이 봐야 할 산출물 = **기계가 판정 못 한 것**(사장님 09-20: "'검증된 산출물' 은 심판이 기계로 판정한 것만 세야").
  // 내 첫 설계는 askJudge(고치는 판 전용)만 봐서 **처음 만드는 판을 전부 '사람이 봐야 할 것' 으로 셌다** — 상한 3개가 첫 세 판에 차 버린다.
  // 고리 심판(content_json.loop)도 기계 판정이다. 둘 다 없는 것만 사람 몫이다.
  const { count: needHuman } = await db.from("deliverables").select("id", { count: "exact", head: true })
    .gte("created_at", since).is("content_json->>askJudge", null).is("content_json->>loop", null);
  const endsAt = new Date(new Date(run.startedAt).getTime() + run.hours * 3600_000);
  const left = Math.max(0, Math.round((endsAt.getTime() - Date.now()) / 60000));
  // **붙이기 지연** (202회차, 사장님 09-21): 붙이는 틱이 멈추면 판은 계속 도는데 결과만 안 붙는다.
  // 그 상태는 아무 깃발도 안 꽂히고 사장님은 산출물이 없는 줄 안다 — 그래서 그물이 보는 값에 넣는다.
  const { data: uAsg } = await db.from("assignments").select("id").eq("role_input_json->>unattended", "true").limit(200);
  const uIds = (uAsg ?? []).map((x) => x.id as string);
  let unposted = 0;
  if (uIds.length) {
    const { data: uD } = await db.from("deliverables").select("id").in("assignment_id", uIds).gte("created_at", since);
    const { data: uP } = await db.from("conversation_messages").select("did:attachments->unattended->>deliverableId").not("attachments->unattended", "is", null).limit(500);
    const postedSet = new Set(((uP ?? []) as unknown as { did: string | null }[]).map((x) => x.did).filter(Boolean));
    unposted = (uD ?? []).filter((x) => !postedSet.has(x.id as string)).length;
  }

  // 누적은 **지난 바퀴까지**의 값이다(이번 분은 아래 noteSeen 에서 더해진다).
  const tl = run.tally ?? { minutes: 0, workMinutes: 0 };
  console.log(`${hm()} 무인 ${run.hours}h · 남은 ${Math.floor(left / 60)}시간 ${left % 60}분 · $${usd.toFixed(3)}/${run.usdCap} (오늘 $${usdToday.toFixed(3)}/${run.usdPerDayCap}) · 같은 실패 연속 ${failStreak}${lastCode ? `(${lastCode})` : ""} · 사장님 볼 것 ${needHuman ?? 0}/${run.humanReviewCap} · 부하 ${tl.workMinutes}/${tl.minutes}분(${tl.minutes ? Math.round((tl.workMinutes / tl.minutes) * 100) : 0}%) · ${hasWork ? `할 일 ${(liveEx ?? 0) + (liveAs ?? 0)}개·묶인 직원 ${held ?? 0}명·진행없음 ${stallMin}/${run.stallMinutes ?? 30}분` : "할 일 없음"}${unposted ? ` · **못 붙인 결과 ${unposted}개**` : ""}${run.stopped ? ` · **멈춤: ${run.stopReason}**` : ""}`);
  // 그물이 본 것도 신호에 얹는다 — 그물이 던지면 이 줄까지 못 와서 신호가 낡고, 로키가 5분 뒤 스스로 멈춘다(사장님 09-21).
  const seen = { at: new Date().toISOString(), usd, usdToday, failStreak, needHuman: needHuman ?? 0, hasWork, stallMin, unposted };
  if (run.stopped) return null;
  let reason: string | null = null;
  if (usd >= run.usdCap) reason = `전체 상한 $${run.usdCap} 도달($${usd.toFixed(3)})`;
  else if (usdToday >= run.usdPerDayCap) reason = `하루 상한 $${run.usdPerDayCap} 도달($${usdToday.toFixed(3)})`;
  else if (failStreak >= run.maxSameFailStreak) reason = `같은 실패 ${failStreak}번 연속(${lastCode}) — 고장에 돈을 태우고 있다`;
  else if ((needHuman ?? 0) >= run.humanReviewCap) reason = `사장님이 볼 산출물 ${needHuman}개 — 상한 ${run.humanReviewCap}. 더 쌓으면 검토가 일요일 밤을 다 먹는다`;
  else if (hasWork && stallMin >= (run.stallMinutes ?? 30)) reason = `**진행 없음 ${stallMin}분** — 할 일 ${(liveEx ?? 0) + (liveAs ?? 0)}개·묶인 직원 ${held ?? 0}명 인데 아무것도 안 움직인다(막혔다)`;
  else if (Date.now() > endsAt.getTime()) reason = "계획한 시간이 다 됐다";
  if (reason) {
    // **먼저 치우고, 그다음에 창을 연다** (203회차 09-21). 판이 멈췄는데 깃발이 계획한 6시간 내내 살아 있으면
    // 상한에 1시간 만에 닿은 판이 사장님의 남은 5시간까지 잠근다. 그렇다고 그냥 열면 남은 대기열을 계속 집어 상한을 넘긴다.
    // 그래서 순서가 있다: 안 시작한 무인 일을 치운다 → **남은 게 0인지 확인한다** → 그때만 창을 연다.
    const { cancelled, left } = await clearUnattendedQueue(db);
    const close = left === 0;
    await stopRun(db, id, run, reason, close);
    console.log(`  → **멈춤**: ${reason}`);
    const fin = (await activeRun(db))?.run.tally;
    if (fin) console.log(`  → 부하 ${fin.workMinutes}/${fin.minutes}분 = ${Math.round((fin.workMinutes / Math.max(1, fin.minutes)) * 100)}% (분모는 문지기가 본 분 수) · 못 붙인 결과 최대 ${fin.maxUnposted}개 · 진행없음 최대 ${fin.maxStall}분`);
    console.log(`  → 남은 대기열 ${cancelled}개 치움 · ${close ? "창을 열었다 — 로키는 평소 운영으로 돌아간다" : `**창은 닫은 채로 둔다** — 안 치워진 무인 일이 ${left}개 남았다`}`);
    return null;
  }
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
