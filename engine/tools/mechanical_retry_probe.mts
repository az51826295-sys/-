/**
 * 기계적인 고장의 '다시 하기' 자 (117회차 09-15) — 실서버, 모델 없음, 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/mechanical_retry_probe.mts
 *
 * 씨앗 회사·직원·업무를 심고 실제로 `scheduleMechanicalRetry` 를 부른다.
 *   1) 출력 잘림 → 새 실행이 대기열에 서고 업무가 queued 로 돌아온다(대화에 '못 했습니다' 가 안 뜨는 조건)
 *   2) 한 번 더 → 막힌다(최대 1번)
 *   3) 자기모순(뜻이 있는 실패) → 다시 하지 않는다  ← 이게 없으면 모든 실패를 되풀이하는 자다
 *   4) 저장 시간 초과 → 다시 한다
 * 끝에 씨앗을 지운다.
 */
const { scheduleMechanicalRetry, isMechanical, MAX_MECHANICAL_RETRIES } = await import("../../src/lib/execution/mechanicalRetry");
const { createServiceClient } = await import("../../src/lib/supabase/service");

const svc = createServiceClient();
let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

check("기계적인 것만 참", isMechanical("MODEL_OUTPUT_TRUNCATED", "") && isMechanical("UNKNOWN_ERROR", "MODEL_OUTPUT_TRUNCATED") && isMechanical("DELIVERABLE_SAVE_FAILED", ""));
check("뜻이 있는 실패는 거짓", !isMechanical("SELF_INCONSISTENT", "the rule names #FF00FF") && !isMechanical("CONTEXT_INCOMPLETE", "missing: Company summary"));

let uid = "";
try {
  const email = `retry-${Date.now()}@rookery.local`;
  const { data: made, error } = await svc.auth.admin.createUser({ email, password: `r-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
  if (error) throw error;
  uid = made.user.id;
  const co = (await svc.from("companies").insert({ owner_id: uid, name: "다시 하기 자 회사" }).select("id").single()).data!;
  const emp = (await svc.from("employees").select("id").limit(1).maybeSingle()).data as { id: string } | null;
  if (!emp) throw new Error("직원 카탈로그가 비었다");
  const ce = (await svc.from("company_employees").insert({ company_id: co.id, employee_id: emp.id, onboarding_status: "completed" }).select("id").single()).data!;
  const as = (await svc.from("assignments").insert({ company_id: co.id, company_employee_id: ce.id, title: "다시 하기 자 업무", description: "자", status: "working" }).select("id").single()).data!;
  const ex1 = (await svc.from("work_executions").insert({ company_id: co.id, assignment_id: as.id, company_employee_id: ce.id, status: "failed", attempt_number: 1 }).select("id").single()).data!;
  const exec = { id: ex1.id as string, company_id: co.id as string, assignment_id: as.id as string, company_employee_id: ce.id as string };

  // 1) 잘림 → 다시
  const r1 = await scheduleMechanicalRetry(svc, exec, "UNKNOWN_ERROR", "MODEL_OUTPUT_TRUNCATED");
  const { data: q1 } = await svc.from("work_executions").select("id, status, attempt_number").eq("assignment_id", as.id).order("attempt_number");
  const { data: a1 } = await svc.from("assignments").select("status").eq("id", as.id).single();
  const rows1 = (q1 ?? []) as { status: string; attempt_number: number }[];
  check(`잘림 → 다시 (실행 ${rows1.length}개, 업무 ${a1?.status})`,
    r1.retried && rows1.length === 2 && rows1.some((r) => r.status === "queued" && r.attempt_number === 2) && a1?.status === "queued", { r1, rows1, a1 });

  // 2) 한 번 더 → 막힘
  const r2 = await scheduleMechanicalRetry(svc, exec, "UNKNOWN_ERROR", "MODEL_OUTPUT_TRUNCATED");
  const { count: n2 } = await svc.from("work_executions").select("*", { count: "exact", head: true }).eq("assignment_id", as.id);
  check(`두 번째는 막힘(최대 ${MAX_MECHANICAL_RETRIES}) — 실행 ${n2}개 그대로`, !r2.retried && n2 === 2, { r2, n2 });

  // 3) 뜻이 있는 실패 → 안 함 (고장 재현: 이게 통과 못 하면 모든 실패를 되풀이하는 자다)
  // 직원 한 명당 살아 있는 업무는 하나다(assignments_one_active_per_employee) — 첫 업무를 닫고 둘째를 심는다.
  await svc.from("assignments").update({ status: "completed" }).eq("id", as.id);
  const { data: as2 } = await svc.from("assignments").insert({ company_id: co.id, company_employee_id: ce.id, title: "자2", description: "자", status: "working" }).select("id").single();
  const { data: ex2 } = await svc.from("work_executions").insert({ company_id: co.id, assignment_id: as2!.id, company_employee_id: ce.id, status: "failed", attempt_number: 1 }).select("id").single();
  const r3 = await scheduleMechanicalRetry(svc, { id: ex2!.id as string, company_id: co.id as string, assignment_id: as2!.id as string, company_employee_id: ce.id as string }, "SELF_INCONSISTENT", "the rule names #FF00FF");
  const { count: n3 } = await svc.from("work_executions").select("*", { count: "exact", head: true }).eq("assignment_id", as2!.id);
  check("자기모순은 다시 하지 않음", !r3.retried && n3 === 1, { r3, n3 });

  // 4) 저장 시간 초과 → 다시
  const r4 = await scheduleMechanicalRetry(svc, { id: ex2!.id as string, company_id: co.id as string, assignment_id: as2!.id as string, company_employee_id: ce.id as string }, "DELIVERABLE_SAVE_FAILED", "canceling statement due to statement timeout");
  const { count: n4 } = await svc.from("work_executions").select("*", { count: "exact", head: true }).eq("assignment_id", as2!.id);
  check("저장 시간 초과 → 다시", r4.retried && n4 === 2, { r4, n4 });
} catch (e) {
  bad++;
  console.log("실패 오류:", e instanceof Error ? e.message : e);
} finally {
  if (uid) await svc.auth.admin.deleteUser(uid);
  console.log("씨앗 지움");
}
console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
