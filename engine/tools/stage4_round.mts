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
  title: "별빛 플랫포머 — 점프를 더 쫀득하게 (판4 1회차: 곡선)",
  description: desc,
  status: "assigned", current_progress_step: "assignment_received",
  role_input_json: {
    approved: true, verify: true, previousDeliverableId: origin,
    stage4: { run: 4, round: 1, request: "점프를 더 쫀득하게" },
    // **난간을 고리 안으로**(205회차 09-22). 어기면 심판 말 위에 고장으로 얹힌다.
    webGuards: [
      { measure: "점프.못오르는발판", min: 1, max: 1, why: "원본과 같아야 한다 — 늘면 못 닿고 줄면 쉬워진다" },
      { measure: "점프.높이px", min: 119.8, max: 139.8, why: "아래 84.4 / 위 149.3 에서 판이 바뀐다" },
      // ㉠은 세 부분이다. 한 값으로 대신하면 하강만 건드려도 통과한다(판 3 이 그랬다).
      { measure: "점프.상승프레임", max: 14, why: "안내값 — 빠르게 솟는다 (원본 19)" },
      { measure: "점프.꼭대기프레임", min: 7, why: "안내값 — 꼭대기에서 잠깐 머문다 (원본 4)" },
      { measure: "점프.하강나누기상승", max: 0.90, why: "안내값 — 내려올 때 더 빠르게 (원본 1.11) · 판정은 사장님 말이다" },
    ],
  },
  role_input_schema_id: "small_app_assignment_v1", priority: "normal",
}).select("id").single();
if (error) { console.error(`못 넣음: ${error.message}`); process.exit(1); }
await db.from("work_executions").insert({ company_id: CO, assignment_id: a!.id, company_employee_id: DEV, status: "queued", current_step: "context_loaded", attempt_number: 1 });
console.log(`1회차 주문: ${a!.id}`);
