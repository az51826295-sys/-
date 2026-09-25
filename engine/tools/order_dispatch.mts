/** 접수가 고른 능력으로 업무를 만든다 — 위임(delegate)과 같은 결과를 서비스 클라이언트로(219회차). delegate 는 쿠키 클라이언트라 도구에서 못 부른다. */
import type { SupabaseClient } from "@supabase/supabase-js";
const { capabilityCatalogue } = await import("../../src/lib/chat/routing");
const { employeeDefinitions } = await import("../../src/lib/employees/definitions");
const { ensureKnowledgeProfile } = await import("../../src/lib/chat/delegate");
const { releaseEmployee } = await import("../../src/lib/assignments/service");
const NL = String.fromCharCode(10);
export async function dispatchOrder(db: SupabaseClient, CO: string, capabilityId: string, ask: string, ownerId: string): Promise<{ assignmentId: string; hired: string | null; employee: string }> {
  const cap = capabilityCatalogue().find((c) => c.capabilityId === capabilityId);
  if (!cap) throw new Error("모르는 능력 " + capabilityId);
  const def = employeeDefinitions.find((e) => e.skillId === cap.skillId);
  if (!def) throw new Error("이 능력을 가진 직원 정의가 없다: " + cap.skillId);
  const { data: emp } = await db.from("employees").select("id, name").eq("slug", def.slug).maybeSingle();
  if (!emp) throw new Error("employees 표에 " + def.slug + " 이 없다");
  let { data: ce } = await db.from("company_employees").select("id").eq("company_id", CO).eq("employee_id", emp.id).maybeSingle();
  let hired: string | null = null;
  if (!ce) { const { data: made } = await db.from("company_employees").insert({ company_id: CO, employee_id: emp.id, onboarding_status: "completed", work_status: "ready" }).select("id").single(); ce = made; hired = emp.name as string; }
  await ensureKnowledgeProfile(db, CO, ce!.id as string);
  await releaseEmployee(db, ce!.id as string);
  const title = ask.split(NL)[0].replace(/[.。!]$/, "").slice(0, 100);
  const { data: conv } = await db.from("conversations").insert({ owner_id: ownerId, title: "[데이터 수집] " + title.slice(0, 50) }).select("id").single();
  const { data: a, error } = await db.from("assignments").insert({
    company_id: CO, company_employee_id: ce!.id, title, description: ask, status: "queued", priority: "normal",
    source_type: "manual", assignment_type: "manager", assignment_scope: "manager",
    role_input_schema_id: def.assignmentInputSchemaId, role_input_json: { capabilityId, collected: true },
  }).select("id").single();
  if (error || !a) throw new Error("업무 못 만듦: " + (error?.message ?? "?"));
  if (conv) await db.from("conversation_messages").insert([
    { conversation_id: conv.id, role: "user", content: ask },
    { conversation_id: conv.id, role: "assistant", content: `${emp.name} 에게 맡겼어요. 끝나면 여기 붙여 드릴게요.`, attachments: { assignment: { id: a.id, title, queued: true } } },
  ]);
  await db.from("work_executions").insert({ company_id: CO, assignment_id: a.id, company_employee_id: ce!.id, status: "queued", current_step: "context_loaded", attempt_number: 1 });
  return { assignmentId: a.id as string, hired, employee: emp.name as string };
}
