/**
 * **4단계 본판 한 회차를 주문한다.** 요청 원문을 그대로 싣는다(개정판 2 ④).
 *   --origin <결과물id> --scope <이번 회차 범위 파일>
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { readFileSync } = await import("node:fs");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
// **판 5 부터 사장님 회사**(09-22 사장님이 "옮긴다"). 데모 회사에 두면 사장님 계정에서
// 결과물이 안 보여(RLS 로 404) 회차마다 내가 따로 링크를 만들어야 했다.
const CO = "5925c03a-557f-46d7-8589-7388b769df40";   // 권혁수
const DEV = "b52d580e-1938-4a0d-817c-f60f5f00e743";  // Dev 자리
const origin = arg("--origin")!;
const desc = readFileSync(arg("--scope")!, "utf8");
const { data: a, error } = await db.from("assignments").insert({
  company_id: CO, company_employee_id: DEV,
  title: "별빛 플랫포머 — 점프를 더 쫀득하게 (판6 1회차: 곡선)",
  description: desc,
  status: "assigned", current_progress_step: "assignment_received",
  role_input_json: {
    approved: true, verify: true, previousDeliverableId: origin,
    stage4: { run: 6, round: 1, request: "점프를 더 쫀득하게" },
    // **난간을 고리 안으로**(205회차 09-22). 어기면 심판 말 위에 고장으로 얹힌다.
    webGuards: [
      { measure: "점프.못오르는발판", min: 1, max: 1, why: "원본과 같아야 한다 — 늘면 못 닿고 줄면 쉬워진다" },
      { measure: "점프.높이px", min: 119.8, max: 139.8, why: "아래 84.4 / 위 149.3 에서 판이 바뀐다" },
      // **해석의 중심을 옮겼다**(09-22 사장님이 고르심): 빠름이 아니라 **버티는 것**이 주인공.
      // 상승 상한은 뺐다 — "너무 빨라" 가 거기서 나왔다.
      { measure: "점프.꼭대기프레임", min: 7, why: "안내값 — **이번 판의 주인공** (원본 4)" },
      { measure: "점프.공중프레임", min: 36, max: 40, why: "안내값 — 점프 전체가 짧아지면 안 된다 (원본 40, 판4 는 24 라 '너무 빨라')" },
      { measure: "점프.하강나누기상승", max: 0.95, why: "안내값 — 하강은 조금만 빠르게 (원본 1.11) · 판정은 사장님 말이다" },
    ],
  },
  role_input_schema_id: "small_app_assignment_v1", priority: "normal",
}).select("id").single();
if (error) { console.error(`못 넣음: ${error.message}`); process.exit(1); }
await db.from("work_executions").insert({ company_id: CO, assignment_id: a!.id, company_employee_id: DEV, status: "queued", current_step: "context_loaded", attempt_number: 1 });
console.log(`1회차 주문: ${a!.id}`);
