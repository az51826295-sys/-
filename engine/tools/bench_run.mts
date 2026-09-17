/**
 * 고정 시험판 v0 돌리기 (111회차 09-14).
 *   계획만(돈 0):  npx tsx engine/tools/rookery_env.mts engine/tools/bench_run.mts --label rules-on
 *   실제 실행:     GENESIS_SPEND=i-approve npx tsx engine/tools/rookery_env.mts engine/tools/bench_run.mts --run --label rules-on [--rules off] [--only b0-05,b0-06]
 *
 * `engine/docs/bench-v0.json` 의 과제를 **시험판 전용 회사**(사장님 회사와 분리, 지식 0)에 실제 업무로 넣고, 실서버 워커가 돌리게 한 뒤
 * 결과물의 자동 검사(verdict)와 비용을 모아 `engine/docs/bench-runs/<runId>.json` 에 적는다. 같은 과제를 규칙/모델을 바꿔 가며 다시 돌려
 * **인과**를 재는 자리다(110회차: 관측만으로는 인과가 안 나온다).
 *   --rules on   사장님 회사의 검증된 규칙(learning_candidate_id 있는 활성 지식)을 시험판 회사에 복사해 넣고 돌린다
 *   --rules off  시험판 회사 지식을 비운다(기본)
 * 직원 한 명당 살아 있는 업무는 하나라(assignments_one_active_per_employee) 직원별로 한 과제씩 차례로 넣는다. Ana·Vid 는 나란히.
 * 한 바퀴 옛 실측 $0.86. 과제는 얼려 있고 여기서 바꾸지 않는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { releaseEmployee } = await import("../../src/lib/assignments/service");

type Task = { id: string; employee: string; type: string; title: string; description: string; assignment: Record<string, unknown>; historical: { verdict: string | null; checks: { name: string; result: string }[]; costUsd: number } };
const bench = JSON.parse(readFileSync("engine/docs/bench-v0.json", "utf8")) as { version: string; tasks: Task[] };
const argv = process.argv;
const RUN = argv.includes("--run");
const label = argv[argv.indexOf("--label") + 1] ?? "unlabeled";
const rules = argv.includes("--rules") ? argv[argv.indexOf("--rules") + 1] : "off";
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1].split(",") : null;
const tasks = bench.tasks.filter((t) => !only || only.includes(t.id));
const db = createServiceClient();

// 시험판 회사 — 한 번 만들고 계속 쓴다. 사장님 회사와 다른 주인.
const BENCH_EMAIL = "bench@rookery.local";
async function benchCompany(): Promise<{ companyId: string; hires: Map<string, string> }> {
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  let uid = users.users.find((u) => u.email === BENCH_EMAIL)?.id;
  if (!uid) { const { data, error } = await db.auth.admin.createUser({ email: BENCH_EMAIL, password: `bench-${Math.random().toString(36).slice(2)}!`, email_confirm: true }); if (error) throw error; uid = data.user.id; }
  let { data: co } = await db.from("companies").select("id").eq("owner_id", uid).maybeSingle();
  if (!co) { const { data, error } = await db.from("companies").insert({ owner_id: uid, name: "시험판 v0" }).select("id").single(); if (error) throw error; co = data; }
  const companyId = co.id as string;
  const { data: emps } = await db.from("employees").select("id, slug");
  const bySlug = new Map(((emps ?? []) as { id: string; slug: string }[]).map((e) => [e.slug, e.id]));
  const hires = new Map<string, string>();
  for (const slug of new Set(tasks.map((t) => t.employee))) {
    const empId = bySlug.get(slug); if (!empId) throw new Error(`직원 없음: ${slug}`);
    const { data: h } = await db.from("company_employees").select("id").eq("company_id", companyId).eq("employee_id", empId).maybeSingle();
    if (h) { hires.set(slug, h.id as string); continue; }
    const { data: made, error } = await db.from("company_employees").insert({ company_id: companyId, employee_id: empId, onboarding_status: "completed" }).select("id").single();
    if (error) throw error; hires.set(slug, made.id as string);
  }
  // 직원 지식 프로필 — 대화가 사람을 뽑을 때(delegate.ensureProfile) 같이 심는 것. 없으면 실행이 CONTEXT_INCOMPLETE 로 20초 만에 죽는다
  // (첫 실제 판 8/8 그렇게 죽었다, $0). 사장님 회사와 같은 모양으로, 내용은 중립.
  const NOT_TOLD = "매니저가 아직 말하지 않았습니다. 짐작하지 말고, 모르는 것은 모른다고 적고, 필요하면 결과에 물음을 남기십시오. 대화에서 알게 되면 다음 일에 반영됩니다.";
  for (const ce of hires.values()) {
    const { data: have } = await db.from("employee_knowledge_profiles").select("company_employee_id").eq("company_employee_id", ce).maybeSingle();
    if (have) continue;
    await db.from("employee_knowledge_profiles").insert({
      company_employee_id: ce, company_summary: `회사 이름: 시험판 v0 — 유니티 3D 게임을 만드는 작은 회사(고정 시험판 전용)\n\n${NOT_TOLD}`,
      customer_summary: NOT_TOLD, problem_summary: NOT_TOLD, differentiation_summary: null, competitors: [], priorities: [], additional_context: null, role_knowledge_json: null,
    });
  }
  return { companyId, hires };
}

const { companyId, hires } = await benchCompany();
console.log(`시험판 회사 ${companyId.slice(0, 8)} · 직원 ${[...hires.keys()].join(",")} · 과제 ${tasks.length} · 규칙 ${rules} · 표시 "${label}"`);

// 규칙 켜기/끄기
{
  await db.from("organization_knowledge").delete().eq("company_id", companyId);
  if (rules === "on") {
    const { data: owner } = await db.from("companies").select("id").neq("id", companyId).order("created_at").limit(1).maybeSingle();
    const { data: k } = await db.from("organization_knowledge").select("title, description, category").eq("company_id", owner?.id ?? "").eq("status", "active").not("learning_candidate_id", "is", null);
    for (const r of (k ?? []) as { title: string; description: string; category: string }[]) await db.from("organization_knowledge").insert({ company_id: companyId, title: r.title, description: r.description, category: r.category, status: "active" });
    console.log(`규칙 ${k?.length ?? 0}개 복사해 넣음`);
  }
}

if (!RUN || process.env.GENESIS_SPEND !== "i-approve") {
  console.log("\n계획(돈 0) — --run 과 GENESIS_SPEND=i-approve 가 있어야 실제로 돈다:");
  for (const t of tasks) console.log(`  ${t.id} ${t.employee} · 옛 ${t.historical.verdict} · 검사 ${t.historical.checks.length} · 옛 값 $${t.historical.costUsd.toFixed(3)} · ${t.title.slice(0, 60)}`);
  console.log(`  한 바퀴 예상 $${tasks.reduce((s, t) => s + t.historical.costUsd, 0).toFixed(2)} 안팎`);
  process.exit(0);
}

const runId = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${label}`;
type Row = { id: string; employee: string; title: string; historical: string | null; verdict: string | null; passed: number; total: number; costUsd: number; ms: number; error?: string };
const rows: Row[] = [];

async function runTask(t: Task): Promise<Row> {
  const ce = hires.get(t.employee)!;
  const t0 = Date.now();
  await releaseEmployee(db, ce);
  const { data: a, error } = await db.from("assignments").insert({
    company_id: companyId, company_employee_id: ce, title: t.title, description: t.description, status: "assigned",
    priority: t.assignment.priority, role_input_json: { ...(t.assignment.role_input_json as Record<string, unknown>), bench: { version: bench.version, task: t.id, run: runId } },
    role_input_schema_id: t.assignment.role_input_schema_id, source_type: t.assignment.source_type, assignment_type: t.assignment.assignment_type, assignment_scope: t.assignment.assignment_scope,
  }).select("id").single();
  if (error || !a) return { id: t.id, employee: t.employee, title: t.title, historical: t.historical.verdict, verdict: null, passed: 0, total: 0, costUsd: 0, ms: 0, error: error?.message ?? "업무 못 만듦" };
  const { data: ex, error: e2 } = await db.from("work_executions").insert({ company_id: companyId, assignment_id: a.id, company_employee_id: ce, status: "queued", current_step: "context_loaded", attempt_number: 1 }).select("id").single();
  if (e2 || !ex) return { id: t.id, employee: t.employee, title: t.title, historical: t.historical.verdict, verdict: null, passed: 0, total: 0, costUsd: 0, ms: 0, error: e2?.message ?? "실행 못 만듦" };
  await db.from("assignments").update({ status: "queued" }).eq("id", a.id);
  console.log(`  → ${t.id} ${t.employee} 넣음(${(a.id as string).slice(0, 8)}) — 워커가 집기를 기다림`);
  // 워커가 끝낼 때까지 (최대 25분)
  let status = "queued";
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const { data: s } = await db.from("work_executions").select("status, current_step").eq("id", ex.id).single();
    status = (s?.status as string) ?? status;
    if (status === "completed" || status === "failed" || status === "cancelled") break;
  }
  const { data: d } = await db.from("deliverables").select("verdict:content_json->verdict").eq("assignment_id", a.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const v = (d?.verdict ?? null) as { verdict?: string; cases?: { result: string }[] } | null;
  const { data: mu } = await db.from("model_usage").select("cost_usd").eq("work_execution_id", ex.id);
  const costUsd = ((mu ?? []) as { cost_usd: number }[]).reduce((s, u) => s + Number(u.cost_usd), 0);
  const cases = v?.cases ?? [];
  await releaseEmployee(db, ce);
  return { id: t.id, employee: t.employee, title: t.title, historical: t.historical.verdict, verdict: v?.verdict ?? (status === "completed" ? "(판정 없음)" : status), passed: cases.filter((c) => c.result === "Passed").length, total: cases.length, costUsd: Number(costUsd.toFixed(3)), ms: Date.now() - t0 };
}

// 직원별로 차례, 직원끼리는 나란히
await Promise.all([...new Set(tasks.map((t) => t.employee))].map(async (slug) => {
  for (const t of tasks.filter((x) => x.employee === slug)) { const r = await runTask(t); rows.push(r); console.log(`  ✓ ${r.id} ${r.verdict} · ${r.passed}/${r.total} · $${r.costUsd} · ${Math.round(r.ms / 1000)}초${r.error ? " · 오류 " + r.error : ""}`); }
}));

rows.sort((x, y) => x.id.localeCompare(y.id));
mkdirSync("engine/docs/bench-runs", { recursive: true });
const out = { runId, label, rules, at: new Date().toISOString(), version: bench.version, rows };
writeFileSync(`engine/docs/bench-runs/${runId}.json`, JSON.stringify(out, null, 2) + "\n", "utf8");
const pass = rows.filter((r) => r.verdict === "PASS").length;
console.log(`\n== ${runId} · 규칙 ${rules} · 통과 ${pass}/${rows.length} · 검사 ${rows.reduce((s, r) => s + r.passed, 0)}/${rows.reduce((s, r) => s + r.total, 0)} · $${rows.reduce((s, r) => s + r.costUsd, 0).toFixed(2)}`);
for (const r of rows) console.log(`${r.id} ${r.employee.padEnd(4)} 옛 ${String(r.historical).padEnd(7)} → ${String(r.verdict).padEnd(9)} ${String(r.passed).padStart(2)}/${String(r.total).padEnd(2)} $${r.costUsd.toFixed(3)} ${r.title.slice(0, 50)}`);
