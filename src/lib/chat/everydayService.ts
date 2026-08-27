import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";

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
};

export type EverydaySource = { title: string; url: string };

export type EverydayResult =
  | { ok: true; reply: string; sources: EverydaySource[]; searched: string[] }
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
});

const answerPass = z.object({
  reply: z.string(),
  /** 실제로 근거로 쓴 출처의 url. 안 쓴 것은 넣지 않는다. */
  usedUrls: z.array(z.string()),
});

const MAX_SEARCHES = 3;
const RESULTS_PER_SEARCH = 5;

export async function runEverydayTurn(
  input: EverydayInput,
): Promise<EverydayResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in.", status: 401 };

  // 회사가 없어도 일상 모드는 돈다. 다만 회사가 있으면 그 한도 안에서 쓴다 —
  // 개인 대화가 회사 한도를 우회하는 구멍이 되면 안 된다.
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  const companyId = (company?.id as string | undefined) ?? null;

  if (companyId && (await blockedBySpendLimit(supabase, companyId))) {
    return {
      ok: true,
      reply: "이번 기간 지출 한도에 걸려 있습니다. 한도가 리셋되면 이어서 하겠습니다.",
      sources: [],
      searched: [],
    };
  }

  const providers = companyId
    ? meterProviders(defaultProviders(), supabase, { companyId })
    : defaultProviders();

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
      "확실하지 않은데 아는 척하지 마라. 그럴 때가 검색할 때다.",
    input: transcript,
    schema: firstPass,
    schemaName: "everyday_plan",
    maxTokens: 8000,
    tier: "judgment",
  });

  const queries = plan.searches.slice(0, MAX_SEARCHES).filter((q) => q.trim());

  if (queries.length === 0) {
    return {
      ok: true,
      reply: plan.reply ?? "무엇을 도와드릴까요?",
      sources: [],
      searched: [],
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
  return {
    ok: true,
    reply: answer.reply,
    sources: found.filter((s) => used.has(s.url)),
    searched: queries,
  };
}
