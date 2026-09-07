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

const [{ createServiceClient }, { executeEmployeeAssignment }, { defaultProviders }] = await Promise.all([
  import("@/lib/supabase/service"), import("@/lib/execution/engine"), import("@/lib/execution/shared"),
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

async function tick() {
  const { data: queued } = await db
    .from("work_executions")
    .select("id, company_employee_id, created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(20);
  for (const q of queued ?? []) {
    if (busy.has(q.company_employee_id as string)) continue;
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
    void runOne(d.id as string, d.company_employee_id as string, `'${d.current_step}' 에서 ${Math.round((Date.now() - new Date(d.updated_at as string).getTime()) / 60_000)}분 소식 없음 → 이어서`);
  }
}

for (;;) {
  try { await tick(); } catch (e) { console.error(`${stamp()} tick 실패`, e instanceof Error ? e.message : e); }
  await new Promise((r) => setTimeout(r, TICK_MS));
}
