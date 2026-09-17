/**
 * 고정 시험판 v0 얼리기 (111회차 09-14). 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/bench_freeze.mts
 * 서버가 스스로 검사할 수 있는 실제 과제(분석 Ana·영상 Vid, 검사 6~43줄)를 골라 업무 행을 그대로 `engine/docs/bench-v0.json` 에 얼린다.
 * 유니티 과제는 사장님 PC 의 유니티가 있어야 재서 뺐고, 3D 자산은 검사가 0줄이라 뺐다.
 * 얼린 뒤엔 손대지 않는다 — 판정식은 고르기 전에 얼린다(선별 세션 규칙).
 */
import { writeFileSync } from "node:fs";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
// 결과물 id 앞 8자 — 109회차 목록에서 고름. 분석 4 + 영상 4(되풀이 판 제외).
const PICK = ["b9cb8c43", "701621cc", "b8253e22", "bc41e29b", "0d249928", "d9d2f1b6", "aa8878c6", "2daaf9c7"];

const { data: dels } = await db.from("deliverables").select("id, title, deliverable_type, assignment_id, work_execution_id, company_employee_id, created_at, verdict:content_json->verdict").not("content_json->verdict", "is", null);
const D = ((dels ?? []) as { id: string; title: string; deliverable_type: string; assignment_id: string; work_execution_id: string | null; company_employee_id: string; created_at: string; verdict: { verdict?: string; cases?: { name: string; result: string; message?: string }[] } }[])
  .filter((d) => PICK.includes(d.id.slice(0, 8)));
const { data: as } = await db.from("assignments").select("id, title, description, priority, role_input_json, role_input_schema_id, source_type, assignment_type, assignment_scope, company_employee_id").in("id", D.map((d) => d.assignment_id));
const A = new Map(((as ?? []) as Record<string, unknown>[]).map((a) => [a.id as string, a]));
const { data: ces } = await db.from("company_employees").select("id, employees(slug, name)").in("id", D.map((d) => d.company_employee_id));
const E = new Map(((ces ?? []) as unknown as { id: string; employees: { slug: string; name: string } | null }[]).map((c) => [c.id, c.employees]));
const { data: mu } = await db.from("model_usage").select("work_execution_id, cost_usd").in("work_execution_id", D.map((d) => d.work_execution_id).filter(Boolean) as string[]);
const cost = new Map<string, number>();
for (const u of (mu ?? []) as { work_execution_id: string; cost_usd: number }[]) cost.set(u.work_execution_id, (cost.get(u.work_execution_id) ?? 0) + Number(u.cost_usd));

const tasks = D.sort((x, y) => PICK.indexOf(x.id.slice(0, 8)) - PICK.indexOf(y.id.slice(0, 8))).map((d, i) => {
  const a = A.get(d.assignment_id)!;
  const rij = (a.role_input_json ?? {}) as Record<string, unknown>;
  delete rij.previousDeliverableId; delete rij.autoRetry; // 되풀이 판은 시험판에서 독립 과제다
  return {
    id: `b0-${String(i + 1).padStart(2, "0")}`,
    employee: E.get(d.company_employee_id)?.slug ?? "?",
    type: d.deliverable_type,
    title: a.title,
    description: a.description,
    assignment: { priority: a.priority ?? "normal", role_input_json: rij, role_input_schema_id: a.role_input_schema_id ?? null, source_type: a.source_type ?? "manual", assignment_type: a.assignment_type ?? "manager", assignment_scope: a.assignment_scope ?? "manager" },
    historical: { deliverableId: d.id, at: d.created_at, verdict: d.verdict?.verdict ?? null, checks: (d.verdict?.cases ?? []).map((c) => ({ name: c.name, result: c.result })), costUsd: Number((cost.get(d.work_execution_id ?? "") ?? 0).toFixed(3)) },
  };
});
const out = { version: "v0", frozenAt: new Date().toISOString(), note: "서버가 스스로 검사하는 과제만. 얼린 뒤 손대지 않는다. 바꾸면 v1.", tasks };
writeFileSync("engine/docs/bench-v0.json", JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`얼림 ${tasks.length}개 → engine/docs/bench-v0.json`);
for (const t of tasks) console.log(`${t.id} ${t.employee.padEnd(4)} ${t.type.padEnd(8)} 검사 ${String(t.historical.checks.length).padStart(2)} · 옛 판정 ${t.historical.verdict} · $${t.historical.costUsd.toFixed(3)} · ${String(t.title).slice(0, 60)}`);
console.log("한 바퀴 값(옛 실측 합): $" + tasks.reduce((s, t) => s + t.historical.costUsd, 0).toFixed(2));
