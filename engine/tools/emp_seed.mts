/** 정의에는 있는데 employees 표에 없는 직원 행을 넣고, 사장님 회사에 뽑는다(214회차 Deck). emp_seed <slug> */
const { account } = await import("./company.mts");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { employeeDefinitions } = await import("../../src/lib/employees/definitions");
const db = createServiceClient();
const slug = process.argv[2]; const def = employeeDefinitions.find((e) => e.slug === slug);
if (!def) { console.error("정의 없음:", slug); process.exit(1); }
let { data: row } = await db.from("employees").select("id").eq("slug", slug).maybeSingle();
if (!row) {
  const { data: made, error } = await db.from("employees").insert({ slug, name: def.name, role: def.role, description: def.summary, responsibilities: def.responsibilities, salary: 0, status: "available" }).select("id").single();
  if (error) { console.error("못 넣음:", error.message); process.exit(1); } row = made; console.log("employees 행 넣음", def.name);
} else console.log("employees 행 이미 있음");
const CO = account().companyId;   // 222회차: 개발 계정(ROOKERY_ACCOUNT=owner 면 사장님 회사)
const { data: ce } = await db.from("company_employees").select("id").eq("company_id", CO).eq("employee_id", row!.id).maybeSingle();
if (!ce) { const { error } = await db.from("company_employees").insert({ company_id: CO, employee_id: row!.id, onboarding_status: "completed", work_status: "ready" }); console.log(error ? "회사에 못 뽑음: " + error.message : "사장님 회사에 뽑음"); } else console.log("이미 뽑혀 있음");
// 아는 것 없이 일하러 보내지 않는다 — 위임(delegate.ts)과 같은 절차. 없으면 문맥 읽기에서 "missing: Company summary…" 로 죽는다(214회차 Deck 첫 판).
const { ensureKnowledgeProfile } = await import("../../src/lib/chat/delegate");
const { data: ce2 } = await db.from("company_employees").select("id").eq("company_id", CO).eq("employee_id", row!.id).maybeSingle();
await ensureKnowledgeProfile(db, CO, ce2!.id as string);
console.log("지식 카드 채움");
