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
async function returnsTick() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: rows } = await db
    .from("conversation_messages")
    .select("conversation_id")
    .not("attachments->assignment->>id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = [...new Set((rows ?? []).map((r) => r.conversation_id as string))].slice(0, 20);
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
    .select("id, company_employee_id, created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(20);
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
    }
    if (tickN % DAILY_EVERY === 0) {
      try { await dailyTick(); } catch (e) { console.error(`${stamp()} 자가진화 실패`, e instanceof Error ? e.message : e); }
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
