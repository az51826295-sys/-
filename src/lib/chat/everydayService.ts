import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { billingOpen } from "@/lib/billing/plans";
import { startPrepaid } from "@/lib/billing/ledger";
import { createServiceClient } from "@/lib/supabase/service";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";
import { speakerFor } from "@/lib/chat/persona";
import { intakeInstructions, scrubCapabilityIds } from "@/lib/chat/routing";
import { workStateText } from "@/lib/chat/workState";
import { latestFrame } from "@/lib/hand/screen";
import { createImageProvider } from "@/lib/providers/images";
import { stashChatImages } from "@/lib/chat/images";
import { checkAnonymous, recordAnonymous } from "@/lib/chat/anonymous";
import { saveTurn } from "@/lib/chat/conversations";

import { delegate } from "@/lib/chat/delegate";
import { employeeDefinitions } from "@/lib/employees/definitions";
import { employeeSkillRegistry } from "@/lib/skills/registry";
import { learnFromChat } from "@/lib/chat/learnFromChat";
import { pendingApproval, classifyApprovalReply, resumeApproved, cancelPending } from "@/lib/execution/approval";

/**
 * 대화 한 턴. **모드가 없다.**
 *
 * 전에는 "일상"과 "회사"가 갈려 있었다. 그런데 그러면 사용자가 말을 걸기 전에
 * **자기 요청을 먼저 분류**해야 한다 — 이건 잡담인가 일인가. 이 제품은 다른
 * 곳에서 계속 그 부담을 없애 왔다("누구에게 맡길지 묻지 않는다"). 그러면서
 * 어느 모드인지는 묻고 있었다.
 *
 * 이제 한 번의 호출이 네 가지를 같이 정한다:
 *
 *   지금 답할 수 있나        → 답한다
 *   찾아봐야 정확한가        → 검색하고 출처를 붙인다
 *   그려 달라고 했나         → 그린다
 *   시간이 드는 일인가       → 사람을 붙이고 업무로 만든다
 *
 * 사용자는 그 경계를 몰라도 된다. 그게 요점이다.
 */

export type EverydayInput = {
  messages: { role: "user" | "assistant"; content: string }[];
  /** 로그인 안 한 사람이 브라우저에 들고 다니는 값. 사람을 식별하지 않는다. */
  visitor?: string;
  /** 이어서 저장할 대화. 없으면 새로 만든다. 익명이면 무시된다. */
  conversationId?: string | null;
  /** 새 대화라면 이 과제 안에 만든다. */
  taskId?: string | null;
  /** 이번 턴에 올린 사진. base64(데이터 URL 접두사 없이). */
  images?: string[];
  /** 173회차: 브라우저가 스스로 알려 준 기기 사실. 프롬프트에 한 줄로 실리고, 회사의 기기 기록에 적힌다. */
  device?: Record<string, unknown>;
  /**
   * 지금 무엇을 하는 중인지 알린다.
   *
   * 한 턴이 검색·그림·위임까지 하면 십수 초가 걸린다. 그동안 화면에 점 세 개만
   * 있으면 사람은 **멈춘 건지 도는 건지** 알 수 없고, 대개 멈춘 쪽으로 읽는다.
   * 뒤에서 여러 곳에 붙는 것이 이 제품의 값어치인데, 그게 안 보이면 값어치가
   * 아니라 지연으로만 느껴진다.
   *
   * 없으면 아무 일도 안 일어난다 — 스트리밍을 안 쓰는 호출자도 그대로 쓴다.
   */
  onStatus?: (text: string) => void;
};

export type EverydaySource = { title: string; url: string };
export type EverydayImage = { dataUrl: string; prompt: string };

export type EverydayResult =
  | {
      ok: true;
      reply: string;
      sources: EverydaySource[];
      searched: string[];
      images: EverydayImage[];
      /** 익명일 때 남은 횟수. 로그인 상태면 null. */
      turnsLeft: number | null;
      /** 저장된 대화 id. 익명이거나 저장에 실패하면 null. */
      conversationId: string | null;
      /** 이번 턴에 사람을 붙였으면. 아니면 null. */
      hired: { name: string; why: string } | null;
      assignment: { id: string; title: string; queued: boolean } | null;
    }
  | { ok: false; error: string; status: number };

const firstPass = z.object({
  /**
   * 찾아볼 것 없이 지금 답할 수 있으면 여기에 답을 쓴다.
   * 최신 사실·출처가 필요하면 비워 두고 `searches` 를 채운다.
   */
  reply: z.string().nullable(),
  /**
   * 검색어. 최대 3개.
   *
   * 비어 있으면 검색하지 않는다 — 잡담이나 일반 지식에 검색을 붙이는 것은
   * 답을 낫게 하지 않고 느리게만 한다.
   */
  searches: z.array(z.string()),
  /**
   * 그릴 그림의 묘사. **그려 달라고 했을 때만** 채운다.
   *
   * 설명으로 될 것을 그림으로 내면 느리고 비싸기만 하다. 반대로 "이거 그려줘"
   * 에 글로 답하는 것은 못 들은 것이다. 그 경계는 사용자가 정한다.
   */
  drawings: z.array(z.string()),
  /**
   * 시간이 드는 일이면 그 능력 id. 한 번 답하고 끝날 것이면 null.
   *
   * 여기 값이 있으면 사람을 붙이고 업무를 만든다 — 사용자는 그걸 요청한 적이
   * 없고, 그래서 **답이 먼저 나간 뒤에** 조용히 붙는다.
   */
  capabilityId: z.string().nullable(),
  /** 왜 그 능력인지 한 줄. 매니저가 읽고 틀렸다고 말할 수 있어야 한다. */
  capabilityWhy: z.string().nullable(),
  /**
   * 유니티에서 만들거나 고쳐 달라는 것. 아니면 null.
   *
   * 이것이 채워지면 대화창이 유니티 세션을 연다 — 설계도와 합격 기준이 먼저
   * 나오고, 사장님 PC에서 도는 심부름꾼이 그것을 집어 유니티를 켠다.
   *
   * **게임 이야기라고 아무 때나 채우지 않는다.** "유니티 어떻게 써?" 같은
   * 물음은 답할 것이지 만들 것이 아니다. 만들어 달라거나 고쳐 달라고 했을
   * 때만 채운다 — 안 그러면 물어본 적 없는 일이 사장님 프로젝트에 쌓인다.
   */
});

const answerPass = z.object({
  reply: z.string(),
  /** 실제로 근거로 쓴 출처의 url. 안 쓴 것은 넣지 않는다. */
  usedUrls: z.array(z.string()),
});

const MAX_SEARCHES = 3;
/** 한 턴에 그리는 그림 수. 넘게 그리면 느리고 비싸다. */
const MAX_DRAWINGS = 2;
const RESULTS_PER_SEARCH = 5;

/** 메시지 첫머리나 호격에 직원 이름이 있으면 그 직원의 첫 능력 id. 없으면 null. */
function employeeNamedIn(text: string): string | null {
  const head = text.slice(0, 40);
  for (const e of employeeDefinitions) {
    const re = new RegExp(`(^|[\\s,.!?"'(])${e.name}(아|야|님|,|\\s|$)`, "i");
    if (re.test(head)) {
      const skill = employeeSkillRegistry[e.skillId as keyof typeof employeeSkillRegistry];
      const cap = skill?.capabilities?.[0]?.id;
      if (cap) return cap;
    }
  }
  return null;
}

/**
 * 대화 기록을 모델의 창 안으로. 09-06 10:35 한 대화가 산출물 본문·코드·유니티 판정으로
 * 불어 "input exceeds the context window" 로 답을 못 했다. 최근 것을 우선하고, 긴 턴
 * (돌아온 산출물)은 앞부분만 남긴다. 전체 6만 자, 한 턴 3천 자.
 */
function clipTranscript(messages: { role: string; content: string }[]): string {
  const PER_TURN = 3000;
  const TOTAL = 60_000;
  const lines: string[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const body = m.content.length > PER_TURN ? m.content.slice(0, PER_TURN) + "\n…(잘림)" : m.content;
    const line = `${m.role}: ${body}`;
    if (used + line.length > TOTAL) break;
    lines.push(line);
    used += line.length;
  }
  return lines.reverse().join("\n");
}

/** 고쳐 달라는 말. 넓게 잡는다 — 못 잡으면 채팅이 코드 조각으로 답하고 끝난다. */
export const FIX_WORDS = /고쳐|고치|수정|다시\s*해|바꿔|추가해|넣어\s*줘|빼\s*줘|늘려|줄여|fix|change/i;

/** 로키의 답이 일을 **약속**하는 말(169회차). 약속했는데 업무가 안 생기면 아무 일도 안 일어난다 — 그때 고치는 일로 넘긴다. */
export const PROMISE_WORDS = /고칠게|고치겠|고쳐서|반영(해서|할게|하겠)|다시 (돌릴|만들|올릴|짤)|수정(할게|하겠|해서)|바꿀게|바꾸겠|줄일게|늘릴게|넣을게|추가할게|손볼게/;

/** 이 대화에 마지막으로 돌아온 산출물의 종류 → 그것을 낸 능력 id. */
async function capabilityOfLastReturned(
  db: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
): Promise<string | null> {
  const { data: rows } = await db
    .from("conversation_messages")
    .select("deliverableId:attachments->returned->>deliverableId")
    .eq("conversation_id", conversationId)
    .not("attachments->returned", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  const id = ((rows ?? []) as unknown as { deliverableId: string | null }[])
    .map((r) => r.deliverableId)
    .find((x): x is string => typeof x === "string");
  const BY_TYPE: Record<string, string> = {
    app_build: "small_app",
    mesh_assets: "mesh_from_image",
  };
  if (!id) {
    // 169회차: 돌아온 것이 아직 없어도(일이 도는 중이거나 방금 끝나 대화에 안 붙었어도) "고쳐 줘" 는 그 일을 맡은 직원의 일이다.
    // 이게 없어서 로키가 "반영해서 다시 돌릴게" 라고 **말만 하고 아무 일도 안 만들었다**(1단계 시험 첫 판).
    const { lastAssignmentInConversation } = await import("@/lib/chat/delegate");
    const aid = await lastAssignmentInConversation(db, conversationId, null);
    if (!aid) return null;
    const { data: a } = await db.from("assignments").select("role_input_schema_id").eq("id", aid).maybeSingle();
    const schema = ((a?.role_input_schema_id as string | undefined) ?? "").replace(/_assignment_v\d+$/, "");
    return BY_TYPE[schema] ?? null;
  }
  const { data: d } = await db.from("deliverables").select("deliverable_type").eq("id", id).maybeSingle();
  const type = (d?.deliverable_type as string | undefined) ?? "";
  return BY_TYPE[type] ?? null;
}

export async function runEverydayTurn(
  input: EverydayInput,
): Promise<EverydayResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 로그인 없이도 대화는 된다. 값어치를 보기 전에 가입을 요구하면 대부분 닫는다 —
  // 로그인을 묻는 자리는 벽이 아니라 "이어서 하시려면" 이어야 한다.
  //
  // 다만 익명도 돈을 쓰므로 문지기를 먼저 지난다. `anonymous.ts` 에 왜 세 겹인지
  // 적어 뒀다.
  let turnsLeft: number | null = null;
  if (!user) {
    const visitor = (input.visitor ?? "").trim();
    if (!visitor) {
      return { ok: false, error: "방문자 표시가 없습니다.", status: 400 };
    }
    const gate = await checkAnonymous(visitor);
    if (!gate.allowed) {
      return { ok: false, error: gate.why, status: 429 };
    }
    turnsLeft = gate.turnsLeft;
  }

  // 회사가 없어도 일상 모드는 돈다. 다만 회사가 있으면 그 한도 안에서 쓴다 —
  // 개인 대화가 회사 한도를 우회하는 구멍이 되면 안 된다.
  const { data: company } = user
    ? await supabase
        .from("companies")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle()
    : { data: null };
  let companyId = (company?.id as string | undefined) ?? null;

  // 로그인은 했는데 회사가 없다. 회사 만드는 화면은 09-05 에 지웠으니 여기서
  // 만든다 — 회사는 한도·장부·직원이 붙는 자리라 없으면 일을 못 맡긴다.
  // 이름은 이메일 앞부분. 매니저가 대화에서 회사 이름을 말하면 그때 배운다.
  if (user && !companyId) {
    const guess = (user.email ?? "").split("@")[0] || "내 회사";
    const { data: made } = await supabase
      .from("companies")
      // 유니티 창이 쓰는 회사 열쇠도 여기서 만든다. 없으면 그 회사는 유니티에
      // 아무것도 못 가져간다.
      .insert({ owner_id: user.id, name: guess, unity_key: "rk_" + crypto.randomUUID().replace(/-/g, "") })
      .select("id")
      .maybeSingle();
    companyId = (made?.id as string | undefined) ?? null;
    // 100회차: 결제가 열려 있으면 새 회사는 충전식 + 체험 크레딧으로 시작한다.
    if (companyId && billingOpen()) await startPrepaid(createServiceClient(), companyId);
  }

  const blocked = companyId ? await blockedBySpendLimit(supabase, companyId) : null;
  if (blocked) {
    return {
      ok: true,
      reply: blocked.startsWith("크레딧") ? blocked : "이번 기간 지출 한도에 걸려 있습니다. 한도가 리셋되면 이어서 하겠습니다.",
      sources: [],
      searched: [],
      images: [],
      turnsLeft,
      conversationId: null,
      hired: null,
      assignment: null,
    };
  }

  const providers = companyId
    ? meterProviders(defaultProviders(), supabase, { companyId })
    : defaultProviders();

  const speaker = user ? await speakerFor(supabase) : null;

  const transcript = clipTranscript(input.messages);

  // 사진은 로그인한 사람만 올릴 수 있다. 비전 호출은 글보다 비싸고, 익명 하루
  // 상한이 사진 몇 장에 다 쓰이면 그날 나머지 사람이 대화를 못 한다.
  const seen = user ? (input.images ?? []).slice(0, 4) : [];
  // 173회차: 지금 말하는 기기. 사장님이 아이패드에서 "내가 무슨 기종인지 알 수 있어?" 라고 물었을 때 로키는 "못 봐" 라고 했다 —
  // 브라우저가 알려 주는 것을 안 읽고 있었을 뿐이다. 값을 검사해서(지어낸 모양은 버린다) 적어 두고, 아래 프롬프트에 한 줄 싣는다.
  let deviceNote = "";
  if (input.device) {
    try {
      const { deviceFactsSchema, deviceLine, saveDevice } = await import("@/lib/hand/device");
      const d = deviceFactsSchema.parse(input.device);
      deviceNote = `## 지금 말하는 기기 (브라우저가 알려 준 것 — 모델명은 안 알려 준다)\n${deviceLine(d)}\n사람이 기종·성능을 물으면 이 줄을 근거로 답한다. 모델명은 모른다고 말하고, 화면·터치·GPU 로 답한다.\n\n`;
      if (user && companyId) void saveDevice(supabase, companyId, d);
    } catch { /* 모양이 안 맞으면 없는 것으로 */ }
  }
  // 163회차 같이 보기: 손이 20초 안에 보낸 사장님 화면이 있으면 **그 한 장을 같이 본다.** 사장님이 올린 사진 뒤에 붙인다.
  // 사장님 "로키가 같이 보는 거 해줄 수 있어?" — 이게 그것이다. 화면이 없으면 아무것도 안 붙는다(옛 화면을 지금인 척하지 않는다).
  let liveScreen: { host: string; ageMs: number } | null = null;
  if (user && companyId) {
    try {
      const f = latestFrame(companyId);
      if (f) { seen.push(f.jpg.toString("base64")); liveScreen = { host: f.host, ageMs: f.ageMs }; }
    } catch { /* 못 읽으면 안 붙인다 */ }
  }

  const say = input.onStatus ?? (() => {});

  // ── 되묻기(35회차): 이 대화에 확인을 기다리는 계획이 있으면, 이 말은 그 계획에 대한 답이다 ──
  // '시작' 이면 이어서 만들고, 고칠 말이면 계획을 다시 쓰고, '취소' 면 접는다. 모델을 부르지 않는다.
  if (user && companyId && input.conversationId) {
    const pending = await pendingApproval(supabase, input.conversationId);
    if (pending) {
      const said = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const kind = classifyApprovalReply(said);
      let reply: string;
      let assignment: { id: string; title: string; queued: boolean } | null = { id: pending.assignmentId, title: pending.title, queued: true };
      if (kind === "cancel") {
        await cancelPending(supabase, pending);
        reply = "네, 접을게요. 다시 시키실 때 말씀해 주세요.";
        assignment = null;
      } else if (kind === "yes") {
        await resumeApproved(supabase, pending, null);
        // 169회차: HTML 게임에도 "유니티가 재요" 라고 답했다(사장님 화면 09-17). 재는 판에만 그 말을 한다.
        reply = pending.unity ? "네, 그대로 시작할게요. 끝나면 여기 붙고, 유니티가 재요." : "네, 그대로 시작할게요. 끝나면 여기 붙어요.";
      } else {
        const r = await resumeApproved(supabase, pending, said);
        reply = r.mode === "replan"
          ? "네, 그 말을 얹어서 계획을 다시 써 볼게요. 곧 다시 보여 드려요."
          : "네, 그 말을 얹어서 이번엔 바로 만들게요(계획은 두 번까지만 다시 써요).";
      }
      const conversationId = await saveTurn(supabase, user.id, {
        conversationId: input.conversationId,
        taskId: input.taskId ?? null,
        mode: "everyday",
        user: { role: "user", content: said },
        assistant: { role: "assistant", content: reply, attachments: { images: [], sources: [], searched: [], assignment } },
      });
      return { ok: true, reply, sources: [], searched: [], images: [], turnsLeft, conversationId, hired: null, assignment };
    }
  }

  say("생각하는 중");

  // 첫 판이 터지면 날 오류 코드가 화면에 그대로 나갔다("MODEL_OUTPUT_TRUNCATED",
  // 09-05 13:50). 사람이 읽을 말로 바꾸고, 잘린 것은 잘렸다고 말한다.
  // 136회차: **자기가 뭘 만들고 있는지**를 프롬프트에 넣는다. 이게 없어서 로키가 실제로 있는 v2 를
  // "제 쪽에 없습니다" 라고 단언했다(사장님이 쓰다가 잡음). 대화 글만 보면 맞춰 볼 대상이 없다.
  const work = await workStateText(supabase, companyId, input.conversationId ?? null, input.messages[input.messages.length - 1]?.content ?? "");
  const liveNote = liveScreen ? `## 사장님의 지금 화면 (마지막 그림, ${liveScreen.host}, ${Math.round(liveScreen.ageMs / 1000)}초 전)\n로키 손이 방금 찍어 보낸 사장님 노트북 화면이다. 사장님이 화면에 대해 물으면 **이 그림을 보고** 답한다. 보이는 것만 말한다.\n\n` : "";
  const withWork = deviceNote + liveNote + (work.hasAny ? `${work.text}\n\n## 대화\n${transcript}` : transcript);

  const firstPassCall = () => providers.ai.generateStructuredOutput({
    systemInstructions: intakeInstructions({ hasImages: seen.length > 0, speaker }),
    input: withWork,
    images: seen,
    schema: firstPass,
    schemaName: "everyday_plan",
    // 판단 등급은 추론 모델이라 생각하는 데 출력 예산을 먼저 쓴다. 8000 으로
    // 두니 게임 요청 하나에 잘렸다(09-05). 답은 어차피 몇 문단이다.
    maxTokens: 16000,
    // 첫 판은 "답할지·찾을지·맡길지" 를 정하고 한두 문단 답하는 자리다. 09-05
    // 사장님: 장부의 $0.39 가 전부 판단 등급 열 번이었고 그중 넷이 이 첫 판이었다.
    // 대화 등급으로 내려 딥시크가 받게 한다. 사진이 붙은 턴은 라우터가 알아서
    // 위로 올린다(경제 모델은 그림을 못 본다). 상품인 자리(Dev 의 코드)는 그대로.
    tier: "conversation",
  });

  let plan: z.infer<typeof firstPass>;
  try {
    plan = (await firstPassCall()).output;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const why =
      msg === "MODEL_OUTPUT_TRUNCATED"
        ? "답이 너무 길어져서 끝까지 못 썼습니다. 코드나 긴 문서라면 \"만들어 줘\" 라고 " +
          "맡겨 주시면 사람을 붙여 파일로 드립니다. 아니면 조금 나눠서 물어봐 주세요."
        : `답을 만들다 막혔습니다: ${msg}`;
    return { ok: false, error: why, status: 502 };
  }

  // ── "고쳐 줘" 는 판단이 아니라 규칙이다 ─────────────────────────
  //
  // 22:03 대화 모델이 "고쳐줘, 유니티에서 컴파일이 깨졌어" 를 질문으로 보고 웹을
  // 찾아 코드 조각을 채팅으로 답했다. 아무것도 유니티에 안 갔다. 이 대화에 돌아온
  // 산출물이 있고 사람이 고쳐 달라고 하면, 그것은 **그 산출물을 낸 직원의 일**이다 —
  // 모델이 판단할 자리가 아니다.
  // ── 이름을 불렀으면 그 사람이다 ─────────────────────────────────
  //
  // 07:46 "Vox, 지난 캐릭터를 4K 로 다시" 가 Nova(2D)에게 갔다. 사람이 이름을 부르면
  // 모델의 능력 판단은 끝난 것이다 — 그 직원의 첫 능력으로 간다.
  if (companyId) {
    const last = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const named = employeeNamedIn(last);
    if (named && plan.capabilityId !== named) {
      plan.capabilityId = named;
      plan.capabilityWhy = "매니저가 이름을 불렀다";
      plan.searches = [];
      if (!plan.reply?.trim()) plan.reply = "그 사람에게 맡기겠습니다.";
    }
  }

  if (companyId && input.conversationId && !plan.capabilityId) {
    const last = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    // 169회차: **말만 하고 일을 안 만드는 것**을 막는다. 사람 말에 고치기 낱말이 없어도("오른쪽 눌렀는데 왼쪽으로 가"), 로키 자신의 답이
    // "고칠게·반영할게·다시 돌릴게" 라고 **약속**했으면 그건 일이다 — 약속해 놓고 업무가 없으면 거짓말이 된다. (사람 말이 아니라 로키 말을 읽는다.)
    const promised = PROMISE_WORDS.test(plan.reply ?? "");
    if (FIX_WORDS.test(last) || promised) {
      const cap = await capabilityOfLastReturned(supabase, input.conversationId);
      if (cap) {
        plan.capabilityId = cap;
        plan.capabilityWhy = "이 대화에 돌아온 산출물을 고치는 요청";
        plan.searches = [];
        if (!plan.reply?.trim()) plan.reply = "지난 산출물을 바탕으로 고치겠습니다.";
      }
    }
  }

  if (!user) {
    await recordAnonymous(input.visitor as string, {
      model: providers.ai.model,
      inputTokens: 0,
      outputTokens: 0,
    });
  }

  const queries = plan.searches.slice(0, MAX_SEARCHES).filter((q) => q.trim());
  // 익명에게 그림은 안 그려 준다. 한 장이 대화 수십 턴 값이라, 무료로 열어 두면
  // 하루 상한이 그림 몇 장에 다 쓰인다.
  const wanted = user
    ? plan.drawings.slice(0, MAX_DRAWINGS).filter((d) => d.trim())
    : [];

  // 그림은 검색과 독립이다. 그려 달라고 했으면 그리고, 검색까지 필요하면 둘 다 한다.
  const images: EverydayImage[] = [];
  const drawFailures: string[] = [];
  if (wanted.length > 0) {
    const drawer = createImageProvider();
    for (const prompt of wanted) {
      // 무엇을 그리는 중인지까지 말한다. "그림 그리는 중"만 있으면 여러 장일 때
      // 몇 번째인지 몰라 또 멈춘 것처럼 보인다.
      say(`그리는 중: ${prompt.slice(0, 40)}`);
      try {
        const made = await drawer.draw(prompt);
        images.push({ dataUrl: made.dataUrl, prompt });
        if (companyId) {
          // 그림도 장부에 남는다. 대화가 한도 밖에서 돈을 쓰는 구멍이 되면 안 된다.
          await supabase.from("model_usage").insert({
            company_id: companyId,
            model: made.model,
            purpose: "everyday_image",
            input_tokens: made.inputTokens,
            output_tokens: made.outputTokens,
            unit: "tokens",
          });
        }
      } catch (error) {
        drawFailures.push(
          `("${prompt}" 그리기 실패: ${
            error instanceof Error ? error.message : String(error)
          })`,
        );
      }
    }
  }

  const lastUser =
    [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // ── 답을 만든다 ────────────────────────────────────────────────
  //
  // 검색이 필요했으면 찾은 것을 근거로 다시 쓰고, 아니면 첫 호출의 답을 쓴다.
  // 어느 쪽이든 **여기서 하나로 모인다** — 두 갈래로 두면 그 아래 붙는 것(위임,
  // 학습, 저장)을 두 번 적게 되고, 한쪽만 고치는 날이 온다.
  let reply: string;
  let sources: EverydaySource[] = [];

  if (queries.length === 0) {
    // 136회차: 빈 답을 "무엇을 도와드릴까요?" 로 때우던 자리. 사장님이 일이 다 끝난 뒤 "완료되었으면
    // 보여줘" 라고 쳤는데 바로 이 문장이 나왔다 — 멍한 눈빛이다. 모델이 답을 못 냈으면 **그 사실을 말하고**,
    // 지금 무엇이 있는지라도 알려 준다. 빈손으로 되묻는 것이 제일 나쁘다.
    reply =
      plan.reply ??
      (images.length
        ? "그렸습니다."
        : work.hasAny
          ? "방금 건 제가 답을 제대로 못 만들었어요. 다시 말씀해 주시겠어요?\n\n지금 이 회사에 있는 것은 이렇습니다:\n" +
            work.text.split("\n").filter((l) => l.startsWith("- ")).slice(0, 6).join("\n")
          : "방금 건 제가 답을 제대로 못 만들었어요. 다시 말씀해 주시겠어요?");
  } else {
    // 검색이 실패해도 대화는 계속된다. 찾아보려던 것이 안 됐다는 사실만 남긴다 —
    // 조용히 모델의 기억으로 답하면 사용자는 그것이 검색 결과인 줄 안다.
    const found: EverydaySource[] = [];
    const notes: string[] = [];
    for (const q of queries) {
      say(`찾아보는 중: ${q}`);
      try {
        const results = await providers.search.search(q, RESULTS_PER_SEARCH);
        for (const r of results) {
          found.push({ title: r.title, url: r.url });
          notes.push(
            `[${r.url}] ${r.title}\n${(r.rawContent ?? r.snippet ?? "").slice(0, 1200)}`,
          );
        }
      } catch (error) {
        notes.push(
          `("${q}" 검색이 실패했습니다: ${
            error instanceof Error ? error.message : String(error)
          })`,
        );
      }
    }

    say("찾은 것으로 답 쓰는 중");
    const { output: answer } = await providers.ai.generateStructuredOutput({
      systemInstructions: [
        "아래 검색 결과를 근거로 답한다. 한국어로.",
        "",
        "- 결과에 없는 것을 결과에 있는 것처럼 쓰지 마라. 모르면 모른다고 하고,",
        "  무엇을 더 찾아보면 되는지 말한다.",
        "- 사실마다 어디서 왔는지 알 수 있게 쓰고, 실제로 쓴 출처만 `usedUrls` 에 담는다.",
        "- 검색이 실패했다고 적힌 항목이 있으면 그 사실을 답에 밝힌다.",
      ].join("\n"),
      input: (work.hasAny ? `${work.text}\n\n` : "") + `대화:\n${transcript}\n\n검색 결과:\n${notes.join("\n\n")}`,
      // 답을 쓸 때도 사진을 다시 보여 준다. 검색 결과만 주고 사진을 빼면,
      // 사진에 대해 물은 것을 검색 결과로만 답하게 된다.
      images: seen,
      schema: answerPass,
      schemaName: "everyday_answer",
      maxTokens: 12000,
      tier: "judgment",
    });

    const used = new Set(answer.usedUrls);
    sources = found.filter((s) => used.has(s.url));
    reply = answer.reply;
  }

  reply = scrubCapabilityIds(reply);
  if (drawFailures.length) reply += "\n\n" + drawFailures.join("\n");

  // ── 시간이 드는 일이면 사람을 붙인다 ──────────────────────────
  //
  // **답이 나온 뒤에** 한다. 사용자는 사람을 붙여 달라고 한 적이 없고, 절차가
  // 먼저 나오면 첫 문장이 답이 아니라 접수 확인이 된다.
  //
  // 로그인하지 않았거나 회사가 없으면 여기는 건너뛴다 — 일을 맡기면 그것이
  // **누구 회사에 쌓이는지**가 있어야 하고, 그게 로그인의 진짜 이유다.
  let hired: { name: string; why: string } | null = null;
  let assignment: { id: string; title: string; queued: boolean } | null = null;

  if (plan.capabilityId && companyId) {
    try {
      say("사람 붙이는 중");
      const d = await delegate(
        supabase,
        companyId,
        plan.capabilityId,
        plan.capabilityWhy,
        input.messages,
        // 올린 사진은 순수 base64 로 온다. 레퍼런스로 넘길 때는 data URL 로 —
        // 3D 생성기가 그 모양을 받는다.
        seen.map((b64) => `data:image/png;base64,${b64}`),
        input.conversationId ?? null,
      );
      hired = d.hired;
      assignment = d.assignment;
      // 170회차 09-18, 사장님: "왜 두 번 말해?" — 한 턴에 답이 둘이었다: 접수(말을 받는 자리)의 답 + 일을 받은 직원의 접수 답을 그대로 이어 붙였다.
      // 같은 말을 두 번 하는 것보다 나쁜 건 **서로 어긋나는 것**이다: 앞 답은 "어느 쪽으로 갈까요?" 라고 묻는데 뒤 답은 이미 시작했다고 한다 —
      // 일은 실제로 시작됐으니 앞의 물음은 대답할 곳이 없는 물음이다. 일이 생겼으면 **그 일을 받은 쪽의 말 하나만** 남긴다.
      // (찾아본 답이나 그림이 앞 답에 실려 있을 때만 둘 다 둔다 — 그건 접수 확인이 아니라 내용이다.)
      if (d.tail && d.tail !== reply) reply = d.assignment && queries.length === 0 && images.length === 0 ? d.tail : `${reply}\n\n${d.tail}`;
      if (d.why) reply += `\n\n(맡기지 못했습니다: ${d.why})`;
    } catch (e) {
      // 위임이 터져도 답은 나간다. 사용자가 물은 것에 대한 답은 이미 있다.
      // 다만 조용히 삼키면 "왜 업무가 안 생겼지" 를 아무도 모른다(08:02).
      console.error("[everyday] 위임 실패:", e instanceof Error ? e.message : e);
      reply += "\n\n(맡기는 데서 막혔습니다 — 다시 한 번 말씀해 주세요.)";
    }
  } else if (plan.capabilityId && !companyId) {
    // 여기 오는 것은 이제 로그인 안 한 사람뿐이다(로그인했으면 위에서 회사를
    // 만들었다). 그러니 "로그인하시면" 이 정확한 말이다.
    reply +=
      "\n\n(이건 시간이 드는 일이라 사람을 붙여야 합니다 — " +
      "로그인하시면 이어서 맡길 수 있습니다.)";
  }

  // ── 대화에서 회사 사실·규칙을 줍는다 ──────────────────────────
  if (companyId) {
    try {
      say("배운 것 정리하는 중");
      await learnFromChat(supabase, providers, companyId, lastUser);
    } catch {
      // 못 배운 것은 다음 턴에 다시 기회가 온다. 답을 삼킬 이유가 없다.
    }
  }

  // 저장 실패가 답을 삼키지 않는다. 기록 한 줄이 빠지는 편이 낫다.
  const conversationId = user
    ? await saveTurn(supabase, user.id, {
        conversationId: input.conversationId ?? null,
        taskId: input.taskId ?? null,
        mode: "everyday",
        user: { role: "user", content: lastUser },
        assistant: {
          role: "assistant",
          content: reply,
          // 사람을 붙였으면 그 업무 id 를 턴에 남긴다. 결과가 돌아올 자리가
          // **이 대화**뿐이라(업무 화면은 09-05 에 지웠다), 어느 턴이 어느 일을
          // 시켰는지 여기 없으면 끝난 일을 어디에 붙일지 알 수 없다.
          // 그림은 저장소로(images.ts 에 왜인지 적어 뒀다). 화면에는 dataUrl 그대로 간다.
          attachments: { images: companyId ? await stashChatImages(companyId, images) : [], sources, searched: queries, assignment },
        },
      })
    : null;

  return {
    ok: true,
    reply,
    sources,
    searched: queries,
    images,
    turnsLeft,
    conversationId,
    hired,
    assignment,
  };
}
