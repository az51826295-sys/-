/**
 * **심판자의 말이 다음 판의 주문이 된다** (152회차 09-16). 사장님: "광고 다시 해보자".
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ad_round.mts
 *
 * 150회차에 정한 고리의 마지막 칸이다. 미리보기의 "이 말대로 고쳐 줘" 단추가 하는 일을 여기서 그대로 한다 —
 * 지난 판 심판자가 뭐라 했는지 **DB 에서 읽어서**, 그 말을 이번 판 주문에 붙인다. 내가 고쳐 쓰지 않는다.
 *
 * 그리고 이번 판은 오늘 만든 것이 **전부 한 번에** 도는 첫 판이다:
 *   배치 판단(152) — 어느 모델에 앉힐지 · 연출 판단(149) — 글자 크기·템포 · 심판자(150) — 처음 보는 사람의 말.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

// 지난 판 심판자의 말 — 제일 최근 것.
const { data: ds } = await db.from("deliverables")
  .select("id, title, created_at, content_json").eq("deliverable_type", "video")
  .order("created_at", { ascending: false }).limit(10);
type D = { id: string; title: string; created_at: string; content_json: { judge?: Record<string, string> | null } | null };
const last = ((ds ?? []) as D[]).find((d) => d.content_json?.judge?.oneChange);
if (!last) { console.error("심판자가 말한 판이 없다 — 먼저 한 판 돌려라"); process.exit(1); }
const j = last.content_json!.judge!;
console.log(`지난 판: ${last.title} (${last.created_at.slice(5, 16)})`);
console.log(`  하나만 바꾼다면 — ${j.oneChange}`);

const TITLE = "로키 15초 광고 (심판자 말대로 고친 판)";
const DESC = [
  "로키를 처음 듣는 사람에게 보여 줄 15초 광고 영상을 만들어 줘.",
  "",
  "## 지난 판을 처음 보는 사람이 이렇게 말했다 — 이 말대로 고친다",
  `- 3초만 봤을 때: ${j.firstGlance ?? ""}`,
  `- 멈출까 넘길까: ${j.wouldStop ?? ""}`,
  `- 어색한 곳: ${j.awkward ?? ""}`,
  `- 고른 흔적: ${j.soulless ?? ""}`,
  `- **하나만 바꾼다면: ${j.oneChange ?? ""}**`,
  "",
  "## 그래서 이번 판에서 지킬 것",
  "1. 첫 장면에 **내 이득**이 먼저 온다. 브랜드 이름으로 시작하지 않는다.",
  "2. **말투를 하나로.** '나와요' 와 '돌려드려요' 를 섞지 않는다.",
  "3. **우리끼리 쓰는 말 금지** — '여러 AI가 붙어서' 같은 말은 보는 사람에게 이득이 아니다. 무엇이 나오는지로 말한다.",
  "4. **누구의 어떤 순간인지 하나를 고른다.** 기능을 늘어놓지 않는다.",
  "",
  "## 지어내지 말 것. 쓸 수 있는 사실은 이것뿐이다",
  "- 대화창에 말하면 mp4·문서 같은 진짜 파일로 나온다.",
  "- 이상한 부분만 말하면 그 부분만 다시 만든다.",
  "- 가입은 이메일과 비밀번호만 받는다. 카드는 안 받는다.",
  "마지막은 '말로 시키면 파일로 돌려드려요' 로 맺는다.",
].join("\n");

const { data: co } = await db.from("companies").select("id, owner_id").order("created_at").limit(1).maybeSingle();
const C = co as { id: string; owner_id: string };
type CE = { id: string; employees: { slug: string } | null };
const { data: emps } = await db.from("company_employees").select("id, employees(slug)").eq("company_id", C.id);
const vid = ((emps ?? []) as unknown as CE[]).find((e) => e.employees?.slug === "vid");
if (!vid) { console.error("Vid 가 없다"); process.exit(1); }
const { data: busy } = await db.from("assignments").select("id, status")
  .eq("company_employee_id", vid.id).in("status", ["queued", "working", "in_progress"]);
if ((busy ?? []).length) { console.log("Vid 가 일하는 중:", JSON.stringify(busy)); process.exit(1); }

const { data: a, error } = await db.from("assignments").insert({
  company_id: C.id, company_employee_id: vid.id, title: TITLE, description: DESC,
  status: "queued", role_input_json: { approved: true, fromJudge: last.id },
}).select("id").single();
if (error) { console.error(error.message); process.exit(1); }
const aid = (a as { id: string }).id;
const { error: e2 } = await db.from("work_executions").insert({
  company_id: C.id, assignment_id: aid, company_employee_id: vid.id,
  status: "queued", current_step: "context_loaded", attempt_number: 1,
});
if (e2) { console.error(e2.message); process.exit(1); }

const { data: conv } = await db.from("conversations").select("id")
  .eq("owner_id", C.owner_id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
const cid = (conv as { id: string } | null)?.id ?? null;
if (cid) {
  await db.from("conversation_messages").insert({
    conversation_id: cid, role: "assistant",
    content: `**${TITLE}** — 처음 보는 사람이 한 말대로 고쳐서 다시 만들고 있어요.`,
    attachments: { assignment: { id: aid, title: TITLE, queued: false } },
  });
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid);
}
console.log(`\n업무 ${aid.slice(0, 8)} 넣음 · 대화 ${cid?.slice(0, 8) ?? "(없음)"}`);
