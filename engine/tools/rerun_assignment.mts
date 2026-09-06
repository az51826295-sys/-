// 대기열에 든 채 죽은 업무를 스케줄러 방식으로 다시 돌린다(서비스 클라이언트, 세션 없음).
// 09-06 19:26 DB 가 멈춘 사이 startExecution 호출이 사라져 실행이 queued 로 남았고,
// 브라우저 세션도 끊겨 대화창에서 다시 시킬 수 없었다.
// 실행: npx tsx engine/tools/rerun_assignment.mts <assignmentId>
import fs from "node:fs";

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
for (const raw of fs.readFileSync(".env.local", "utf8").split(NL)) {
  const l = raw.replace(CR, "");
  const i = l.indexOf("=");
  if (i < 0 || l.startsWith("#")) continue;
  const k = l.slice(0, i).trim();
  if (!(k in process.env)) process.env[k] = l.slice(i + 1).trim();
}

const [{ createServiceClient }, { executeEmployeeAssignment }, { defaultProviders }] = await Promise.all([
  import("@/lib/supabase/service"),
  import("@/lib/execution/engine"),
  import("@/lib/execution/shared"),
]);

const assignmentId = process.argv[2];
if (!assignmentId) throw new Error("assignmentId");
const db = createServiceClient();
const { data: a } = await db.from("assignments").select("id, company_id, company_employee_id, status").eq("id", assignmentId).single();
if (!a) throw new Error("업무 없음");
const { data: active } = await db.from("work_executions").select("id").eq("assignment_id", assignmentId).in("status", ["queued", "running"]).maybeSingle();
if (active) throw new Error("이미 도는 실행: " + active.id);
const { data: prev } = await db.from("work_executions").select("attempt_number").eq("assignment_id", assignmentId).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
const { data: created, error } = await db.from("work_executions").insert({
  company_id: a.company_id,
  assignment_id: assignmentId,
  company_employee_id: a.company_employee_id,
  status: "queued",
  current_step: "context_loaded",
  attempt_number: ((prev?.attempt_number as number | undefined) ?? 0) + 1,
}).select("id").single();
if (error || !created) throw new Error("실행 행 못 만듦: " + error?.message);
await db.from("assignments").update({ status: "queued", last_execution_id: created.id, failure_reason: null }).eq("id", assignmentId);
await db.from("company_employees").update({ work_status: "working", current_assignment_id: assignmentId }).eq("id", a.company_employee_id);
console.log(new Date().toISOString().slice(11, 19), "실행", created.id);
const r = await executeEmployeeAssignment(created.id as string, defaultProviders(), db);
console.log(new Date().toISOString().slice(11, 19), r);
