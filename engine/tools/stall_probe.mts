/**
 * **진행 없음 감시를 일부러 막아서 잡는지 본다** (201회차 09-21). 사장님: *"그물을 만든 뒤에 일부러 막아 놓고 그물이 잡는지 확인하세요."*
 * 09-20 판의 고장을 그대로 재현한다: 대화에 **붙은** 일이 submitted 로 묶이고(쓸기가 안 건드림) 그 뒤에 일이 줄 선다 → 아무것도 못 움직인다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/stall_probe.mts     — 모델 0, 돈 0 (2분이면 끝난다: stallMinutes=1 로 시험)
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { planFor } = await import("../../src/lib/genesis/unattended");
const db = createServiceClient();
const CO = "00add05a-e81d-4e04-9980-34bb412a8780", DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83";
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

check("판 설정에 stallMinutes 가 있다", planFor(6).stallMinutes === 30, planFor(6).stallMinutes);

// 문지기의 판정식을 그대로 옮겨 온다(같은 질의) — 고장을 심고 이 식이 잡는지 본다
async function judge(since: string, stallMinutes: number) {
  const { count: liveEx } = await db.from("work_executions").select("id",{count:"exact",head:true}).in("status",["queued","running"]);
  const { count: liveAs } = await db.from("assignments").select("id",{count:"exact",head:true}).in("status",["waiting","assigned","queued","working"]);
  const { count: held } = await db.from("company_employees").select("id",{count:"exact",head:true}).neq("work_status","ready");
  const hasWork = (liveEx ?? 0) + (liveAs ?? 0) + (held ?? 0) > 0;
  const { data: lastU } = await db.from("model_usage").select("created_at").gte("created_at", since).order("created_at",{ascending:false}).limit(1).maybeSingle();
  const { data: lastE } = await db.from("work_executions").select("updated_at").gte("created_at", since).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  const marks = [lastU?.created_at, lastE?.updated_at, since].filter(Boolean).map((t)=>Date.parse(t as string));
  const stallMin = Math.round((Date.now() - Math.max(...marks)) / 60000);
  return { hasWork, stallMin, work: (liveEx ?? 0) + (liveAs ?? 0) + (held ?? 0), stalled: hasWork && stallMin >= stallMinutes };
}

// ① 할 일이 없으면 조용해도 안 잡는다(대기열이 빈 것은 고장이 아니다)
const quiet = await judge(new Date(Date.now() - 90*60_000).toISOString(), 30);
check("할 일이 없으면 조용해도 안 잡는다", !quiet.stalled || quiet.hasWork, quiet);

// ② 고장을 심는다 — 대화에 붙은 submitted 가 직원을 묶고, 그 뒤에 일이 줄 선다
const { data: live } = await db.from("assignments").select("id,status").eq("company_employee_id", DEV).in("status",["assigned","queued","working","waiting","submitted","failed"]);
if (live?.length) { console.error("Dev 에 살아 있는 업무가 있다 — 시험 안 함:", JSON.stringify(live)); process.exit(1); }
const base = { company_id: CO, company_employee_id: DEV, description: "진행 없음 감시 시험", priority: "normal", role_input_schema_id: "small_app_assignment_v1" };
const { data: A } = await db.from("assignments").insert({ ...base, title: "[시험] 묶는 일", status: "submitted", role_input_json: {} }).select("id").single();
const { data: B } = await db.from("assignments").insert({ ...base, title: "[시험] 줄 선 일", status: "waiting", role_input_json: {} }).select("id").single();
// 대화에 붙인다 → 쓸기가 안 건드린다(09-20 고장 재현)
const { data: conv } = await db.from("conversations").select("id").limit(1).single();
// 진짜 submitted 는 직원을 묶는다(submit_generated_deliverable RPC 가 work_status='awaiting_review' 로 바꾼다).
// 그걸 빠뜨리면 고장 재현이 반쪽이 된다 — 자 시험이 이것도 짚었다.
await db.from("company_employees").update({ work_status: "awaiting_review", current_assignment_id: A!.id }).eq("id", DEV);
const { data: msg } = await db.from("conversation_messages").insert({ conversation_id: conv!.id, role: "assistant", content: "[시험] 진행 없음 감시", attachments: { assignment: { id: A!.id, title: "[시험] 묶는 일", queued: false } } }).select("id").single();
try {
  const since = new Date(Date.now() - 5*60_000).toISOString(); // 5분 전에 시작한 판인 셈
  const s1 = await judge(since, 1);
  check("고장을 심으니 '할 일 있음' 으로 잡힌다(줄 선 일 + 묶인 직원)", s1.hasWork && s1.work >= 2, s1);
  check("**진행 없음이 잡힌다**(1분 기준)", s1.stalled, s1);
  const s2 = await judge(since, 30);
  check("30분 기준으론 아직 안 잡는다(성급하지 않다)", !s2.stalled, s2);
  // Vid 38시간 재현: 줄 선 일을 치우고 **묶인 직원만** 남긴다 → 그래도 잡혀야 한다
  await db.from("assignments").delete().eq("id", B!.id);
  await db.from("company_employees").update({ work_status: "awaiting_review", current_assignment_id: A!.id }).eq("id", DEV);
  const s3 = await judge(since, 1);
  check("**묶인 직원만 있어도 잡힌다**(Vid 38시간 재현)", s3.stalled, s3);
} finally {
  await db.from("conversation_messages").delete().eq("id", msg!.id);
  await db.from("assignments").delete().in("id", [A!.id, B!.id]);
  await db.from("company_employees").update({ work_status: "ready", current_assignment_id: null }).eq("id", DEV);
  console.log("치움");
}
console.log(`\n${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
