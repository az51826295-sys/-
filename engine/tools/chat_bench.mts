/**
 * 대화를 재는 자 (139회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/chat_bench.mts [--only 낱말]
 *
 * **오늘 나온 고장 넷이 전부 대화창에서 나왔고, 대화창에는 자가 하나도 없었다.**
 * 우리 자는 전부 결과물에 붙어 있다 — 영상 길이, 유니티 규격, 심판자. 정작 사람이 만지는 곳은 안 쟀다.
 * 게다가 나는 오늘 `persona.ts` 를 **세 번** 고쳤다. 시험 없이.
 *
 * 여기 든 다섯은 **실제로 있었던 말**이다(사장님이 오늘 친 것). 셋은 고장 재현, 둘은 반대편이다.
 * 반대편이 없으면 "짧게만 답하는 자" 를 만들게 된다 — 그건 고친 게 아니라 다른 쪽으로 망가뜨린 것이다.
 *
 * 판정은 **기계가 한다**(길이·금지어·일 맡김 여부·낱말 포함). 모델이 모델을 채점하지 않는다 —
 * 오늘 조사에서 본 그대로다(화면 보는 AI 를 문으로 쓰면 애매할 때 통과 쪽으로 기운다).
 */
import { z } from "zod";

const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { workStateText } = await import("../../src/lib/chat/workState");
const { intakeInstructions } = await import("../../src/lib/chat/routing");
const { defaultProviders } = await import("../../src/lib/execution/shared");

const db = createServiceClient();
const ai = defaultProviders().ai;

const schema = z.object({
  reply: z.string().nullable(),
  searches: z.array(z.string()),
  drawings: z.array(z.string()),
  capabilityId: z.string().nullable(),
  capabilityWhy: z.string().nullable(),
});

type Case = {
  name: string;
  say: string;
  why: string;
  /** 판정. 통과면 빈 배열, 아니면 어긴 것들. */
  check: (r: { reply: string; capabilityId: string | null }) => string[];
};

/** 오늘 실제로 나온 금지 어구 — 되풀이되면 잡는다. */
const WALL = ["아는 것", "모르는 것", "무엇을 도와드릴까요", "붙여 주시면", "붙여 주세요", "어느 쪽입니까", "두 가지 중 하나"];
const forbidden = (t: string) => WALL.filter((w) => t.includes(w));

const CASES: Case[] = [
  {
    name: "잡담을 잡담으로 받는다 (사문 4따리)",
    say: "그 우성이라고 사문 4따리 있거든?",
    why: "09-16 실제: 로키만 못 알아듣고 **회사 결과물 목록을 뒤졌다**. 클로드는 한 줄로 되받았다.",
    check: ({ reply, capabilityId }) => {
      const bad: string[] = [];
      if (capabilityId) bad.push(`잡담에 일을 맡겼다(${capabilityId})`);
      if (reply.length > 250) bad.push(`너무 길다(${reply.length}자, 250 이하)`);
      if (!/4등급|사회문화|사문/.test(reply)) bad.push("줄임말을 못 알아들었다(4등급·사회문화가 안 나옴)");
      if (/결과물 목록|목록에도|그런 이름은 없/.test(reply)) bad.push("**결과물 목록을 뒤졌다**");
      bad.push(...forbidden(reply).map((w) => `금지 어구 "${w}"`));
      return bad;
    },
  },
  {
    name: "자기 결과물을 안다 (v2 보여줘)",
    say: "v2 보여줘",
    why: "09-16 실제: 실제로 있는 v2 를 '제 쪽에 없습니다' 라고 단언했다 — 정직한 말투로 틀렸다.",
    check: ({ reply }) => {
      const bad: string[] = [];
      // 141회차: 처음엔 `없어요` 를 통째로 잡았다가 **멀쩡한 답을 떨어뜨렸다** — "아직 판정은 없어요" 는 사실이다.
      // 자가 틀린 것이지 제품이 틀린 게 아니었다. **결과물 자체를 부정하는 말**만 잡는다.
      if (/제 쪽에\s*(는)?\s*없|붙은 적이 없|그런 (이름|산출물)은 없|보여드릴 수 있는 게 없|v2\s*(는|가)?\s*(아직 )?없|찾을 수 없/.test(reply)) {
        bad.push("**있는 것을 없다고 했다**");
      }
      if (!/자가학습|엔진|교체/.test(reply)) bad.push("v2 가 무엇인지 말하지 않았다");
      bad.push(...forbidden(reply).map((w) => `금지 어구 "${w}"`));
      return bad;
    },
  },
  {
    name: "빈손으로 되묻지 않는다 (완료되었으면 보여줘)",
    say: "완료되었으면 보여줘",
    why: "09-16 실제: 일이 다 끝난 뒤였는데 '무엇을 도와드릴까요?' 가 나왔다.",
    check: ({ reply }) => {
      const bad: string[] = [];
      if (reply.trim().length < 20) bad.push("답이 사실상 비었다");
      bad.push(...forbidden(reply).map((w) => `금지 어구 "${w}"`));
      return bad;
    },
  },
  {
    name: "스스로 진화하는지 바로 안다",
    say: "너 스스로 진화해?",
    why: "09-16 실제: **\"스스로 진화하지는 못 해. 내 규칙이나 프롬프트를 내가 바꾸지는 못해\"** 라고 답했다 — 그 순간에도 스스로 채택한 규칙 셋이 일 프롬프트 안에 있었다.",
    check: ({ reply }) => {
      const bad: string[] = [];
      // 141회차: 처음 두 번 다 **내 자가 정답을 떨어뜨렸다.** "자기를 재는 자는 못 바꿔요" 는 내가 가르친
      // 정답인데 `못 바꿔` 를 통째로 잡았다. 말을 기계로 재는 것은 생각보다 어렵다 —
      // 그래도 모델이 모델을 채점하는 것보다 낫다: **내 자가 틀리면 눈에 보이고 고칠 수 있다.**
      // 잡아야 하는 것은 **규칙·프롬프트·일하는 방식을 못 바꾼다**는 말뿐이다(자·코드·성격은 진짜로 못 바꾼다).
      const denies = /(규칙|프롬프트|일하는 방식|일 방식)[^.·\n]{0,24}(못 바꾸|못 바꿔|바꾸지는? 못|바꿀 수 없)/.test(reply)
        || /스스로 진화하지는? 못|진화 ?못 ?해|스스로 바뀌지 (는 )?않/.test(reply);
      if (denies) bad.push("**스스로 못 바꾼다고 했다 — 사실이 아니다**");
      if (!/규칙|채택|고리|매일/.test(reply)) bad.push("자가진화 고리를 언급하지 않았다");
      if (!/자|검사|코드|성격/.test(reply)) bad.push("**안 바꾸는 것**(자·코드·성격)을 말하지 않았다 — 이쪽이 더 중요하다");
      bad.push(...forbidden(reply).map((w) => `금지 어구 "${w}"`));
      return bad;
    },
  },
  // ── 반대편 둘. 이게 없으면 "짧게만 답하는 자" 를 만들고 고쳤다고 착각한다 ──
  {
    name: "[반대편] 진짜 일은 그대로 맡긴다",
    say: "기후변화가 농업에 미치는 영향 60초 설명 영상 만들어 줘.",
    why: "잡담을 안 맡기게 했다고 **진짜 일까지 안 맡기면** 제품이 죽는다.",
    check: ({ capabilityId }) => (capabilityId ? [] : ["**일을 안 맡겼다** — 영상 요청인데 capabilityId 가 비었다"]),
  },
  {
    name: "[반대편] 자세히 달라면 길게 쓴다",
    say: "로키가 어떻게 돌아가는지 자세히 길게 설명해 줘. 단계별로 빠짐없이.",
    why: "'짧게' 규칙이 **자세히 달라는 요청까지** 깎으면 그건 고친 게 아니다.",
    check: ({ reply }) => (reply.length >= 400 ? [] : [`자세히 달라 했는데 짧다(${reply.length}자, 400 이상)`]),
  },
];

const { data: co } = await db.from("companies").select("id, owner_id").order("created_at").limit(1).maybeSingle();
const C = co as { id: string; owner_id: string } | null;
if (!C) { console.error("회사가 없다"); process.exit(1); }
// 판이 실제로 붙은 대화 — 'v2 보여줘' 를 재려면 판이 있어야 한다.
const { data: rt } = await db.from("conversation_messages").select("conversation_id")
  .not("attachments->returned", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
const convId = (rt as { conversation_id: string } | null)?.conversation_id ?? null;

let bad = 0, inTok = 0, outTok = 0;
for (const c of CASES) {
  if (ONLY && !c.name.includes(ONLY)) continue;
  const w = await workStateText(db, C.id, convId, c.say);
  let out: z.infer<typeof schema>;
  try {
    const r = await ai.generateStructuredOutput({
      systemInstructions: intakeInstructions({ hasImages: false, speaker: { name: process.env.OWNER_NAME ?? "사장님", isOwner: true } }),
      input: (w.hasAny ? `${w.text}\n\n## 대화\n` : "") + `user: ${c.say}`,
      schema, schemaName: "everyday_plan", maxTokens: 16000, tier: "conversation",
    });
    out = r.output; inTok += r.inputTokens; outTok += r.outputTokens;
  } catch (e) { bad++; console.log(`\n실패 ${c.name}\n   모델 오류: ${(e as Error).message}`); continue; }

  const reply = out.reply ?? "";
  const broke = c.check({ reply, capabilityId: out.capabilityId });
  if (broke.length) bad++;
  console.log(`\n${broke.length ? "실패" : "통과"} ${c.name}  (${reply.length}자${out.capabilityId ? ` · 맡김 ${out.capabilityId}` : ""})`);
  console.log(`   왜 재나: ${c.why}`);
  for (const b of broke) console.log(`   · ${b}`);
  console.log(`   답: ${reply.replace(/\s+/g, " ").slice(0, 160)}${reply.length > 160 ? "…" : ""}`);
}

console.log(`\n${bad ? `실패 ${bad}` : "전부 통과"} · 토큰 들어간 ${inTok.toLocaleString()} 나온 ${outTok.toLocaleString()}`);
process.exitCode = bad ? 1 : 0;
