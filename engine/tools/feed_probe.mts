/**
 * **무인 결과 붙이기가 일의 완료와 얽히지 않는가** (202회차 09-21).
 * 사장님 조건 2: *"산출물을 붙이는 게 releaseEmployee 를 부르는 경로와 얽히면, 어제 푼 매듭이 다른 모양으로 돌아와요.
 * 아무도 안 열어 봐도 다음 일이 도는지 자로 확인해 두세요."*
 *   npx tsx engine/tools/rookery_env.mts engine/tools/feed_probe.mts    — 모델 0, 돈 0
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { releaseEmployee } = await import("../../src/lib/assignments/service");
const { feedConversation, postUnattendedFeed } = await import("../../src/lib/genesis/unattendedFeed");
const db = createServiceClient();
const CO = "00add05a-e81d-4e04-9980-34bb412a8780", DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83";
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

const { data: live } = await db.from("assignments").select("id,status").eq("company_employee_id", DEV).in("status",["assigned","queued","working","waiting","submitted","failed"]);
if (live?.length) { console.error("Dev 에 살아 있는 업무가 있다:", JSON.stringify(live)); process.exit(1); }

const base = { company_id: CO, company_employee_id: DEV, description: "붙이기 시험", priority: "normal", role_input_schema_id: "small_app_assignment_v1" };
const { data: A } = await db.from("assignments").insert({ ...base, title: "[시험] 무인 산출물", status: "submitted", role_input_json: { unattended: true } }).select("id").single();
const { data: B } = await db.from("assignments").insert({ ...base, title: "[시험] 뒤에 줄 선 일", status: "waiting", role_input_json: { unattended: true }, assigned_at: new Date().toISOString() }).select("id").single();
await db.from("company_employees").update({ work_status: "awaiting_review", current_assignment_id: A!.id }).eq("id", DEV);
const { data: ex } = await db.from("work_executions").insert({ company_id: CO, assignment_id: A!.id, company_employee_id: DEV, status: "completed", current_step: "completed", attempt_number: 1 }).select("id").single();
const { data: D } = await db.from("deliverables").insert({
  company_id: CO, assignment_id: A!.id, company_employee_id: DEV, work_execution_id: ex!.id,
  title: "[시험] 무인 산출물", deliverable_type: "app_build", content_markdown: "시험", status: "submitted", version: 1, source_count: 0,
  content_json: { files: [{ path: "index.html", language: "html", contents: "<html></html>" }], loop: { rounds: [{ n: 1, met: 3, unmet: 0, broken: 0 }], verdict: { toPerson: "확인 목록을 통과했어요" } } },
}).select("id").single();
try {
  // ① 붙는가, 한 턴인가
  const n = await postUnattendedFeed(db, (m)=>console.log("  로그:", m));
  check("무인 산출물이 붙는다", n >= 1, n);
  const convId = await feedConversation(db, CO);
  const { data: msgs } = await db.from("conversation_messages").select("content, attachments").eq("conversation_id", convId!).not("attachments->unattended","is",null);
  const real = (msgs ?? []).filter((m)=>String(m.content).length > 0);
  check("한 턴으로 묶인다(쌓이지 않는다)", real.length === 1, real.length);
  check("통과한 것이 펴져 있다", /✅/.test(String(real[0]?.content ?? "")), String(real[0]?.content ?? "").slice(0,80));
  // ② **얽히지 않는가** — 붙인 뒤에도 쓸기가 풀고 다음 일이 도는가
  const att = (real[0]?.attachments ?? {}) as Record<string, unknown>;
  check("붙인 턴에 assignment 가 **없다**(쓸기가 계속 푼다)", !("assignment" in att), Object.keys(att));
  const { data: blocked } = await db.from("conversation_messages").select("id").eq("attachments->assignment->>id", A!.id).limit(1).maybeSingle();
  check("쓸기가 보는 조건으로도 안 걸린다", !blocked, blocked);
  const r = await releaseEmployee(db, DEV, A!.id);
  check("**붙였어도 일이 풀린다**", r.released.includes(A!.id), r);
  check("**다음 일이 시작된다**", r.started === B!.id, r);
  // ③ 두 번 안 붙는다
  const n2 = await postUnattendedFeed(db, ()=>{});
  check("같은 것을 두 번 안 붙인다", n2 === 0, n2);
} finally {
  const convId = await feedConversation(db, CO);
  if (convId) await db.from("conversation_messages").delete().eq("conversation_id", convId).not("attachments->unattended","is",null);
  await db.from("deliverables").delete().eq("id", D!.id);
  await db.from("work_executions").delete().in("assignment_id", [A!.id, B!.id]);
  await db.from("assignments").delete().in("id", [A!.id, B!.id]);
  await db.from("company_employees").update({ work_status: "ready", current_assignment_id: null }).eq("id", DEV);
  console.log("치움");
}
console.log(`\n${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
