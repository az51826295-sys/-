// 실행 워커 — 계획 2 "안 죽는 실행" (2026-09-06).
//
// 웹은 접수만 하고(ROOKERY_WORKER=1), 여기가 일한다:
//   1. queued 실행을 집어 돌린다(직원마다 하나씩, 오래된 것부터).
//   2. running 인데 4분 넘게 소식 없는 실행 = 주인이 죽은 것 → 다시 돌린다. 저장된 단계
//      (`work_executions.metrics_json.steps`)가 있으니 비싼 값(계획·코드·그림·메시)은 다시 안 산다.
//   3. 워커 자신이 죽어도 다음 워커가 2 로 잇는다. 배포는 일을 안 죽인다.
//
// 실행: ROOKERY_ROLE=worker (scripts/start.mjs) 또는 npx tsx src/worker/worker.mts
import fs from "node:fs";

const NL = String.fromCharCode(10), CR = String.fromCharCode(13);
if (fs.existsSync(".env.local")) {
  for (const raw of fs.readFileSync(".env.local", "utf8").split(NL)) {
    const l = raw.replace(CR, ""); const i = l.indexOf("=");
    if (i < 0 || l.startsWith("#")) continue;
    const k = l.slice(0, i).trim(); if (!(k in process.env)) process.env[k] = l.slice(i + 1).trim();
  }
}

const [{ createServiceClient }, { executeEmployeeAssignment }, { defaultProviders }, { collectWorkReturns }] = await Promise.all([
  import("@/lib/supabase/service"), import("@/lib/execution/engine"), import("@/lib/execution/shared"), import("@/lib/chat/workReturns"),
]);

const db = createServiceClient();
const TICK_MS = 15_000;
// 43회차: 4분은 너무 짧다. 3D 한 판은 메시 생성만 몇 분을 기다리는데 그 사이 아무것도 안 쓴다 —
// 살아 있는 실행을 '죽었다' 고 보고 같은 것을 또 돌릴 뻔했다. `heartbeat()` 는 만들어 놓고 아무도 안 부른다(호출 0).
// 부르는 자리를 제대로 놓기 전까지는 시간을 늘려 둔다.
const DEAD_MS = 20 * 60_000;
const busy = new Set<string>(); // company_employee_id — 한 사람은 한 번에 하나
const stamp = () => new Date().toISOString().slice(11, 19);
console.log(`${stamp()} 워커 시작 (tick ${TICK_MS / 1000}s, 죽음 판정 ${DEAD_MS / 60_000}분)`);

async function runOne(id: string, employee: string, why: string) {
  busy.add(employee);
  console.log(`${stamp()} ▶ ${id.slice(0, 8)} (${why})`);
  try {
    const r = await executeEmployeeAssignment(id, defaultProviders(), db);
    console.log(`${stamp()} ■ ${id.slice(0, 8)} ${r.ok ? "완료 " + r.deliverableId?.slice(0, 8) : "실패 " + r.code}`);
  } catch (e) {
    console.error(`${stamp()} ✗ ${id.slice(0, 8)}`, e instanceof Error ? e.message : e);
  } finally {
    busy.delete(employee);
  }
}


// ── 57회차: **끝난 일을 대화로 돌려놓는 것도 워커가 한다.**
// 여태 이 일은 화면(`/api/conversations/:id/work`)이 폴링할 때만 돌았다. 그래서 사장님이
// 창을 안 열어 두면: 결과 턴이 안 붙고 → 그 판이 "현재 판"이 아니고 → 유니티가 새 판을
// 못 보고 → 검사가 안 돌고 → 다음 일이 안 풀린다. 09-08 에 판 셋(16:23·16:27·16:39)이
// 그렇게 멈춰 있었다. 사람이 보고 있어야만 회사가 돈다면 그것은 자동이 아니다.
// 화면이 열려 있어도 같은 함수가 돌지만, 이미 붙은 것은 다시 안 붙는다(붙은 표시를 보고 거른다).
/**
 * **대화에 안 붙은 일을 쓸어 준다** (201회차 09-21). 사장님: *"대화에 안 붙은 일이 또 어디서 사람 손을 기다리는지 훑어보는 게 좋겠어요."*
 *
 * 연장통·무인 판이 만든 업무는 대화 턴이 없다. 그러면 `collectWorkReturns` 가 못 찾고 → `releaseEmployee` 가 영영 안 불리고
 * → 그 직원이 영영 묶인다. 09-20 무인 판이 과제 8개 중 1개만 한 이유이고, Vid 는 09-19 부터 38시간 묶여 있었다.
 *
 * **대화에 붙은 일은 손대지 않는다** — 그건 결과를 먼저 붙이고 나서 풀어야 한다(안 그러면 사장님이 결과를 영영 못 본다).
 * 여기서 푸는 것은 **아무도 기다리지 않는 일**뿐이다.
 */
async function sweepTick() {
  const { releaseEmployee } = await import("@/lib/assignments/service");
  const { data: stuckA } = await db.from("assignments").select("id, title, company_employee_id").in("status", ["submitted", "failed"]).limit(50);
  for (const a of stuckA ?? []) {
    const { data: m } = await db.from("conversation_messages").select("id").eq("attachments->assignment->>id", a.id as string).limit(1).maybeSingle();
    if (m) continue; // 대화에 붙은 일 — 결과 붙이기가 맡는다
    const r = await releaseEmployee(db, a.company_employee_id as string, a.id as string);
    if (r.released.length) console.log(`${stamp()} [쓸기] 대화에 안 붙은 일을 풀었다: ${String(a.title).slice(0, 28)}${r.started ? ` → 다음 일 시작 ${r.started.slice(0, 8)}` : ""}`);
  }
  // **업무가 아예 안 붙은 채 묶인 직원** (203회차 09-21). 09-20 밤 대기열 8개를 다 비운 뒤
  // Dev 가 `working` 인 채 15시간 남아 있었다 — `current_assignment_id` 는 비어 있었다.
  // 위 쒸기는 **일에서 직원을 찾아가므로** 일이 아예 없는 이 모양을 못 본다.
  // 그대로 무인 판을 열었으면 1회차처럼 아무것도 안 돌았다.
  const { data: orphan } = await db.from("company_employees").select("id").neq("work_status", "ready").is("current_assignment_id", null).limit(20);
  for (const e of orphan ?? []) {
    // 돌고 있는 실행이 하나라도 있으면 건드리지 않는다(실험을 끄지 않는다).
    const { count: live } = await db.from("work_executions").select("id", { count: "exact", head: true })
      .eq("company_employee_id", e.id as string).in("status", ["queued", "running"]);
    if (live) continue;
    await db.from("company_employees").update({ work_status: "ready" }).eq("id", e.id as string);
    console.log(`${stamp()} [쒸기] 업무 없이 묶여 있던 직원을 풀었다: ${String(e.id).slice(0, 8)}`);
  }
}

/**
 * **도는 쪽이 자기 커밋을 알린다** (2026-09-22, 사장님).
 *
 * "올렸다" 와 "새 코드가 도다" 는 다르다. 오늘 그 둘이 **두 번** 갈라졌고,
 * 두 번 다 사장님이 짚어서 알았다. 그래서 워커가 자기 커밋을 적어 둔다.
 *
 * **막지 않고 알리기만 한다** — 엔진 어긋남에서 "막지 말고 표시만" 을 고른 것과 같다.
 * 배포 흐름은 그대로고, `deploy_check.mts` 가 이걸 읽어 "배포 안 된 커밋 N개" 를 찍는다.
 */
async function heartbeatTick() {
  // `railway up` 은 **작업 트리를 올리는** 방식이라 깃 커밋이 안 딸려 간다
  // (`RAILWAY_GIT_COMMIT_SHA` 가 비어 있음을 09-22 에 확인했다).
  // 그래서 **올리기 직전에 파일로 박아 넣는다** — 올라간 트리에 들어 있으므로 항상 실제 도는 것과 같다.
  let commit: string | null = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.ROOKERY_COMMIT ?? null;
  if (!commit) {
    try { commit = (await import("node:fs")).readFileSync(".deploy-commit", "utf8").trim() || null; } catch { commit = null; }
  }
  await db.from("service_heartbeat").upsert({
    service: "rookery-worker", commit_sha: commit, seen_at: new Date().toISOString(),
    deployed_at: process.env.RAILWAY_DEPLOYMENT_CREATED_AT ?? null,
  }, { onConflict: "service" });
}

const RETURNS_EVERY = 4;   // 15초 × 4 = 1분
const WALLET_EVERY = 40;   // 15초 × 40 = 10분
const PING_EVERY = 20;     // 15초 × 20 = 5분 — 뽑은 시각에서 최대 5분 늦는다. 그 정도는 랜덤에 묻힌다.
let tickN = 0;

/**
 * 두근도트 — 캐릭터가 먼저 말 건다(09-10).
 * 규칙·문장·보내기는 전부 `dot/push.ts` 에 있다. 여기는 5분마다 부르기만 한다.
 * 아무도 구독하지 않았으면 0 을 돌려주고 조용히 있는다.
 */
async function pingTick() {
  const { pingTick: run, pushConfigured } = await import("@/lib/dot/push");
  if (!pushConfigured()) return;
  const r = await run(db, (m) => console.log(`${stamp()} ${m}`));
  if (r.drawn || r.sent || r.dead) console.log(`${stamp()} [먼저말걸기] 시각 뽑음 ${r.drawn} · 보냄 ${r.sent} · 죽은 주소 ${r.dead}`);
}
/** 게시물 — 캐릭터가 하루 한 장. 규칙은 dot/posts.ts. */
async function postTick() {
  const { postTick: run } = await import("@/lib/dot/posts");
  const r = await run(db, (m) => console.log(`${stamp()} ${m}`));
  if (r.posted) console.log(`${stamp()} [게시물] 올림 ${r.posted}`);
}
let lastWallet = -1;

/**
 * 싼 자리 지갑을 들여다본다.
 *
 * 09-09: DeepSeek 잔액이 09-07 저녁에 0이 됐고 사흘간 싼 자리 일이 전부 gpt-5 로
 * 갔다($17.9). 라우터가 **살려 놓기 때문에** 오류도 안 남고 답도 안 나빠져서
 * 아무도 몰랐다. 그리고 DeepSeek 은 **자동 충전이 없다** — 잔액 0은 사고가 아니라
 * 예정된 일이고, 사람이 넣을 때까지 계속 샌다.
 *
 * 그래서 쓰기 **전에** 본다. 원장은 이미 쓴 뒤에만 알려 준다.
 *
 * 값이 안 바뀌면 조용히 있는다 — 10분마다 같은 줄이 찍히면 아무도 안 읽는다.
 */
async function walletTick() {
  const { deepSeekWallet, LOW_USD } = await import("@/lib/providers/balance");
  const w = await deepSeekWallet();
  if (w.usd === null) {
    console.warn(`${stamp()} [지갑] ${w.vendor} ${w.note}`);
    return;
  }
  const low = !w.available || w.usd < LOW_USD;
  const changed = Math.abs(w.usd - lastWallet) >= 0.01;
  lastWallet = w.usd;
  if (low) {
    // 이건 매번 외친다. 낮은 상태가 계속되는 것 자체가 계속 새고 있다는 뜻이다.
    console.error(
      `${stamp()} [돈샘] ${w.vendor} 잔액 ${w.note} — 바닥나면 싼 자리 일이 비싼 자리로 간다. ` +
        `자동 충전이 없으니 사람이 넣어야 한다.`,
    );
  } else if (changed) {
    console.log(`${stamp()} [지갑] ${w.vendor} ${w.note}`);
  }
}
/**
 * 201회차 09-21: **살아 있는 업무에서 출발한다.** 전에는 "최근 24시간 안에 업무가 실린 메시지" 에서 출발했다 —
 * 그러면 ① 대화가 24시간보다 오래되면 그 일은 영영 안 풀리고 ② 메시지 200개·대화 20개 상한 밖으로 밀리면 또 안 풀린다.
 * 점검(autonomy_audit.mts) 실측: 지금 닿는 대화 **0개**, 살아 있는 업무 **9개 전부 영영 안 풀림**.
 * 살아 있는 업무는 몇 개 안 되므로 거기서 출발하는 것이 싸고 확실하다.
 */
async function returnsTick() {
  const LIVE = ["assigned", "queued", "working", "waiting", "submitted", "failed", "needs_changes", "revision_queued", "revising"];
  const { data: liveA } = await db.from("assignments").select("id").in("status", LIVE).limit(200);
  const liveIds = (liveA ?? []).map((a) => a.id as string);
  const convIds = new Set<string>();
  for (let i = 0; i < liveIds.length; i += 25) {
    const chunk = liveIds.slice(i, i + 25);
    const { data: ms } = await db.from("conversation_messages").select("conversation_id, aid:attachments->assignment->>id").in("attachments->assignment->>id", chunk);
    for (const m of ms ?? []) convIds.add(m.conversation_id as string);
  }
  const ids = [...convIds].slice(0, 40);
  for (const id of ids) {
    try {
      const r = await collectWorkReturns(db, id);
      if (r.posted.length) console.log(`${stamp()} ↩ 대화 ${id.slice(0, 8)} 에 결과 ${r.posted.length}개 붙임`);
    } catch (e) {
      console.error(`${stamp()} ↩ 실패 ${id.slice(0, 8)}`, e instanceof Error ? e.message : e);
    }
  }
}

async function tick() {
  const { data: queued } = await db
    .from("work_executions")
    .select("id, company_employee_id, company_id, assignment_id, created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(20);
  // 200회차: 무인 판의 깃발. 바깥 문지기가 멈췄으면 아무것도 집지 않는다 — 로키는 세지 않고 복종만 한다.
  if (queued?.length) {
    const { blockedByUnattended } = await import("@/lib/genesis/unattended");
    const why = await blockedByUnattended(db);
    if (why) { if (tickN % 20 === 0) console.log(`${stamp()} [무인] 멈춤 깃발 — 일을 안 집는다: ${why}`); return; }
    // **검토 대기열 문** (204회차 09-21, 사장님 지적 3). 병목은 만드는 시간이 아니라 **읽는 시간**이다.
    // 안 본 결과물이 쌓이면 더 만들지 않고 기다린다 — 하나라도 보시면 다시 돌아간다.
    // **사장님이 직접 시킨 일은 안 막는다.** 사장님의 말은 그 자체로 우선순위다 —
    // 상한은 *로키가 스스로 더 만드는 것*을 멈추려는 것이지 도구를 잠그려는 것이 아니다.
    // (09-21 실측: 사장님 회사는 이미 26/10 이라, 안 가르면 오늘 저녁부터 로키가 아무것도 안 한다.)
    const { blockedByReviewQueue } = await import("@/lib/genesis/reviewQueue");
    const { data: asgRows } = await db.from("assignments").select("id, company_id, role_input_json")
      .in("id", (queued ?? []).map((q) => q.assignment_id as string).filter(Boolean));
    const autoCos = [...new Set((asgRows ?? [])
      .filter((a) => { const r = a.role_input_json as Record<string, unknown> | null; return r?.unattended === true || r?.unattended === "true" || r?.autonomous === true; })
      .map((a) => a.company_id as string))];
    for (const c of autoCos) {
      const w = await blockedByReviewQueue(db, c);
      if (w) { if (tickN % 20 === 0) console.log(`${stamp()} [검토] 로키가 스스로 만드는 일을 멈춤 — ${w}`); return; }
    }
  }
  for (const q of queued ?? []) {
    if (busy.has(q.company_employee_id as string)) continue;
    // 43회차: 집을 때 **자리를 잡는다**. 프로세스 안의 집합만으로는 워커가 둘이거나 배포 중 옛 워커가
    // 살아 있으면 같은 실행을 둘이 돌린다(돈 두 배·파일 두 벌). 조건부 갱신이 성공한 쪽만 돌린다.
    const { data: claimed } = await db
      .from("work_executions")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", q.id as string)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    void runOne(q.id as string, q.company_employee_id as string, "대기열");
  }
  const cutoff = new Date(Date.now() - DEAD_MS).toISOString();
  const { data: dead } = await db
    .from("work_executions")
    .select("id, company_employee_id, current_step, updated_at")
    .eq("status", "running")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(10);
  for (const d of dead ?? []) {
    if (busy.has(d.company_employee_id as string)) continue;
    // 죽은 것을 잇는 쪽도 같은 자리잡기 — updated_at 을 지금으로 밀어 다른 워커가 또 집지 못하게.
    const { data: taken } = await db
      .from("work_executions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", d.id as string)
      .eq("status", "running")
      .lt("updated_at", cutoff)
      .select("id")
      .maybeSingle();
    if (!taken) continue;
    void runOne(d.id as string, d.company_employee_id as string, `'${d.current_step}' 에서 ${Math.round((Date.now() - new Date(d.updated_at as string).getTime()) / 60_000)}분 소식 없음 → 이어서`);
  }
}

// 100회차 09-14 (사장님 "2,3"): 자가진화 하루 한 번. 한 시간마다 들여다보고, 한국 새벽 4시 이후 그날 첫 번째만 돈다.
// 하루 한 번은 genesis_runs 표의 unique 가 지킨다(워커가 둘이어도). 규칙 고리는 GENESIS_SPEND=i-approve 없으면 스스로 건너뛴다.
const DAILY_EVERY = 240;   // 15초 × 240 = 1시간
// 190회차: 토요일 아침 한 번 "이번 주 AI 보고" 세 줄을 사장님 대화에 붙인다(주 1회는 genesis_runs weekly unique).
async function weeklyTick() {
  const { postWeekly } = await import("@/lib/genesis/weekly");
  await postWeekly(db, (m) => console.log(`${stamp()} [주간] ${m}`));
}
async function dailyTick() {
  const kstHour = new Date(Date.now() + 9 * 3600_000).getUTCHours();
  if (kstHour < 4) return;
  const { runDaily } = await import("@/lib/genesis/daily");
  const r = await runDaily(db, defaultProviders().ai, (m) => console.log(`${stamp()} [자가진화] ${m}`));
  if (r.ran) console.log(`${stamp()} [자가진화] ${r.date} 끝`);
}

// 09-11: 워커도 제품별로 하나씩. PRODUCT=dot 이면 먼저말걸기·지갑만, rookery 면 업무 실행·돌려놓기·지갑.
// 비어 있으면 다 한다(로컬). 두근도트 워커가 로키 DB 에 업무를 찾으러 가면 표가 없어 매 틱 오류다.
const PRODUCT = process.env.PRODUCT ?? "";
const doesCompany = PRODUCT !== "dot";
const doesDot = PRODUCT !== "rookery";
console.log(`${stamp()} 제품: ${PRODUCT || "(전부)"} · 회사 업무 ${doesCompany ? "함" : "안 함"} · 먼저말걸기 ${doesDot ? "함" : "안 함"}`);

// 112회차 09-15: 뜰 때 영상 배관을 모델 없이 한 바퀴(몇 초, 돈 0). 111회차에 일주일 넘게 죽어 있던 영상을 시험판이 잡았다 —
// 이제 워커가 뜰 때마다 스스로 잰다. 고장이면 로그에 크게 남기고, 업무는 그대로 받는다(영상 아닌 일까지 멈출 이유는 없다).
if (doesCompany) {
  try {
    const { videoSelfcheck } = await import("@/lib/video/selfcheck");
    const v = await videoSelfcheck();
    console.log(`${stamp()} [영상 점검] ${v.ok ? "정상" : "고장!"} · ${v.ffmpeg} · ${v.ms}ms${v.error ? ` · ${v.error}` : ""}`);
  } catch (e) { console.error(`${stamp()} [영상 점검] 고장! ${e instanceof Error ? e.message : e}`); }
}

for (;;) {
  if (doesCompany) {
    try { await tick(); } catch (e) { console.error(`${stamp()} tick 실패`, e instanceof Error ? e.message : e); }
    if (tickN % RETURNS_EVERY === 0) {
      try { await returnsTick(); } catch (e) { console.error(`${stamp()} 돌려놓기 실패`, e instanceof Error ? e.message : e); }
      try { await sweepTick(); } catch (e) { console.error(`${stamp()} 쓸기 실패`, e instanceof Error ? e.message : e); }
      try { await heartbeatTick(); } catch (e) { console.error(`${stamp()} 심장 소리 실패`, e instanceof Error ? e.message : e); }
      // 202회차: 무인 판 결과를 볼 자리에 붙인다. **일의 완료와 무관한 경로다** — attachments.assignment 를 안 써서
      // 쓸기·결과 붙이기 어느 쪽과도 얽히지 않는다(사장님 조건 2).
      try {
        const { postUnattendedFeed } = await import("@/lib/genesis/unattendedFeed");
        await postUnattendedFeed(db, (m) => console.log(`${stamp()} [무인결과] ${m}`));
      } catch (e) { console.error(`${stamp()} 무인 결과 붙이기 실패`, e instanceof Error ? e.message : e); }
    }
    if (tickN % DAILY_EVERY === 0) {
      try { await dailyTick(); } catch (e) { console.error(`${stamp()} 자가진화 실패`, e instanceof Error ? e.message : e); }
      try { await weeklyTick(); } catch (e) { console.error(`${stamp()} 주간 보고 실패`, e instanceof Error ? e.message : e); }
    }
  }
  if (tickN % WALLET_EVERY === 0) {
    try { await walletTick(); } catch (e) { console.error(`${stamp()} 지갑 확인 실패`, e instanceof Error ? e.message : e); }
  }
  if (doesDot && tickN % PING_EVERY === 0) {
    try { await pingTick(); } catch (e) { console.error(`${stamp()} 먼저말걸기 실패`, e instanceof Error ? e.message : e); }
    try { await postTick(); } catch (e) { console.error(`${stamp()} 게시물 실패`, e instanceof Error ? e.message : e); }
  }
  tickN++;
  await new Promise((r) => setTimeout(r, TICK_MS));
}
