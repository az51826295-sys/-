/**
 * **길이·장면 수를 대본이 정하는가, 주문 길이에 맞는가** (158회차 09-16). 돈: 모델 몇 센트 + 화면을 사면 초당 $0.10.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/size_round.mts
 *
 * 계획 ③. 154회차에 15초 주문이 19초로 나왔다 — 장면 수(4~6)와 말 길이가 내가 박은 상수였고, 주문 길이는 재기만 했다.
 * 이제 대본이 장면마다 초를 **계획**하고, 조립이 **쉼만 줄여** 주문 길이에 맞춘다(목소리는 안 자른다). 그걸 한 판 돌려 본다.
 * 주문은 광고가 아니라 **설명**이라 화면(sora)을 안 살 가능성이 높다 — 그것도 판단이 정한다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const TITLE = "로키 20초 설명 (크기 판단 시험)";
const DESC = [
  "로키가 무엇인지 처음 듣는 사람에게 20초 설명 영상으로 알려 줘. 해요체.",
  "지어내지 말 것. 쓸 수 있는 사실:",
  "- 대화창에 말하면 mp4·문서 같은 진짜 파일로 나온다.",
  "- 이상한 부분만 말하면 그 부분만 다시 만든다.",
  "- 가입은 이메일과 비밀번호만 받는다.",
  "마지막은 '말로 시키면 파일로 돌려드려요' 로 맺는다.",
].join("\n");
const { data: co } = await db.from("companies").select("id, owner_id").order("created_at").limit(1).maybeSingle();
const C = co as { id: string; owner_id: string };
type CE = { id: string; employees: { slug: string } | null };
const { data: emps } = await db.from("company_employees").select("id, employees(slug)").eq("company_id", C.id);
const vid = ((emps ?? []) as unknown as CE[]).find((e) => e.employees?.slug === "vid");
if (!vid) { console.error("Vid 가 없다"); process.exit(1); }
const { data: busy } = await db.from("assignments").select("id, status").eq("company_employee_id", vid.id).in("status", ["queued", "working", "in_progress"]);
if ((busy ?? []).length) { console.log("Vid 가 일하는 중:", JSON.stringify(busy)); process.exit(1); }
const { data: a, error } = await db.from("assignments").insert({ company_id: C.id, company_employee_id: vid.id, title: TITLE, description: DESC, status: "queued", role_input_json: { approved: true } }).select("id").single();
if (error) { console.error(error.message); process.exit(1); }
const aid = (a as { id: string }).id;
const { error: e2 } = await db.from("work_executions").insert({ company_id: C.id, assignment_id: aid, company_employee_id: vid.id, status: "queued", current_step: "context_loaded", attempt_number: 1 });
if (e2) { console.error(e2.message); process.exit(1); }
const { data: conv } = await db.from("conversations").select("id").eq("owner_id", C.owner_id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
const cid = (conv as { id: string } | null)?.id ?? null;
if (cid) {
  await db.from("conversation_messages").insert({ conversation_id: cid, role: "assistant", content: `**${TITLE}** — 만들고 있어요.`, attachments: { assignment: { id: aid, title: TITLE, queued: false } } });
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid);
}
console.log(`업무 ${aid.slice(0, 8)} 넣음 (${TITLE})`);
