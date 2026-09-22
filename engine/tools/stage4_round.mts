/**
 * **4단계 본판 한 회차를 주문한다.** 요청 원문을 그대로 싣는다(개정판 2 ④).
 *   --origin <결과물id> --scope <이번 회차 범위 파일>
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { readFileSync } = await import("node:fs");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const CO = "00add05a-e81d-4e04-9980-34bb412a8780";
const DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83";
const origin = arg("--origin")!;
const desc = readFileSync(arg("--scope")!, "utf8");
const { data: a, error } = await db.from("assignments").insert({
  company_id: CO, company_employee_id: DEV,
  title: "별빛 플랫포머 — 점프를 더 쫀득하게 (판2 1회차: 곡선)",
  description: desc,
  status: "assigned", current_progress_step: "assignment_received",
  role_input_json: { approved: true, verify: true, previousDeliverableId: origin, stage4: { run: 2, round: 1, request: "점프를 더 쫀득하게" } },
  role_input_schema_id: "small_app_assignment_v1", priority: "normal",
}).select("id").single();
if (error) { console.error(`못 넣음: ${error.message}`); process.exit(1); }
await db.from("work_executions").insert({ company_id: CO, assignment_id: a!.id, company_employee_id: DEV, status: "queued", current_step: "context_loaded", attempt_number: 1 });
console.log(`1회차 주문: ${a!.id}`);
