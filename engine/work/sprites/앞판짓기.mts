/**
 * **지금 판 + 새 꾸러미로 '앞 판' 을 짓는다** (228회차 10-01). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/work/sprites/앞판짓기.mts <바탕산출물id>
 *
 * 꾸러미(`js/sprites.js`·`js/sound.js`)만 최신으로 갈아 끼운 한 벌을 만들어 다음 고침의 바탕으로 쓴다.
 * 게임 코드는 **그대로** 둔다 — 고칠 것이 있으면 다음 판에서 조각만 고치게 한다.
 */
import { readFileSync } from "node:fs";

const 바탕판 = process.argv[2];
if (!바탕판) { console.error("바탕 산출물 id 를 줘라"); process.exit(1); }

const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();

const { data: 앞, error: pe } = await db.from("deliverables").select("company_id, company_employee_id, content_json").eq("id", 바탕판).single();
if (pe || !앞) { console.error("바탕 판을 못 찾았다:", pe?.message); process.exit(1); }
const 앞것 = 앞 as { company_id: string; company_employee_id: string; content_json: { files: { path: string; language: string; contents: string }[] } };

const 새꾸러미: Record<string, string> = {
  "js/sprites.js": readFileSync("engine/work/sprites/sprites.js", "utf8"),
  "js/sound.js": readFileSync("engine/work/sprites/sound.js", "utf8"),
};
const 파일들 = 앞것.content_json.files.map((f) => (새꾸러미[f.path] ? { ...f, contents: 새꾸러미[f.path] } : f));
for (const [p, c] of Object.entries(새꾸러미)) if (!파일들.some((f) => f.path === p)) 파일들.push({ path: p, language: "javascript", contents: c });
console.log("파일:", 파일들.map((f) => `${f.path}(${Math.round(f.contents.length / 1024)}KB)${새꾸러미[f.path] ? " ←새것" : ""}`).join(", "));

const { data: 업무, error: ae } = await db.from("assignments").insert({
  company_id: 앞것.company_id, company_employee_id: 앞것.company_employee_id,
  title: "도트 판 + 새 꾸러미 (앞 판으로 쓸 한 벌)",
  description: "그림·소리 꾸러미만 최신으로 갈아 끼운 한 벌. 다음 고침의 바탕이 된다.",
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
  company_id: 앞것.company_id, company_employee_id: 앞것.company_employee_id,
  assignment_id: (업무 as { id: string }).id, work_execution_id: (실행 as { id: string }).id,
  title: "도트 타워 디펜스 + 규격 맞춘 꾸러미",
  deliverable_type: "app_build",
  content_markdown: "그림·소리 꾸러미를 규격 맞춘 것으로 갈아 끼운 한 벌. 다음 고침의 바탕.",
  content_json: { ...앞것.content_json, files: 파일들 },
  status: "submitted", version: 1, submitted_at: new Date().toISOString(),
  generation_model: "(사람이 묶음)", deliverable_scope: "assignment", source_count: 0,
}).select("id").single();
if (error) { console.error("못 넣었다:", error.message); process.exit(1); }
console.log(`\n**앞 판 산출물 id: ${(made as { id: string }).id}**`);
