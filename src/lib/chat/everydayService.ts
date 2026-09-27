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
      /** 185회차: 답에 붙는 파일(지난 결과물을 다시 내줄 때). */
      files?: { path: string; contents?: string; href?: string }[] | null;
    }
  | { ok: false; error: string; status: number };

/** 자(chat_bench)가 이것을 그대로 쓴다 — 시험이 제품과 다른 스키마로 돌면 게이트를 못 잰다. */
export const firstPass = z.object({
  /**
   * 이 물음이 **풀어야 아는 것**인가. 맞으면 아래 `reply` 는 버리고 판단 자리에서 다시 푼다.
   *
   * 226회차 09-27 실측이 근거다(사장님: "로키 수학문제라도 알려줘"). 수능 4점 문제 둘을
   * **각각 다섯 번** 물었다:
   *
   * | 자리 | 맞음 |
   * |---|---|
   * | 싼 자리 3000 (직원 대화) | 5/10 |
   * | **싼 자리 16000 (이 파일, 지금까지)** | **3/10** — 55·55·37·55·28 로 흔들렸다 |
   * | 판단 자리 16000 | **10/10** |
   *
   * 토큰을 올려도 안 낫는다. **자리가 다른 것이다.** 그리고 문제마다 한 번씩만 재면
   * 6/6 이 나와서 이 고장이 안 보인다 — 오늘 아침에 그 한 번으로 재고 이 칸을 한 번 되돌렸다.
   * 학생은 틀린 답을 알아볼 수 없으므로 여기서는 흔들림 자체가 고장이다.
   */
  깊게: z
    .boolean()
    .describe(
      "true when answering REQUIRES working something out step by step, where one wrong step changes " +
        "the answer: math problems, probability and counting, algebra, calculus, proofs, unit conversion, " +
        "tracing what code prints, comparing numbers. Also true when the user photographed a problem to solve. " +
        "false for chat, opinions, how-things-work explanations, requests to search, draw, or build something.",
    ),
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

/** 풀어야 아는 물음의 답. 출처 칸이 없다 — 수학에 URL 을 붙이라고 하면 지어낸다. */
const solvePass = z.object({ reply: z.string() });

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

/** 물음표로 끝나거나 묻는 낱말이 있고, 시키는 동사가 없으면 **물음**이다(174회차). 물음은 답할 것이지 맡길 것이 아니다. */
export function isPureQuestion(text: string): boolean {
  const last = text.trim();
  // 물음표 뒤에 짧은 꼬리("그런가? 안돼")가 붙어도 물음이다.
  const isQuestion = /[?？]\s*\S{0,6}$/.test(last) || /뭔\s?뜻|무슨 뜻|뭐야|뭐예요|왜\s|어떻게\s|알 수 있어|되는 거야|그런가/.test(last);
  // "만들었어?"(지난 일을 묻는 것)는 시키는 게 아니다 — 지난 꼴(었/았)은 뺀다.
  const asksWork = /만들(?!었)|해\s?줘|해줘|고쳐|고치|고칠|바꿔|바꿀|넣어|추가|빼\s?줘|조사|찾아\s?줘|써\s?줘|그려|다시\s?(해|돌)|시작|진행/.test(last);
  return isQuestion && !asksWork;
}

/** "파일 줘·올려 줘·다운로드" — 지난 결과물의 파일을 달라는 말(185회차). 고치는 말이 섞여 있으면 아니다. */
export const FILE_WORDS = /(파일|html|압축|zip)\s*(로|을|를|은|는)?\s*(올려|줘|주세요|보내|내놔|다시|다운|받)|다운로드|파일\s*(어디|없)|링크\s*(줘|보내)/i;

/** 이 대화에 마지막으로 돌아온 결과물의 파일(글 파일만). 없으면 null. */
async function lastReturnedFiles(
  db: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
): Promise<{ title: string; deliverableId: string; files: { path: string; contents: string }[] } | null> {
  const { data: rows } = await db
    .from("conversation_messages")
    .select("deliverableId:attachments->returned->>deliverableId")
    .eq("conversation_id", conversationId)
    .not("attachments->returned", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const id = ((rows ?? []) as unknown as { deliverableId: string | null }[]).map((r) => r.deliverableId).find((x): x is string => typeof x === "string");
  if (!id) return null;
  const { data: d } = await db.from("deliverables").select("id, title, files:content_json->files").eq("id", id).maybeSingle();
  if (!d) return null;
  const files = ((d.files as { path?: string; contents?: string }[] | null) ?? []).filter((f): f is { path: string; contents: string } => typeof f.path === "string" && typeof f.contents === "string");
  return { title: d.title as string, deliverableId: d.id as string, files };
}

/** 재촉·맞장구 한마디 — 새 내용이 없는 말(177회차). 이 말은 도는 일이 있으면 그 일에 대한 것이다. */
export const GO_WORDS = /^\s*(만들어|만들어\s*줘|만들자|만들어요|해\s*줘|해|시작|시작해|시작하자|시작해요|고|가자|ㄱ|ㄱㄱ|ㄱㄱㄱ|응|네|넵|예|ㅇㅇ|ㅇ|ok|okay|go|진행|진행해|그래|좋아|좋아요|빨리|빨리해|얼른)\s*[.!~]*\s*$/i;

/** 이 대화에서 아직 결과가 안 돌아온 일(돌고 있거나 차례·확인을 기다리거나 방금 끝나 안 붙은 것). 없으면 null. */
export async function inProgressAssignment(
  db: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
): Promise<{ id: string; title: string; minutes: number } | null> {
  const { lastAssignmentInConversation } = await import("@/lib/chat/delegate");
  const aid = await lastAssignmentInConversation(db, conversationId, null);
  if (!aid) return null;
  const { data: a } = await db.from("assignments").select("id, title, status, created_at").eq("id", aid).maybeSingle();
  if (!a || !["assigned", "queued", "working", "waiting", "submitted", "revision_queued", "revising"].includes(a.status as string)) return null;
  return { id: a.id as string, title: a.title as string, minutes: Math.max(0, Math.round((Date.now() - new Date(a.created_at as string).getTime()) / 60_000)) };
}

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
        const r = await resumeApproved(supabase, pending, null);
        // 169회차: HTML 게임에도 "유니티가 재요" 라고 답했다(사장님 화면 09-17). 재는 판에만 그 말을 한다.
        // 175회차 사장님 "말투 좀 바꿔야 돼, 유니티가 잰다 그런 거" — 안쪽 낱말(재다·붙다)을 사람 말로.
        // 177회차: 다른 일 뒤에 줄 섰으면 "시작할게요" 라고 하면 거짓말이다 — 그 일이 끝나면 이어서 한다고 말한다.
        reply = r.behind
          ? "네. 지금 앞에 하던 일이 하나 있어서, 그게 끝나면 바로 이어서 만들어요. 다 되면 여기에 올라와요."
          : pending.unity ? "네, 그대로 시작할게요. 다 되면 여기에 결과가 올라오고, 사장님 컴퓨터의 유니티에서 자동으로 한 번 확인해요." : "네, 그대로 시작할게요. 다 되면 여기에 결과가 올라와요 — 올리기 전에 브라우저에서 돌려 보고 확인해요.";
      } else {
        const r = await resumeApproved(supabase, pending, said);
        reply = r.mode === "replan"
          ? "네, 그 말을 얹어서 계획을 다시 써 볼게요. 곧 다시 보여 드려요."
          : r.behind
            ? "네, 그 말을 얹어서 만들게요. 앞에 하던 일이 끝나면 바로 이어서 해요."
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

  // ── 185회차: "파일로 올려 줘" 는 판단이 아니라 규칙이다 ──
  // 09-18 새벽 사장님 "아니 여기 파일로 올려줘" 에 로키가 "v7 파일이요 — 방금 올렸어요" 라고 **말만** 했다(일도, 파일도 없이).
  // 지난 결과물의 파일이 있으면 그것을 이 답에 그대로 붙인다. 모델을 부르지 않는다.
  if (user && companyId && input.conversationId) {
    const said = [...input.messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
    if (FILE_WORDS.test(said) && !FIX_WORDS.test(said)) {
      const last = await lastReturnedFiles(supabase, input.conversationId);
      if (last && last.files.length) {
        const html = last.files.find((f) => /\.html?$/i.test(f.path));
        const reply = `파일은 여기예요 — "${last.title}" (${last.files.length}개). ` +
          (html ? `"${html.path}" 을 열기 로 누르면 브라우저에서 바로 돌아요. 오른쪽 미리보기 안에서도 바로 해 볼 수 있어요.` : `열기 · 저장 으로 받으세요.`);
        const files = last.files.map((f) => ({ path: f.path, contents: f.contents }));
        const conversationId = await saveTurn(supabase, user.id, {
          conversationId: input.conversationId,
          taskId: input.taskId ?? null,
          mode: "everyday",
          user: { role: "user", content: said },
          assistant: { role: "assistant", content: reply, attachments: { images: [], sources: [], searched: [], assignment: null, files, refile: last.deliverableId } },
        });
        return { ok: true, reply, sources: [], searched: [], images: [], turnsLeft, conversationId, hired: null, assignment: null, files };
      }
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

  // 174회차: **물음은 일이 아니다.** 사장님이 아이패드에서 "유니티가 잰다는게 뭔뜻이야?" 라고 물었더니 접수가 그 물음을 Dev 의 일로
  // 넘겼고, Dev 는 게임 파일을 10줄 고쳐서 "설명" 이라며 돌려줬다. 접수 모델이 "방금 만든 것에 대한 물음" 을 일로 읽은 것이다.
  // 사람 말이 물음표로 끝나고 시키는 동사(만들·해 줘·고쳐·바꿔·넣어·추가·조사·써 줘)가 없으면 답만 한다 — 일로 넘기지 않는다.
  if (plan.capabilityId) {
    const last = [...input.messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
    if (isPureQuestion(last)) {
      console.log(`[접수] 물음이라 일로 안 넘긴다: "${last.slice(0, 60)}" (접수는 ${plan.capabilityId} 라 했다)`);
      plan.capabilityId = null;
      plan.capabilityWhy = null;
    }
  }

  // 177회차 09-18: **이미 시킨 일이 돌고 있으면 "만들어·시작" 은 새 일이 아니다.** 사장님이 아이패드에서 12:16 "아니 유니티 말고 html로"
  // 로 일을 시킨 뒤 40초 뒤 "만들어", 다시 "시작" 이라고 했더니 접수가 **같은 일을 셋** 만들었다(Dev 한 명에게). 재촉은 진행 상황으로 답한다.
  if (plan.capabilityId && companyId && input.conversationId) {
    const last = [...input.messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
    if (GO_WORDS.test(last)) {
      const busy = await inProgressAssignment(supabase, input.conversationId);
      if (busy) {
        console.log(`[접수] 재촉이라 일로 안 넘긴다: "${last.slice(0, 30)}" — 진행 중 ${busy.id.slice(0, 8)} ${busy.minutes}분째`);
        plan.capabilityId = null;
        plan.capabilityWhy = null;
        plan.searches = [];
        plan.reply = `지금 "${busy.title}" 을(를) 만들고 있어요 — ${busy.minutes}분째예요. 다 되면 여기에 올라와요. 고칠 게 있으면 그냥 말씀하세요.`;
      }
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
    // 226회차 09-27: 풀어야 아는 물음이면 **첫 답을 버리고** 판단 자리에서 다시 푼다.
    // 위 표 그대로 — 이 자리의 답은 3/10 이었다. 학생에게 틀린 답을 주는 것이 제일 나쁘다.
    let solved: string | null = null;
    if (plan.깊게) {
      say("풀어 보는 중");
      try {
        const { output: got } = await providers.ai.generateStructuredOutput({
          systemInstructions: [
            "너는 고3 학생에게 알려 준다. 한국어로.",
            "",
            "- **끝까지 풀어라.** 어림잡지 말고, 답이 정해질 때까지 계산한다.",
            "- 계산은 **다른 길로 한 번 더** 확인한다. 두 길이 다르면 어느 쪽이 틀렸는지 찾아라 — 골라잡지 마라.",
            "- 답과 **어떻게 나왔는지**를 같이 쓴다. 학생이 다음 문제를 혼자 풀 수 있을 만큼.",
            "- 끝까지 못 갔으면 **어디서 막혔는지 그대로 말한다.** 짐작을 답처럼 내놓지 마라.",
            "- 짧게. 필요한 단계만.",
          ].join(String.fromCharCode(10)),
          input: (work.hasAny ? `${work.text}\n\n` : "") + `대화:\n${transcript}`,
          // 사진으로 찍어 올린 문제도 여기서 푼다 — 사진을 빼면 문제를 못 본 채 답한다.
          images: seen,
          schema: solvePass,
          schemaName: "everyday_solve",
          maxTokens: 16000,
          tier: "judgment",
        });
        if (got.reply.trim()) solved = got.reply;
      } catch (error) {
        // 떨어지면 첫 답을 쓴다. 답이 없는 것보다는 낫다 — 다만 흔들릴 수 있다.
        console.warn("[everyday] 깊게 풀기 실패 — 첫 답을 쓴다:", error instanceof Error ? error.message : error);
      }
    }
    reply =
      solved ??
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
