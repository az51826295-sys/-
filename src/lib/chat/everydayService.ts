import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";
import { selfNote, speakerFor, speakerNote } from "@/lib/chat/persona";
import { createImageProvider } from "@/lib/providers/images";
import { checkAnonymous, recordAnonymous } from "@/lib/chat/anonymous";
import { saveTurn } from "@/lib/chat/conversations";
import { capabilityCatalogue } from "@/lib/chat/companyService";
import { delegate } from "@/lib/chat/delegate";
import { learnFromChat } from "@/lib/chat/learnFromChat";
import { planUnitySession } from "@/lib/unity/plan";

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
  unityWant: z.string().nullable(),
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
  const companyId = (company?.id as string | undefined) ?? null;

  if (companyId && (await blockedBySpendLimit(supabase, companyId))) {
    return {
      ok: true,
      reply: "이번 기간 지출 한도에 걸려 있습니다. 한도가 리셋되면 이어서 하겠습니다.",
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

  const transcript = input.messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  // 사진은 로그인한 사람만 올릴 수 있다. 비전 호출은 글보다 비싸고, 익명 하루
  // 상한이 사진 몇 장에 다 쓰이면 그날 나머지 사람이 대화를 못 한다.
  const seen = user ? (input.images ?? []).slice(0, 4) : [];

  const say = input.onStatus ?? (() => {});
  say("생각하는 중");

  const { output: plan } = await providers.ai.generateStructuredOutput({
    systemInstructions:
      "너는 유능한 조수다. 한국어로 답한다.\n\n" +
      "먼저 판단한다: **지금 아는 것으로 제대로 답할 수 있는가?**\n" +
      "- 그렇다면 `reply` 에 답을 쓰고 `searches` 는 비운다. " +
      "짧게 자르지 말고 물은 만큼 답한다.\n" +
      "- 최신 사실·가격·뉴스·특정 문서처럼 **찾아봐야 정확한 것**이면 " +
      "`reply` 를 비우고 `searches` 에 검색어를 최대 3개 쓴다.\n\n" +
      (seen.length > 0
        ? "사용자가 사진을 같이 올렸다. **보이는 것만 말하라** — 안 보이는 것을 " +
          "있는 것처럼 말하면 사용자는 자기 사진을 잘못 읽었다는 사실조차 모른다. " +
          "흐리거나 잘려서 못 읽는 부분은 못 읽겠다고 말한다.\n\n"
        : "") +
      "확실하지 않은데 아는 척하지 마라. 그럴 때가 검색할 때다.\n\n" +
      "**일 맡기기**: 조사·검증·문서·그림 제작처럼 **시간이 드는 일**이면 " +
      "`capabilityId` 에 아래 목록의 id 를 쓴다. 한 번 답하고 끝날 질문이면 " +
      "비운다 — 잡담에 사람을 붙이면 매니저가 안 시킨 일이 쌓인다.\n" +
      capabilityCatalogue()
        .map((c) => `  - ${c.capabilityId}: ${c.label} → ${c.produces}`)
        .join("\n") +
      "\n**목록에 있는 id 만 쓴다.** 없는 것을 지어내면 조용히 빗나간다.\n\n" +
      "**유니티**: 유니티 프로젝트에서 무언가를 **만들거나 고쳐 달라**고 하면 " +
      "`unityWant` 에 무엇을 만들지 한 문단으로 쓴다. 그러면 설계도와 합격 " +
      "기준이 만들어지고, 사장님 PC의 심부름꾼이 유니티를 켜서 진행한다. " +
      "유니티에 대해 **묻기만** 한 것이면 비워 둔다 — 물음에는 답을 하는 것이지 " +
      "프로젝트에 파일을 쓰는 것이 아니다.\n" +
      "이때 `reply` 는 **한두 문장**이면 된다. 되묻지 마라 — 2D냐 3D냐, 아트 " +
      "스타일이 뭐냐, 애니메이션은 뭐가 필요하냐 같은 것을 늘어놓지 마라. " +
      "안 적힌 것은 네가 정하고, 정한 것은 곧 나올 **설계도에 그대로 적혀 " +
      "나온다.** 사람은 그걸 보고 틀렸다고 말하면 된다. 질문 목록을 먼저 " +
      "내미는 것은 시작을 사람에게 떠넘기는 것이고, 답할 것이 여섯 개면 대개 " +
      "아무도 답하지 않는다. 정하는 사람만 알 수 있는 것 하나에 정말로 막혔을 " +
      "때만, 그 하나만 묻는다.\n\n" +
      "**그림**: 사용자가 그려 달라고 하면 `drawings` 에 묘사를 쓴다(최대 2개). " +
      "묘사는 영어로, 무엇을 어떤 구도·색·분위기로 그릴지 구체적으로. " +
      "그려 달라고 하지 않았으면 비워 둔다 — 설명으로 될 것을 그림으로 내면 " +
      "느리기만 하다." +
      selfNote() +
      speakerNote(speaker),
    input: transcript,
    images: seen,
    schema: firstPass,
    schemaName: "everyday_plan",
    maxTokens: 8000,
    // 익명은 대화 등급까지만. 보고서를 익명으로 뽑아 가는 길을 열지 않는다.
    tier: user ? "judgment" : "conversation",
  });

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
    reply = plan.reply ?? (images.length ? "그렸습니다." : "무엇을 도와드릴까요?");
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
      input: `대화:\n${transcript}\n\n검색 결과:\n${notes.join("\n\n")}`,
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

  if (drawFailures.length) reply += "\n\n" + drawFailures.join("\n");

  // ── 유니티에서 만들어 달라고 했으면 세션을 연다 ────────────────
  //
  // 여기서 하는 것은 **설계까지**다. 코드를 쓰고 유니티를 켜는 것은 사장님
  // PC의 심부름꾼이 한다 — 서버가 남의 기계를 여는 통로를 만드는 것은 이
  // 제품이 하지 않는 일이라, 그 경계가 여기다.
  if (plan.unityWant && companyId) {
    say("유니티 일 설계하는 중");
    try {
      const made = await planUnitySession({
        db: supabase,
        providers,
        companyId,
        want: plan.unityWant,
      });
      if ("error" in made) {
        reply += `

(유니티 일을 열지 못했습니다: ${made.error})`;
      } else {
        reply +=
          `

──
**유니티: ${made.title}**
` +
          `설계했습니다 — 파일 ${made.planned.length}개, 합격 기준 ${made.criteria.length}개` +
          (made.droppedCriteria > 0
            ? ` (반쪽만 쓰인 ${made.droppedCriteria}개는 뺐습니다).`
            : ".") + `
` +
          made.planned.map((f) => `- ${f.path}`).join("\n") +
          "\n\n사장님 PC에서 심부름꾼이 돌고 있으면 알아서 집어 갑니다. " +
          "없으면 이 줄을 터미널에 넣으십시오:\n" +
          "`python tools/unity_runner.py --watch`\n\n" +
          "**합격 기준은 아직 확인되지 않았습니다.** 컴파일과 씬 생성은 기계가 " +
          "재고, 원하던 것이 됐는지는 켜 보셔야 압니다.";
      }
    } catch (error) {
      // 유니티가 터져도 답은 나간다. 물어본 것에 대한 답은 이미 있다.
      reply += `

(유니티 일을 열다 막혔습니다: ${
        error instanceof Error ? error.message : String(error)
      })`;
    }
  } else if (plan.unityWant && !companyId) {
    reply +=
      "\n\n(유니티 일은 회사에 쌓입니다 — 로그인하시면 이어서 맡길 수 있습니다.)";
  }

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
      );
      hired = d.hired;
      assignment = d.assignment;
      if (d.tail && d.tail !== reply) reply += `\n\n${d.tail}`;
      if (d.why) reply += `\n\n(맡기지 못했습니다: ${d.why})`;
    } catch {
      // 위임이 터져도 답은 나간다. 사용자가 물은 것에 대한 답은 이미 있다.
    }
  } else if (plan.capabilityId && !companyId) {
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
          attachments: { images, sources, searched: queries },
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
