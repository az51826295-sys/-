/**
 * **미리 채운 과제 대기열** (200회차 09-20, 사장님 제약 3: "첫 판은 미리 채운 대기열로 **신뢰성만** 보세요").
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/unattended_queue.mts --fill 8   — 데모 회사에 8개 넣는다
 *   npx tsx engine/tools/rookery_env.mts engine/tools/unattended_queue.mts            — 지금 대기열만 본다
 *   npx tsx engine/tools/rookery_env.mts engine/tools/unattended_queue.mts --clear     — 안 시작한 것 치운다
 *
 * **사장님 회사가 아니라 데모 회사**에 넣는다 — 신뢰성 시험 산출물이 사장님 대화를 채우면 안 된다.
 * 과제는 **얼린 목록**이다. 판마다 바꾸면 판끼리 못 견준다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const CO = "00add05a-e81d-4e04-9980-34bb412a8780";
const DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83";
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };

/**
 * 얼린 과제 — **파일에서 읽는다**(203회차 09-21). 손으로 적지 않는다:
 * 로키가 비율만 받아 낸 뒤(`queue_gen.mts`) 무게를 엇갈려 깔고 순서까지 얼였다(`queue_freeze.mts`).
 * **순서를 바꾸면 다음 판과 못 견준다** — 그래서 파일 그대로, 적힌 순서대로 넣는다.
 */
type Frozen = { items: { n: number; weight: string; title: string; description: string; expectFail: boolean }[]; mix: Record<string, number>; estimate: Record<string, unknown> };
const { readFileSync } = await import("node:fs");
const frozen = JSON.parse(readFileSync("engine/docs/genesis/unattended-queue-2.json", "utf8")) as Frozen;
const TASKS: [string, string, boolean][] = frozen.items.map((x) => [x.title, x.description, !!x.expectFail]);

async function show() {
  const { data } = await db.from("assignments").select("id, title, status, created_at").eq("company_id", CO).in("status", ["waiting", "assigned", "queued", "working"]).order("created_at");
  console.log(`데모 회사 대기열: ${data?.length ?? 0}개`);
  for (const a of data ?? []) console.log(`  [${a.status}] ${a.title}`);
  return data ?? [];
}

if (process.argv.includes("--clear")) {
  const { data } = await db.from("assignments").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("company_id", CO).eq("status", "waiting").select("id");
  console.log(`치움 ${data?.length ?? 0}개`); await show(); process.exit(0);
}
// **넣기 전에 뭐가 들어가는지 본다** (203회차 09-21, 사장님: *"`--fill 60` 이 앞서 말한 구성대로 채우는지 확인하세요"*).
if (process.argv.includes("--dry")) {
  const n = Number(arg("--dry-n") ?? frozen.items.length);
  const w = (k: string) => frozen.items.slice(0, n).filter((x) => x.weight === k).length;
  console.log(`얼린 목록에서 ${n}개 — 가벼움 ${w("가벼움")} · 중간 ${w("중간")} · 무거움 ${w("무거움")} · 깨지는 것 ${frozen.items.slice(0, n).filter((x) => x.expectFail).length}`);
  console.log(`깨지는 과제 자리: ${frozen.items.filter((x) => x.expectFail).map((x) => x.n).join(", ")}번`);
  for (const x of frozen.items.slice(0, n)) console.log(`  ${String(x.n).padStart(2)} [${x.weight}]${x.expectFail ? " ⚠" : ""} ${x.title}`);
  process.exit(0);
}
if (!arg("--fill")) { await show(); process.exit(0); }

const n = Math.min(Number(arg("--fill")), TASKS.length);
const live = await show();
if (live.length) { console.error("이미 대기열에 있다 — --clear 먼저"); process.exit(1); }
for (let i = 0; i < n; i++) {
  const [title, desc, planted] = TASKS[i];
  const suffix = "";
  // 첫 개만 바로 시작, 나머지는 waiting — releaseEmployee 가 차례로 꺼낸다(177회차에 고친 길).
  const first = i === 0;
  const { data: a, error } = await db.from("assignments").insert({
    company_id: CO, company_employee_id: DEV, title: title + suffix, description: desc,
    status: first ? "assigned" : "waiting", current_progress_step: first ? "assignment_received" : null,
    // **심은 것은 칸으로 표시한다** (204회차 09-21, 사장님): 제목으로 가르면 다음에 심는 과제는 제목이 달라 또 섮인다.
    role_input_json: { approved: true, unattended: true, ...(planted ? { planted: true } : {}) }, role_input_schema_id: "small_app_assignment_v1", priority: "normal",
  }).select("id").single();
  if (error) { console.error(`${i + 1}번 못 넣음: ${error.message}`); break; }
  if (first) await db.from("work_executions").insert({ company_id: CO, assignment_id: a!.id, company_employee_id: DEV, status: "queued", current_step: "context_loaded", attempt_number: 1 });
}
console.log(`\n채움 ${n}개 (첫 개는 바로 시작, 나머지는 차례 대기)`);
await show();
