/**
 * **2단계 — 고치는 판을 쌓는다** (204회차 09-21).
 *
 * 채점표(`headWins`)가 세는 것은 **고치는 판**뿐이다. 새로 만드는 판은 안 센다.
 * 그래서 이미 있는 산출물에 고침 요청을 붙여 돌린다. 자리는 섞어 보내기가 정하고 **나도 사장님도 안 고른다.**
 *
 * 잠근 규칙(`stage2Verdict.ts`, 판 쌓기 전에 잠금):
 * - 대상은 **만든 순서대로** 고른다 — 고르기에 재량을 주면 쉬운 것만 집는다.
 * - 요청은 `FIX_KINDS` 네 갈래를 **돌아가며** 쓴다 — 난이도가 달라야 채점표가 의미가 있다.
 * - best·explore 각 5판이 차면 자가 말한다. 그 전엔 "못 잼".
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/stage2_run.mts --n 18        — 18판 넣는다
 *   npx tsx engine/tools/rookery_env.mts engine/tools/stage2_run.mts --dry         — 뭐가 들어갈지만 본다
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { FIX_KINDS } = await import("../../src/lib/genesis/stage2Verdict");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const CO = "00add05a-e81d-4e04-9980-34bb412a8780", DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83";
const n = Number(arg("--n") ?? 18);
// **이어서 고른다** — 앞서 쓴 대상을 다시 쓰면 같은 산출물을 두 번 고치게 되고, 갈래 돌림도 끊긴다.
// 그래서 건너뛴 수만큼 뒤에서 시작하고, 요청 갈래도 **전체 순번**으로 돌린다.
const skip = Number(arg("--skip") ?? 0);

// 재료: demo 의 app_build 산출물 중 **파일이 있는 것**만(고칠 게 있어야 고치는 판이다). 만든 순서대로.
const { data: dls } = await db.from("deliverables").select("id, title, created_at, files:content_json->files")
  .eq("company_id", CO).eq("deliverable_type", "app_build").order("created_at", { ascending: true }).limit(200);
const mats = (dls ?? []).filter((d) => Array.isArray(d.files) ? (d.files as unknown[]).length > 0 : d.files && Object.keys(d.files as object).length > 0);
console.log(`재료: app_build ${dls?.length ?? 0}개 중 파일이 있는 것 ${mats.length}개`);
if (mats.length < n) console.log(`  (${n}판을 넣으려면 ${n}개가 필요한데 ${mats.length}개다 — 있는 만큼만 넣는다)`);

const plan = mats.slice(skip, skip + n).map((d, i) => ({ d, k: FIX_KINDS[(skip + i) % FIX_KINDS.length] }));
console.log(`\n넣을 것 ${plan.length}판 (만든 순서대로 · 요청은 네 갈래를 돌아가며)`);
for (const [i, p] of plan.entries()) console.log(`  ${String(i + 1).padStart(2)} [${p.k.kind}/${p.k.난이도}] ${String(p.d.title).slice(0, 24)}`);
if (process.argv.includes("--dry")) process.exit(0);

// 이미 대기 중인 게 있으면 안 넣는다
const { data: live } = await db.from("assignments").select("id").eq("company_id", CO).in("status", ["waiting", "assigned", "queued", "working"]);
if (live?.length) { console.error(`데모 회사에 살아 있는 일이 ${live.length}개 — 먼저 비워야 한다`); process.exit(1); }

let made = 0;
for (const [i, p] of plan.entries()) {
  const first = i === 0;
  const { data: a, error } = await db.from("assignments").insert({
    company_id: CO, company_employee_id: DEV,
    title: `${String(p.d.title).slice(0, 20)} — ${p.k.kind}`, description: p.k.ask,
    status: first ? "assigned" : "waiting", current_progress_step: first ? "assignment_received" : null,
    role_input_json: { approved: true, autonomous: true, previousDeliverableId: p.d.id, stage2: p.k.kind },
    role_input_schema_id: "small_app_assignment_v1", priority: "normal",
  }).select("id").single();
  if (error) { console.error(`${i + 1}번 못 넣음: ${error.message}`); break; }
  if (first) await db.from("work_executions").insert({ company_id: CO, assignment_id: a!.id, company_employee_id: DEV, status: "queued", current_step: "context_loaded", attempt_number: 1 });
  made++;
}
console.log(`\n넣음 ${made}판 (첫 판은 바로 시작, 나머지는 차례 대기)`);
