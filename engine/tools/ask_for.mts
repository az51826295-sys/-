/**
 * 사장님 대신 로키에 일 하나 넣기 (125회차 09-15). **사장님이 말한 것만** 넣는다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ask_for.mts --employee vid --title "..." --ask "..." [--run]
 *
 * 왜 필요한가: `/ask` 화면은 6초마다 폴링을 해서 브라우저 확장이 붙지 못한다(입력창을 못 찾는다).
 * 그래서 대화가 하는 것과 **같은 모양**을 직접 만든다 — 대화 한 턴(사람 말 + 접수 답) + 업무 + 대기열 실행.
 * 그래야 결과가 그 대화에 돌아오고(`workReturns`), 미리보기 판에 **승인 / 수정 요청** 단추가 뜬다.
 * 모델 호출은 직원이 일할 때만 — 이 자는 접수 모델을 안 부른다(돈 0, 일값은 그 직원 단가).
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const slug = arg("employee") ?? "vid";
const title = arg("title") ?? "";
// 214회차 09-25: 여러 줄 주문을 --ask 로 넘기면 Windows 에서 **첫 줄바꿈에서 잘려** 첫 줄만 저장됐다(광고 A1·Deck 판 셋이 다 그랬다). 파일로 받는다.
const ask = arg("ask-file") ? (await import("node:fs")).readFileSync(arg("ask-file")!, "utf8") : (arg("ask") ?? "");
const RUN = process.argv.includes("--run");
if (!title || !ask) throw new Error("--title 과 --ask 가 필요하다");

const db = createServiceClient();
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const owner = users.users.find((u) => u.email === "az51826295@gmail.com");
if (!owner) throw new Error("사장님 계정을 못 찾음");
const { data: co } = await db.from("companies").select("id, name").eq("owner_id", owner.id).maybeSingle();
if (!co) throw new Error("회사를 못 찾음");
const { data: emp } = await db.from("employees").select("id, name").eq("slug", slug).maybeSingle();
if (!emp) throw new Error(`직원 ${slug} 없음`);
const { data: ce } = await db.from("company_employees").select("id").eq("company_id", co.id).eq("employee_id", emp.id).maybeSingle();
if (!ce) throw new Error(`${emp.name} 이(가) 이 회사에 없음 — 대화로 한 번 뽑아야 한다`);

console.log(`회사 ${co.name} · 직원 ${emp.name}(${slug})`);
console.log(`제목: ${title}`);
console.log(`주문: ${ask.slice(0, 200)}${ask.length > 200 ? "…" : ""}`);
if (!RUN) { console.log("\n--run 을 붙이면 실제로 넣는다(모델 호출 = 그 직원 일값)."); process.exit(0); }

// 대화 한 턴 — 화면에 사장님이 친 것처럼 보이고, 결과가 여기로 돌아온다.
const { data: conv, error: ce1 } = await db.from("conversations").insert({ owner_id: owner.id, title: title.slice(0, 60) }).select("id").single();
if (ce1 || !conv) throw ce1 ?? new Error("대화 못 만듦");

const { releaseEmployee } = await import("../../src/lib/assignments/service");
await releaseEmployee(db, ce.id as string);

const { data: a, error: ae } = await db.from("assignments").insert({
  company_id: co.id, company_employee_id: ce.id, title: title.slice(0, 120), description: ask,
  status: "queued", priority: "normal", source_type: "manual", assignment_type: "manager", assignment_scope: "manager",
}).select("id").single();
if (ae || !a) throw ae ?? new Error("업무 못 만듦");

await db.from("conversation_messages").insert([
  { conversation_id: conv.id, role: "user", content: ask },
  { conversation_id: conv.id, role: "assistant", content: `${emp.name} 에게 맡겼어요. 끝나면 여기 붙여 드릴게요.`, attachments: { assignment: { id: a.id, title, queued: true } } },
]);

const { error: xe } = await db.from("work_executions").insert({
  company_id: co.id, assignment_id: a.id, company_employee_id: ce.id,
  status: "queued", current_step: "context_loaded", attempt_number: 1,
});
if (xe) throw xe;

console.log(`\n넣었다 — 대화 ${(conv.id as string).slice(0, 8)} · 업무 ${(a.id as string).slice(0, 8)}. 워커가 15초 안에 집는다.`);
console.log("화면: /ask 에서 왼쪽 위 메뉴 → 대화 목록에 보인다.");
