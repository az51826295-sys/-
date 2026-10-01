/**
 * **그림 꾸러미를 '앞 판' 으로 만들어 둔다** (228회차 10-01). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/work/sprites/꾸러미넣기.mts
 *
 * 판을 지을 때 `--prev <산출물id>` 로 앞 판을 주면, 고리는 그 파일들을 들고 시작하고
 * **직원이 손대지 않은 파일은 그대로 남는다**(`appBuild/index.ts` 의 "손대지 않는 파일").
 * 그 길을 그대로 써서, **그림 꾸러미 한 파일만 담긴 앞 판**을 만들어 둔다.
 *
 * 새 기능을 만들지 않고 있는 길을 쓰는 이유: 이번에 알고 싶은 것은 "도트가 게임에 들어가나" 이지
 * "새 배관이 도나" 가 아니다. 배관을 새로 깔면 무엇이 값을 했는지 못 가른다.
 */
import { readFileSync } from "node:fs";

const { account } = await import("../../tools/company.mjs");
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();

const js = readFileSync("engine/work/sprites/sprites.js", "utf8");
const 소리 = readFileSync("engine/work/sprites/sound.js", "utf8");
const 키들 = [...js.matchAll(/^\s{2}(\w+):\s"data:image/gm)].map((m) => m[1]);
if (!키들.length) { console.error("꾸러미에서 키를 못 찾았다 — 만들기.mts 를 먼저"); process.exit(1); }

const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const owner = users.users.find((u) => u.email === account().ownerEmail);
if (!owner) throw new Error("계정을 못 찾음: " + account().ownerEmail);
const { data: co } = await db.from("companies").select("id, name").eq("owner_id", owner.id).maybeSingle();
if (!co) throw new Error("회사를 못 찾음");
const { data: emp } = await db.from("employees").select("id").eq("slug", "dev").maybeSingle();
const { data: ce } = await db.from("company_employees").select("id").eq("company_id", co.id).eq("employee_id", emp!.id).maybeSingle();
if (!ce) throw new Error("Dev 가 이 회사에 없음");

const content = {
  target: "web",
  stage: "assets",
  criteria: [],
  humanGate: [],
  files: [
    { path: "js/sprites.js", language: "javascript", contents: js },
    { path: "js/sound.js", language: "javascript", contents: 소리 },
  ],
  howToRun: "이 두 파일은 그림·소리 꾸러미다. 게임에서 import 해서 쓴다.",
  coverage: [],
  note: `도트 조각 ${키들.length}장 + 소리 열 가지를 담은 꾸러미다. 게임이 이걸 import 해서 그리고 울린다.`,
};
const markdown = [
  `## 도트 조각 꾸러미 (${키들.length}장)`, "",
  "게임이 쓸 그림을 글자로 담은 파일 하나다. 판은 바깥 요청이 막힌 창에서 돌아서 주소로는 못 불러온다.", "",
  "| 키 | 무엇 |", "|---|---|",
  ...키들.map((k) => `| \`${k}\` | ${k.startsWith("enemy") ? "적" : "타워"} 48×48 |`),
  "", "```js", "import { SPRITES, sprite, spritesReady } from './sprites.js';", "ctx.drawImage(sprite('enemy_fast'), x - 24, y - 24, 48, 48);", "```",
].join("\n");

// 산출물은 **업무에 매여 있어야 한다**(`deliverables_scope_shape`). 꾸러미도 업무 한 줄을 만들어 매단다 —
// 장부에 "이 파일이 어디서 왔나" 가 남아야 나중에 되짚을 수 있다.
const { data: 업무, error: ae } = await db.from("assignments").insert({
  company_id: co.id,
  company_employee_id: ce.id,
  title: `도트·소리 꾸러미 (그림 ${키들.length}장 · 소리 10가지)`,
  description: "게임이 쓸 그림과 소리를 한 벌로 묶은 것. 그림은 gpt-image-2.5-flare, 소리는 코드로 그 자리에서 만든다(WebAudio).",
  status: "completed",
  priority: "normal",
  assignment_type: "manager",
  assignment_scope: "manager",
  source_type: "manual",
  assigned_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  submitted_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
}).select("id").single();
if (ae || !업무) { console.error("업무를 못 만들었다:", ae?.message); process.exit(1); }

const { data: 실행, error: ee } = await db.from("work_executions").insert({
  assignment_id: (업무 as { id: string }).id,
  company_id: co.id,
  company_employee_id: ce.id,
  status: "completed",
  current_step: "completed",
}).select("id").single();
if (ee || !실행) { console.error("실행을 못 만들었다:", ee?.message); process.exit(1); }

const { data: made, error } = await db.from("deliverables").insert({
  company_id: co.id,
  company_employee_id: ce.id,
  assignment_id: (업무 as { id: string }).id,
  work_execution_id: (실행 as { id: string }).id,
  title: `도트·소리 꾸러미 (그림 ${키들.length}장 · 소리 10가지)`,
  deliverable_type: "app_build",
  content_markdown: markdown,
  content_json: content,
  status: "submitted",
  version: 1,
  submitted_at: new Date().toISOString(),
  generation_model: "gpt-image-2.5-flare",
  deliverable_scope: "assignment",
  source_count: 0,
}).select("id").single();
if (error) { console.error("못 넣었다:", error.message); process.exit(1); }

console.log(`회사 ${co.name} · 그림 ${Math.round(js.length / 1024)}KB(${키들.length}장) · 소리 ${Math.round(소리.length / 1024)}KB(10가지)`);
console.log(`키: ${키들.join(", ")}`);
console.log(`\n**앞 판 산출물 id: ${(made as { id: string }).id}**`);
console.log(`다음: ask_for.mts ... --prev ${(made as { id: string }).id}`);
