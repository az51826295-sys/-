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
  title: "별빛 플랫포머 — 점프를 더 쫀득하게 (판9 1회차: 곡선)",
  description: desc,
  status: "assigned", current_progress_step: "assignment_received",
  role_input_json: {
    approved: true, verify: true, previousDeliverableId: origin,
    stage4: { run: 9, round: 1, request: "점프를 더 쫀득하게" },
    // **난간을 고리 안으로**(205회차 09-22). 어기면 심판 말 위에 고장으로 얹힌다.
    // **로키가 제안하고 사장님이 잠근 자**(판 7). 내가 숫자를 안 쓴 첫 판이다.
    // **상시 난간을 먼저 얹는다**(개정판 8 ⑬). 로키가 무엇을 제안하든 게임은 끝까지 깨져야 한다.
    // 기계가 못 깨면 사장님께 가기 전에 고장이다. 기계가 깨도 사람 칸은 남는다(기계 클리어 ≠ 사람 클리어).
    webGuards: (() => {
      const 상시 = [{ measure: "게임.클리어", min: 1, max: 1, why: "되던 것이 안 깨져야 한다 — 끝까지 해 보는 기계가 재는 상시 난간(개정판 8)" }];
      const p = JSON.parse(readFileSync(arg("--guards")!, "utf8")) as { 난간: { measure: string }[]; 안내값: unknown[] };
      return [...상시, ...p.난간.filter((g) => g.measure !== "게임.클리어"), ...p.안내값];
    })(),
  },
  role_input_schema_id: "small_app_assignment_v1", priority: "normal",
}).select("id").single();
if (error) { console.error(`못 넣음: ${error.message}`); process.exit(1); }
await db.from("work_executions").insert({ company_id: CO, assignment_id: a!.id, company_employee_id: DEV, status: "queued", current_step: "context_loaded", attempt_number: 1 });
console.log(`1회차 주문: ${a!.id}`);
