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

/** 얼린 과제 — 작고, 웹이고, 고리가 스스로 판정할 수 있는 것들. */
const TASKS = [
  ["터치로 하는 풍선 터뜨리기", "30초 제한, 점수 표시, 풍선이 아래에서 위로 떠오른다. HTML 한 파일."],
  ["숫자 맞추기 게임", "1~100 중 하나를 맞춘다. 위/아래 힌트, 시도 횟수 표시. HTML 한 파일."],
  ["반응속도 시험기", "초록으로 바뀌면 누른다. 5번 재고 평균을 보여 준다. HTML 한 파일."],
  ["기억력 카드 짝 맞추기", "카드 12장(6쌍), 뒤집어서 짝 맞추기, 남은 시간 60초. HTML 한 파일."],
  ["떨어지는 블록 피하기", "좌우 방향키로 피한다, 목숨 3개, 점수 표시. HTML 한 파일."],
  ["단어 타자 연습", "단어가 떨어지면 타자로 쳐서 없앤다, 30초, 정확도 표시. HTML 한 파일."],
  ["간단한 그림판", "마우스로 그리고 색 5가지, 지우개, 전체 지우기. HTML 한 파일."],
  ["타이머와 스톱워치", "탭 두 개, 시작·정지·초기화, 큰 숫자. HTML 한 파일."],
];

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
if (!arg("--fill")) { await show(); process.exit(0); }

const n = Math.min(Number(arg("--fill")), TASKS.length * 3);
const live = await show();
if (live.length) { console.error("이미 대기열에 있다 — --clear 먼저"); process.exit(1); }
for (let i = 0; i < n; i++) {
  const [title, desc] = TASKS[i % TASKS.length];
  const suffix = i >= TASKS.length ? ` (${Math.floor(i / TASKS.length) + 1}판)` : "";
  // 첫 개만 바로 시작, 나머지는 waiting — releaseEmployee 가 차례로 꺼낸다(177회차에 고친 길).
  const first = i === 0;
  const { data: a, error } = await db.from("assignments").insert({
    company_id: CO, company_employee_id: DEV, title: title + suffix, description: desc,
    status: first ? "assigned" : "waiting", current_progress_step: first ? "assignment_received" : null,
    role_input_json: { approved: true, unattended: true }, role_input_schema_id: "small_app_assignment_v1", priority: "normal",
  }).select("id").single();
  if (error) { console.error(`${i + 1}번 못 넣음: ${error.message}`); break; }
  if (first) await db.from("work_executions").insert({ company_id: CO, assignment_id: a!.id, company_employee_id: DEV, status: "queued", current_step: "context_loaded", attempt_number: 1 });
}
console.log(`\n채움 ${n}개 (첫 개는 바로 시작, 나머지는 차례 대기)`);
await show();
