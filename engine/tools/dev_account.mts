/**
 * 개발 계정 만들기 (222회차 09-25). 한 번 만들고 계속 쓴다 — 다시 돌리면 있는 것을 확인만 한다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/dev_account.mts [--limit 7] [--days 30]
 * 하는 것: 사용자 dev@rookery.local(비밀번호는 무작위, 아무도 모름 — 화면에서 보려면 매직 링크) → 회사 "로키 개발" + 한도 → 직원 전부 채용 + 지식 카드 → engine/work/dev-company.json.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { employeeDefinitions } = await import("../../src/lib/employees/definitions");
const { ensureKnowledgeProfile } = await import("../../src/lib/chat/delegate");
const { DEV_EMAIL } = await import("./company.mts");
const { writeFileSync, mkdirSync } = await import("node:fs");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const LIMIT = Number(arg("--limit") ?? 7), DAYS = Number(arg("--days") ?? 30);
const db = createServiceClient();
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
let uid = users.users.find((u) => u.email === DEV_EMAIL)?.id;
if (!uid) { const { data, error } = await db.auth.admin.createUser({ email: DEV_EMAIL, password: `dev-${crypto.randomUUID()}`, email_confirm: true }); if (error) throw error; uid = data.user.id; console.log("사용자 만듦", DEV_EMAIL); } else console.log("사용자 있음", DEV_EMAIL);
let { data: co } = await db.from("companies").select("id, spend_limit_usd, spend_window_days").eq("owner_id", uid).maybeSingle();
if (!co) { const { data, error } = await db.from("companies").insert({ owner_id: uid, name: "로키 개발", timezone: "Asia/Seoul", spend_limit_usd: LIMIT, spend_window_days: DAYS, billing_mode: "limit" }).select("id, spend_limit_usd, spend_window_days").single(); if (error) throw error; co = data; console.log("회사 만듦 로키 개발"); } else console.log("회사 있음");
const CO = co.id as string;
console.log(`한도 $${co.spend_limit_usd}/${co.spend_window_days}일`);
// 직원 전부 — 정의에 있는데 employees 표에 없으면 넣고, 뽑고, 지식 카드
let hired = 0;
for (const def of employeeDefinitions) {
  let { data: row } = await db.from("employees").select("id").eq("slug", def.slug).maybeSingle();
  if (!row) { const { data: made, error } = await db.from("employees").insert({ slug: def.slug, name: def.name, role: def.role, description: def.summary, responsibilities: def.responsibilities, salary: 0, status: "available" }).select("id").single(); if (error) { console.log("employees 행 못 넣음", def.slug, error.message); continue; } row = made; }
  const { data: ce } = await db.from("company_employees").select("id").eq("company_id", CO).eq("employee_id", row!.id).maybeSingle();
  let ceId = ce?.id as string | undefined;
  if (!ceId) { const { data: made, error } = await db.from("company_employees").insert({ company_id: CO, employee_id: row!.id, onboarding_status: "completed", work_status: "ready" }).select("id").single(); if (error) { console.log("못 뽑음", def.slug, error.message); continue; } ceId = made.id as string; hired++; }
  await ensureKnowledgeProfile(db, CO, ceId);
}
console.log(`직원 ${employeeDefinitions.length}명 (새로 뽑음 ${hired}) · 지식 카드 채움`);
mkdirSync("engine/work", { recursive: true });
writeFileSync("engine/work/dev-company.json", JSON.stringify({ companyId: CO, ownerEmail: DEV_EMAIL, madeAt: new Date().toISOString() }, null, 2), "utf8");
console.log(`개발 계정: 회사 ${CO} → engine/work/dev-company.json`);
