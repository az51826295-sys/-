/**
 * 일 종류 × 모델 → 통과율·비용 표 (105회차 09-14, 사장님 "판단해서 api 선택할 수 있어?" → "해"). 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/model_choice_table.mts
 *
 * 실행(work_executions) 하나를 줄로 삼는다.
 *   모델   = 그 실행의 model_usage 중 비용이 가장 큰 모델(주 모델). 나머지는 곁다리(접수·요약).
 *   결과   = 유니티 검사(대화 첨부 unityChecks → 결과물) 실패>0 이면 실패 / 자동 판정 FAIL·PARTIAL 이면 실패 / PASS·검사 0 이면 통과.
 *            실행 자체가 failed 면 "실행 실패"(따로 센다 — 인프라일 수 있다).
 *   일 종류 = work_predictions.skill_id, 없으면 직원 slug.
 * 자동 선택을 붙이기 전에, 옮길 만한 자리가 실제로 있는지 이 표로 본다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const { data: ex } = await db.from("work_executions").select("id, assignment_id, company_employee_id, status, created_at").order("created_at");
const execs = (ex ?? []) as { id: string; assignment_id: string | null; company_employee_id: string | null; status: string; created_at: string }[];

// 모델·비용
const { data: mu } = await db.from("model_usage").select("work_execution_id, model, cost_usd, purpose").not("work_execution_id", "is", null);
const costByExec = new Map<string, { total: number; byModel: Map<string, number> }>();
for (const u of (mu ?? []) as { work_execution_id: string; model: string; cost_usd: number; purpose: string }[]) {
  const e = costByExec.get(u.work_execution_id) ?? { total: 0, byModel: new Map() };
  e.total += Number(u.cost_usd);
  e.byModel.set(u.model, (e.byModel.get(u.model) ?? 0) + Number(u.cost_usd));
  costByExec.set(u.work_execution_id, e);
}
const mainModel = (id: string) => {
  const e = costByExec.get(id); if (!e) return null;
  return [...e.byModel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

// 결과 라벨
const { data: dels } = await db.from("deliverables").select("id, work_execution_id, verdict:content_json->verdict->>verdict");
const D = (dels ?? []) as { id: string; work_execution_id: string | null; verdict: string | null }[];
const execOfDel = new Map(D.map((d) => [d.id, d.work_execution_id]));
const label = new Map<string, "pass" | "fail">();
for (const d of D) if (d.work_execution_id && (d.verdict === "PASS" || d.verdict === "FAIL" || d.verdict === "PARTIAL")) label.set(d.work_execution_id, d.verdict === "PASS" ? "pass" : "fail");
const { data: checks } = await db.from("conversation_messages").select("content, created_at, unity:attachments->unityChecks").not("attachments->unityChecks", "is", null).order("created_at");
for (const m of (checks ?? []) as { content: string; unity: { deliverableId?: string } | null }[]) {
  const hit = m.content.match(/통과 (\d+) · (?:실패|떨어짐) (\d+)/); const del = m.unity?.deliverableId;
  const e = del ? execOfDel.get(del) : null;
  if (hit && e) label.set(e, Number(hit[2]) > 0 ? "fail" : "pass");
}

// 일 종류
const { data: preds } = await db.from("work_predictions").select("work_execution_id, skill_id");
const skillOfExec = new Map(((preds ?? []) as { work_execution_id: string | null; skill_id: string }[]).filter((p) => p.work_execution_id).map((p) => [p.work_execution_id!, p.skill_id]));
const { data: ces } = await db.from("company_employees").select("id, employees(slug)");
const slugOfCE = new Map(((ces ?? []) as unknown as { id: string; employees: { slug: string } | null }[]).map((c) => [c.id, c.employees?.slug ?? "?"]));

type Cell = { n: number; pass: number; fail: number; execFail: number; unlabeled: number; cost: number };
const cells = new Map<string, Cell>();
let labeled = 0, withModel = 0;
for (const e of execs) {
  const model = mainModel(e.id); if (!model) continue;
  withModel++;
  const skill = skillOfExec.get(e.id) ?? slugOfCE.get(e.company_employee_id ?? "") ?? "?";
  const key = `${skill}\t${model}`;
  const c = cells.get(key) ?? { n: 0, pass: 0, fail: 0, execFail: 0, unlabeled: 0, cost: 0 };
  c.n++; c.cost += costByExec.get(e.id)?.total ?? 0;
  const l = label.get(e.id);
  if (e.status === "failed") c.execFail++;
  else if (l === "pass") { c.pass++; labeled++; }
  else if (l === "fail") { c.fail++; labeled++; }
  else c.unlabeled++;
  cells.set(key, c);
}
console.log(`실행 ${execs.length} · 모델 장부 있음 ${withModel} · 결과 라벨 있음 ${labeled}`);
console.log("\n일 종류            모델                              실행  통과  실패  실행실패  라벨없음  통과율   평균비용");
const rows = [...cells.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [key, c] of rows) {
  const [skill, model] = key.split("\t");
  const judged = c.pass + c.fail;
  const rate = judged ? `${Math.round((100 * c.pass) / judged)}% (${judged})` : "—";
  console.log(`${skill.padEnd(18)} ${model.padEnd(32)} ${String(c.n).padStart(4)} ${String(c.pass).padStart(5)} ${String(c.fail).padStart(5)} ${String(c.execFail).padStart(8)} ${String(c.unlabeled).padStart(8)}  ${rate.padEnd(9)} $${(c.cost / c.n).toFixed(3)}`);
}
// 같은 일 종류에 모델이 둘 이상이고 둘 다 판정이 있는 자리 = 비교 가능한 자리
const bySkill = new Map<string, [string, Cell][]>();
for (const [key, c] of rows) { const [skill, model] = key.split("\t"); const l = bySkill.get(skill) ?? []; l.push([model, c]); bySkill.set(skill, l); }
console.log("\n비교 가능한 자리(같은 일 종류에 판정 있는 모델 둘 이상):");
let any = false;
for (const [skill, list] of bySkill) {
  const judged = list.filter(([, c]) => c.pass + c.fail > 0);
  if (judged.length < 2) continue;
  any = true;
  console.log(`- ${skill}: ` + judged.map(([m, c]) => `${m} ${c.pass}/${c.pass + c.fail} $${(c.cost / c.n).toFixed(3)}`).join(" vs "));
}
if (!any) console.log("- 없음 — 지금은 일 종류마다 모델이 하나라 비교할 상대가 없다.");
