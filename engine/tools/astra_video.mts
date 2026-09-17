/**
 * 아스트라에게 소개 영상을 맡긴다 (143회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/astra_video.mts
 *
 * 사장님: "gpt 아스트라한테 소개 영상 맡겨"
 *
 * **126회차에 아스트라가 유일하게 떨어진 것이 영상이었다** — 계획이 장면을 0개 냈다(형식 지키기가 덜 미덥다).
 * 그래서 그때 결론이 "분석은 아스트라, 영상은 싼 모델" 이었다. 다시 재 보는 이유는 그 사이에 영상 쪽을 많이 고쳤기 때문이다:
 * 주문의 길이로 재는 자(135회차) · 장면마다 프레임 뜨기와 화면 사실 재기(133회차) · 심판자(132회차).
 *
 * 대조군이 있다: 같은 "로키 소개 60초" 를 09-15 에 싼 모델로 만든 판(`7448f3dd`, 검사 7/8).
 * 판값도 같이 남긴다 — 아스트라는 4배쯤 비싸다(126회차 실측).
 *
 * 결과는 **사장님 대화창에도 뜬다** — 업무를 만들고 그 업무를 가리키는 턴을 대화에 붙인다(`collectWorkReturns` 가 집는다).
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const TITLE = "로키 소개 60초 영상 (아스트라 판)";
const DESC = [
  "로키가 무엇이고 무엇을 해 주는지 60초 설명 영상으로 만들어 줘.",
  "보는 사람은 로키를 처음 듣는 사람이고, 말투는 해요체.",
  "이 사실만 쓴다(지어내지 말 것):",
  "1) 대화창에 말하면 로키가 여러 AI를 시켜 만들고, 결과는 mp4·문서 같은 진짜 파일로 나온다.",
  "2) 지금 잘하는 것은 60초 설명 영상과 출처 달린 자료 분석 두 가지다.",
  "3) 결과가 이상하면 그 부분만 말해 주면 그 부분만 다시 만든다.",
  "4) 매일 한 번 지난 일을 다시 읽고 규칙을 스스로 배워 다음 일에 쓴다.",
  "5) 가입은 이메일과 비밀번호만 받고 카드는 안 받는다.",
  "마지막 장면은 '말로 시키면 파일로 돌려드려요' 로 맺는다.",
].join("\n");

const { data: co } = await db.from("companies").select("id, owner_id").order("created_at").limit(1).maybeSingle();
const C = co as { id: string; owner_id: string };

// Vid 를 찾는다(영상 직원).
const { data: emps } = await db
  .from("company_employees")
  .select("id, onboarding_status, employees(slug, name)")
  .eq("company_id", C.id);
type CE = { id: string; onboarding_status: string; employees: { slug: string; name: string } | null };
const vid = ((emps ?? []) as unknown as CE[]).find((e) => e.employees?.slug === "vid" || e.employees?.name === "Vid");
if (!vid) { console.error("Vid 가 없다"); process.exit(1); }
console.log(`직원 ${vid.employees?.name} (${vid.onboarding_status})`);

// 직원당 살아 있는 업무는 하나 — 걸려 있으면 알려 준다.
const { data: busy } = await db.from("assignments").select("id, title, status")
  .eq("company_employee_id", vid.id).in("status", ["queued", "working", "in_progress"]);
if ((busy ?? []).length) {
  console.log("Vid 가 이미 일하는 중:", JSON.stringify(busy));
  console.log("끝나면 다시 돌려라.");
  process.exit(1);
}

const { data: a, error } = await db.from("assignments").insert({
  company_id: C.id,
  company_employee_id: vid.id,
  title: TITLE,
  description: DESC,
  status: "queued",
  role_input_json: {},
}).select("id").single();
if (error) { console.error("업무 못 만듦:", error.message); process.exit(1); }
const aid = (a as { id: string }).id;
console.log(`업무 ${aid.slice(0, 8)} 만듦 · ${TITLE}`);

// 사장님 대화창에 붙인다 — 그래야 결과가 대화로 돌아온다.
const { data: conv } = await db.from("conversations").select("id")
  .eq("owner_id", C.owner_id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
const cid = (conv as { id: string } | null)?.id ?? null;
if (cid) {
  await db.from("conversation_messages").insert({
    conversation_id: cid,
    role: "assistant",
    content: `**${TITLE}** — 아스트라(gpt-6-astra)에게 맡겼어요. 끝나면 여기 붙습니다.`,
    attachments: { assignment: { id: aid, title: TITLE, queued: false } },
  });
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid);
  console.log(`대화 ${cid.slice(0, 8)} 에 붙임 — 결과가 /ask 로 돌아온다`);
} else {
  console.log("대화를 못 찾아 붙이지 못했다(결과는 DB 에는 남는다)");
}
