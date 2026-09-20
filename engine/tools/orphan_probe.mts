/** 쓸기가 **업무 없이 묶인 직원**을 푸는가 (203회차 09-21). 고장을 심어 잡히는지 본다. 모델 0, 돈 0. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83", CO = "00add05a-e81d-4e04-9980-34bb412a8780";

// 쓸기 본문과 같은 셈. 워커를 띄우지 않고 규칙만 돌린다.
async function sweepOrphans() {
  const { data: orphan } = await db.from("company_employees").select("id").neq("work_status", "ready").is("current_assignment_id", null).limit(20);
  let n = 0;
  for (const e of orphan ?? []) {
    const { count: live } = await db.from("work_executions").select("id", { count: "exact", head: true }).eq("company_employee_id", e.id as string).in("status", ["queued", "running"]);
    if (live) continue;
    await db.from("company_employees").update({ work_status: "ready" }).eq("id", e.id as string);
    n++;
  }
  return n;
}
const { data: was } = await db.from("company_employees").select("work_status, current_assignment_id").eq("id", DEV).maybeSingle();
try {
  // (가) **고장을 심는다** — 업무 없이 working
  await db.from("company_employees").update({ work_status: "working", current_assignment_id: null }).eq("id", DEV);
  const n1 = await sweepOrphans();
  const { data: a1 } = await db.from("company_employees").select("work_status").eq("id", DEV).maybeSingle();
  check("**업무 없이 묶인 직원을 푼다**", n1 >= 1 && a1?.work_status === "ready", { n1, a1 });

  // (나) **돌고 있는 실행이 있으면 안 건드린다** — 실험을 끄지 않는다
  // 심은 고장이 **진짜 들어갔는지** 먼저 확인한다 — 안 들어갔는데 "안 푼다" 를 재면 자가 거짓말한다.
  const { data: asg0 } = await db.from("assignments").insert({ company_id: CO, company_employee_id: DEV, title: "자 시험 실행용", description: "자 시험", status: "working", role_input_json: { approved: true }, role_input_schema_id: "small_app_assignment_v1", priority: "normal" }).select("id").single();
  const { data: ex, error: exErr } = await db.from("work_executions").insert({ company_id: CO, assignment_id: asg0!.id, company_employee_id: DEV, status: "running", current_step: "context_loaded", attempt_number: 1 }).select("id").single();
  if (exErr || !ex) { console.error("심은 실행이 안 들어갔다 — 자가 못 잰다:", exErr?.message); process.exit(2); }
  await db.from("company_employees").update({ work_status: "working", current_assignment_id: null }).eq("id", DEV);
  const n2 = await sweepOrphans();
  const { data: a2 } = await db.from("company_employees").select("work_status").eq("id", DEV).maybeSingle();
  check("**돌고 있으면 안 푼다**", n2 === 0 && a2?.work_status === "working", { n2, a2 });
  await db.from("work_executions").delete().eq("id", ex.id as string);
  await db.from("assignments").delete().eq("id", asg0!.id as string);

  // (다) 업무가 붙어 있으면 이 길이 아니다(위 쓸기 몫)
  const { data: asg } = await db.from("assignments").insert({ company_id: CO, company_employee_id: DEV, title: "자 시험", description: "자 시험", status: "working", role_input_json: { approved: true }, role_input_schema_id: "small_app_assignment_v1", priority: "normal" }).select("id").single();
  await db.from("company_employees").update({ work_status: "working", current_assignment_id: asg!.id }).eq("id", DEV);
  const n3 = await sweepOrphans();
  check("업무가 붙어 있으면 이 길로는 안 푼다", n3 === 0, n3);
  await db.from("assignments").delete().eq("id", asg!.id as string);
} finally {
  await db.from("company_employees").update({ work_status: was?.work_status === "working" ? "ready" : (was?.work_status ?? "ready"), current_assignment_id: null }).eq("id", DEV);
  console.log("치움 — Dev 는 ready 로");
}
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
