/**
 * **도트가 돌던 판 + 소리 꾸러미를 한 벌로** (228회차 10-01). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/work/sprites/소리붙인앞판.mts
 *
 * 10-01 05:29 판은 **뒷걸음**이었다: 꾸러미 둘을 받고도 `index.html` 이 `type="module"` 이 아니라
 * import 가 아예 안 됐고, 네모(`fillRect`)로만 그렸다. 심판은 그 네모를 보고 "도트 그림으로 보인다" 고
 * **맞음**으로 적었다 — 오늘 처음 나온 **틀린 맞음**이다.
 *
 * 그래서 처음부터 다시 짓게 하지 않는다. **도트가 실제로 돌던 판**(04:57, `drawImage` 2곳) 위에
 * 소리 꾸러미만 얹어 앞 판으로 만든다. 고치는 판은 조각만 — 멀쩡한 것을 다시 쓰게 하지 않는다.
 */
import { readFileSync } from "node:fs";

const 바탕판 = "7e1e756d-1821-42f2-bad1-777e6c2e2ae2";   // 04:57 "그림 꾸러미를 쓰는 판"

const { account } = await import("../../tools/company.mjs");
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();

const { data: 앞, error: pe } = await db.from("deliverables").select("company_id, company_employee_id, assignment_id, work_execution_id, content_json, content_markdown").eq("id", 바탕판).single();
if (pe || !앞) { console.error("바탕 판을 못 찾았다:", pe?.message); process.exit(1); }
const 앞것 = 앞 as { company_id: string; company_employee_id: string; content_json: { files: { path: string; language: string; contents: string }[] } };

const 소리 = readFileSync("engine/work/sprites/sound.js", "utf8");
const 파일들 = [...앞것.content_json.files.filter((f) => f.path !== "js/sound.js"), { path: "js/sound.js", language: "javascript", contents: 소리 }];
console.log("바탕 판 파일:", 앞것.content_json.files.map((f) => f.path).join(", "));
console.log("소리 붙인 뒤:", 파일들.map((f) => `${f.path}(${Math.round(f.contents.length / 1024)}KB)`).join(", "));

const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const owner = users.users.find((u) => u.email === account().ownerEmail)!;
const { data: co } = await db.from("companies").select("id, name").eq("owner_id", owner.id).maybeSingle();

const { data: 업무, error: ae } = await db.from("assignments").insert({
  company_id: 앞것.company_id,
  company_employee_id: 앞것.company_employee_id,
  title: "도트 판 + 소리 꾸러미 (앞 판으로 쓸 한 벌)",
  description: "도트가 실제로 돌던 판에 소리 꾸러미를 얹은 것. 다음 고침의 바탕이 된다.",
  status: "completed", priority: "normal", assignment_type: "manager", assignment_scope: "manager", source_type: "manual",
  assigned_at: new Date().toISOString(), started_at: new Date().toISOString(),
  submitted_at: new Date().toISOString(), completed_at: new Date().toISOString(),
}).select("id").single();
if (ae || !업무) { console.error("업무를 못 만들었다:", ae?.message); process.exit(1); }
const { data: 실행, error: ee } = await db.from("work_executions").insert({
  assignment_id: (업무 as { id: string }).id, company_id: 앞것.company_id,
  company_employee_id: 앞것.company_employee_id, status: "completed", current_step: "completed",
}).select("id").single();
if (ee || !실행) { console.error("실행을 못 만들었다:", ee?.message); process.exit(1); }

const { data: made, error } = await db.from("deliverables").insert({
  company_id: 앞것.company_id,
  company_employee_id: 앞것.company_employee_id,
  assignment_id: (업무 as { id: string }).id,
  work_execution_id: (실행 as { id: string }).id,
  title: "도트 타워 디펜스 + 소리 꾸러미",
  deliverable_type: "app_build",
  content_markdown: "도트가 돌던 판에 소리 꾸러미(`js/sound.js`)를 얹은 한 벌. 다음 고침의 바탕.",
  content_json: { ...앞것.content_json, files: 파일들 },
  status: "submitted", version: 1, submitted_at: new Date().toISOString(),
  generation_model: "(사람이 묶음)", deliverable_scope: "assignment", source_count: 0,
}).select("id").single();
if (error) { console.error("못 넣었다:", error.message); process.exit(1); }

console.log(`\n회사 ${(co as { name: string }).name}`);
console.log(`**앞 판 산출물 id: ${(made as { id: string }).id}**`);
