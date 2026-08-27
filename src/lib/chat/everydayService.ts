import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";
import { speakerFor, speakerNote } from "@/lib/chat/persona";
import { createImageProvider } from "@/lib/providers/images";
import { checkAnonymous, recordAnonymous } from "@/lib/chat/anonymous";
import { saveTurn } from "@/lib/chat/conversations";

/**
 * 일상 모드 — 회사 밖의 대화.
 *
 * 회사 모드는 사람을 뽑고 업무를 만들고 산출물을 검토받는다. 그건 일이 클 때
 * 값어치를 하지만, "이거 뭐야" 한 마디에는 절차만 얹는 셈이다. 그래서 두 모드를
 * 가른다: **일상은 설정 없이 그 자리에서 쓸모가 있어야 하고, 회사는 두 번째
 * 요청부터 이긴다.**
 *
 * 일상 모드가 그냥 모델 호출과 다른 점은 하나뿐이다: **필요하면 먼저 찾아본다.**
 * 모델이 스스로 "이건 최신 사실이 필요하다"고 말하면 검색을 돌리고, 찾은 것을
 * 근거로 답하고, **출처를 같이 준다.** 필요 없으면 한 번만 부르고 끝낸다 —
 * 잡담에 검색을 붙이는 것은 느리기만 하고 나아지지 않는다.
 */

export type EverydayInput = {
  messages: { role: "user" | "assistant"; content: string }[];
  /** 로그인 안 한 사람이 브라우저에 들고 다니는 값. 사람을 식별하지 않는다. */
  visitor?: string;
  /** 이어서 저장할 대화. 없으면 새로 만든다. 익명이면 무시된다. */
  conversationId?: string | null;
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
    };
  }

  const providers = companyId
    ? meterProviders(defaultProviders(), supabase, { companyId })
    : defaultProviders();

  const speaker = user ? await speakerFor(supabase, user.id) : null;

  const transcript = input.messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const { output: plan } = await providers.ai.generateStructuredOutput({
    systemInstructions:
      "너는 유능한 조수다. 한국어로 답한다.\n\n" +
      "먼저 판단한다: **지금 아는 것으로 제대로 답할 수 있는가?**\n" +
      "- 그렇다면 `reply` 에 답을 쓰고 `searches` 는 비운다. " +
      "짧게 자르지 말고 물은 만큼 답한다.\n" +
      "- 최신 사실·가격·뉴스·특정 문서처럼 **찾아봐야 정확한 것**이면 " +
      "`reply` 를 비우고 `searches` 에 검색어를 최대 3개 쓴다.\n\n" +
      "확실하지 않은데 아는 척하지 마라. 그럴 때가 검색할 때다.\n\n" +
      "**그림**: 사용자가 그려 달라고 하면 `drawings` 에 묘사를 쓴다(최대 2개). " +
      "묘사는 영어로, 무엇을 어떤 구도·색·분위기로 그릴지 구체적으로. " +
      "그려 달라고 하지 않았으면 비워 둔다 — 설명으로 될 것을 그림으로 내면 " +
      "느리기만 하다." +
      speakerNote(speaker),
    input: transcript,
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

  if (queries.length === 0) {
    const note = drawFailures.length ? "\n\n" + drawFailures.join("\n") : "";
    const reply =
      (plan.reply ?? (images.length ? "그렸습니다." : "무엇을 도와드릴까요?")) + note;
    // 저장 실패가 답을 삼키지 않는다. 기록 한 줄이 빠지는 편이 낫다.
    const conversationId = user
      ? await saveTurn(supabase, user.id, {
          conversationId: input.conversationId ?? null,
          mode: "everyday",
          user: { role: "user", content: lastUser },
          assistant: { role: "assistant", content: reply, attachments: { images } },
        })
      : null;
    return {
      ok: true,
      reply,
      sources: [],
      searched: [],
      images,
      turnsLeft,
      conversationId,
    };
  }

  // 검색이 실패해도 대화는 계속된다. 찾아보려던 것이 안 됐다는 사실만 남긴다 —
  // 조용히 모델의 기억으로 답하면 사용자는 그것이 검색 결과인 줄 안다.
  const found: EverydaySource[] = [];
  const notes: string[] = [];
  for (const q of queries) {
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

  const { output: answer } = await providers.ai.generateStructuredOutput({
    systemInstructions:
      "아래 검색 결과를 근거로 답한다. 한국어로.\n\n" +
      "- 결과에 없는 것을 결과에 있는 것처럼 쓰지 마라. " +
      "모르면 모른다고 하고, 무엇을 더 찾아보면 되는지 말한다.\n" +
      "- 사실마다 어디서 왔는지 알 수 있게 쓰고, 실제로 쓴 출처만 `usedUrls` 에 담는다.\n" +
      "- 검색이 실패했다고 적힌 항목이 있으면 그 사실을 답에 밝힌다.",
    input: `대화:\n${transcript}\n\n검색 결과:\n${notes.join("\n\n")}`,
    schema: answerPass,
    schemaName: "everyday_answer",
    maxTokens: 12000,
    tier: "judgment",
  });

  const used = new Set(answer.usedUrls);
  const sources = found.filter((s) => used.has(s.url));
  const reply =
    answer.reply + (drawFailures.length ? "\n\n" + drawFailures.join("\n") : "");
  const conversationId = user
    ? await saveTurn(supabase, user.id, {
        conversationId: input.conversationId ?? null,
        mode: "everyday",
        user: { role: "user", content: lastUser },
        assistant: {
          role: "assistant",
          content: reply,
          // 출처와 그린 그림도 같이 남긴다. 대화를 다시 열었을 때 답만 있고
          // 근거가 없으면, 그때 무엇을 보고 그렇게 답했는지 알 수 없다.
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
    conversationId,
    turnsLeft,
  };
}
