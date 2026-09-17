/**
 * **심판자가 붙은 첫 판** (150회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_round.mts
 *
 * 계획 1~3번을 붙였으니(심판자 말 → 결과물 본문 → 미리보기 → "이 말대로 고쳐 줘" 단추)
 * 사슬이 실제로 이어지는지 **한 판 돌려서** 본다. 사슬 중 하나라도 끊겨 있으면
 * 심판자는 또 허공에 대고 말하는 것이다(그게 오늘까지의 상태였다).
 *
 * 주문은 **짧은 광고**다 — 149회차의 연출값(글자 크기·템포)이 판마다 달라지는지도 같이 보이니까.
 * 일꾼은 `work_executions` 를 본다(`assignments` 가 아니다 — 146회차에 8분을 여기서 잃었다).
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const TITLE = "로키 15초 광고";
const DESC = [
  "로키를 처음 듣는 사람에게 보여 줄 15초 광고 영상을 만들어 줘.",
  "설명이 아니라 광고다 — 3초 안에 눈을 잡고, 끝에 한 줄만 남겨라.",
  "지어내지 말 것. 쓸 수 있는 사실은 이것뿐이다:",
  "1) 대화창에 말하면 여러 AI가 붙어서 만들고, 결과는 mp4·문서 같은 진짜 파일로 나온다.",
  "2) 이상한 부분만 말하면 그 부분만 다시 만든다.",
  "3) 가입은 이메일과 비밀번호만 받는다. 카드는 안 받는다.",
  "마지막은 '말로 시키면 파일로 돌려드려요' 로 맺는다.",
].join("\n");

const { data: co } = await db.from("companies").select("id, owner_id").order("created_at").limit(1).maybeSingle();
const C = co as { id: string; owner_id: string };

type CE = { id: string; work_status: string; employees: { slug: string; name: string } | null };
const { data: emps } = await db.from("company_employees").select("id, work_status, employees(slug, name)").eq("company_id", C.id);
const vid = ((emps ?? []) as unknown as CE[]).find((e) => e.employees?.slug === "vid");
if (!vid) { console.error("Vid 가 없다"); process.exit(1); }

const { data: busy } = await db.from("assignments").select("id, title, status")
  .eq("company_employee_id", vid.id).in("status", ["queued", "working", "in_progress"]);
if ((busy ?? []).length) { console.log("Vid 가 일하는 중:", JSON.stringify(busy)); process.exit(1); }

const { data: a, error } = await db.from("assignments").insert({
  company_id: C.id, company_employee_id: vid.id, title: TITLE, description: DESC,
  status: "queued", role_input_json: { approved: true },
}).select("id").single();
if (error) { console.error("업무 못 만듦:", error.message); process.exit(1); }
const aid = (a as { id: string }).id;

const { error: e2 } = await db.from("work_executions").insert({
  company_id: C.id, assignment_id: aid, company_employee_id: vid.id,
  status: "queued", current_step: "context_loaded", attempt_number: 1,
});
if (e2) { console.error("실행 못 만듦:", e2.message); process.exit(1); }

const { data: conv } = await db.from("conversations").select("id")
  .eq("owner_id", C.owner_id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
const cid = (conv as { id: string } | null)?.id ?? null;
if (cid) {
  await db.from("conversation_messages").insert({
    conversation_id: cid, role: "assistant",
    content: `**${TITLE}** — 만들고 있어요. 끝나면 여기 붙고, 옆 미리보기에 **처음 보는 사람이 뭐라 할지**도 같이 뜹니다.`,
    attachments: { assignment: { id: aid, title: TITLE, queued: false } },
  });
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid);
}
console.log(`업무 ${aid.slice(0, 8)} · 실행 대기 · 대화 ${cid?.slice(0, 8) ?? "(없음)"} 에 붙임`);
