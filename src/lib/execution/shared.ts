import { createClient } from "@/lib/supabase/server";
import { createAnthropicProvider } from "@/lib/providers/anthropic";
import { createOpenAIProvider } from "@/lib/providers/openai";
import { createDeepSeekProvider } from "@/lib/providers/deepseek";
import { createRoutedProvider } from "@/lib/providers/router";
import { createMockAIProvider } from "@/lib/providers/mock";
import { createTavilySearchProvider } from "@/lib/providers/tavily";
import { createHttpContentFetcher } from "@/lib/providers/fetcher";
import type { AIProvider, ContentFetcher, SearchProvider } from "@/lib/providers/types";
import type { Place } from "@/lib/providers/place";
import type { ExecutionErrorCode } from "@/lib/execution/types";

/**
 * The seams and small helpers every skill needs. Kept out of the engine so a
 * skill can import them without importing the engine that calls it.
 */

export interface Providers {
  ai: AIProvider;
  search: SearchProvider;
  fetcher: ContentFetcher;
}

/**
 * Which vendor runs the work.
 *
 * Named in one place because the choice is a fact about today — which vendor is
 * cheaper this quarter, which one is up — and every call site names the *work*
 * instead. `AI_PROVIDER=mock` swaps in a deterministic stand-in so the pipeline
 * can be exercised without model spend; the mock refuses to construct in
 * production.
 *
 * Falling back rather than failing when the named vendor has no key: a company
 * whose work stops because a second, optional vendor was misconfigured is worse
 * off than one that quietly keeps using the first.
 */
/** @param place 152회차: 배치 담당이 정한 자리. 없으면 지금까지의 기본 배치. */
function selectAI(place?: Place | null): AIProvider {
  // 152회차: 배치 담당이 이 일을 **주 벤더의 특정 모델**에 앉히기로 했으면, 판단 자리는 싼 쪽으로 안 내려간다.
  // 딥시크 자리를 골랐거나 아무것도 안 골랐으면 지금까지 하던 그대로다.
  const openaiPlace = place && place !== "deepseek-v4-pro" ? place : null;
  const named = process.env.AI_PROVIDER;
  if (named === "mock") return createMockAIProvider();

  // Which vendor writes the deliverables. Said out loud when the configured one
  // has no key: silently running on a different vendor than the one named makes
  // every later cost question wrong.
  let primary: AIProvider;
  if (named === "openai") {
    if (process.env.OPENAI_API_KEY) {
      primary = createOpenAIProvider(openaiPlace ? { judgmentModel: openaiPlace } : {});
    } else {
      console.warn("AI_PROVIDER=openai but OPENAI_API_KEY is unset — using anthropic.");
      primary = createAnthropicProvider();
    }
  } else {
    primary = createAnthropicProvider();
  }

  // The cheap seat, used only where a worse answer cannot become a result.
  // Absent by default: a company that has not configured it keeps the exact
  // behaviour it had before, on one vendor.
  const economy = process.env.DEEPSEEK_API_KEY ? createDeepSeekProvider() : undefined;


  // 같은 등급의 옆자리.
  //
  // 벤더 하나가 잔액이 떨어지면 판단 등급 일이 통째로 멈춘다 — 답의 품질과
  // 아무 상관 없는 이유로. 실제로 그렇게 멈춰 봤다. 옆자리는 값을 깎는 자리가
  // 아니라 같은 등급의 다른 회사라, 여기로 넘어가도 답이 나빠지지 않는다.
  const standby =
    primary.name === "anthropic" && process.env.OPENAI_API_KEY
      ? createOpenAIProvider()
      : primary.name === "openai" && process.env.ANTHROPIC_API_KEY
        ? createAnthropicProvider()
        : undefined;

  // 옆자리만 있어도 라우터를 쓴다. 예전에는 싼 자리가 있을 때만 라우터를
  // 거쳤는데, 그러면 옆자리를 붙여 놓고도 아무 데도 안 쓰이게 된다.
  return economy || standby
    ? createRoutedProvider({ primary, economy, standby, judgmentToEconomy: !openaiPlace })
    : primary;
}

/**
 * **도구가 쓴 돈도 장부에 적는다** (10-12).
 *
 * 그날 세어 보니 모델을 부르는 도구 39개 중 **장부를 거치는 것은 3개뿐**이었다.
 * 나머지 36개가 이 함수를 그냥 써서, 돈은 나가는데 `model_usage` 에 한 줄도 안 남았다 —
 * `gate_look` 을 두 번 돌리고 "비용 $0" 이라고 보고한 일이 거기서 나왔다(실제로는 $0.125).
 * **안 보이는 지출은 줄일 수도 막을 수도 없다.**
 *
 * 36개를 하나씩 고치는 대신 **지나는 자리 한 곳**에서 덮는다.
 * `ROOKERY_TOOL_COMPANY` 는 `engine/tools/rookery_env.mts` 만 심는다 —
 * 서버(웹·워커)는 이 값이 없으므로 **지금까지와 똑같이** 돈다.
 *
 * 두 번 세지 않는다: `meterAi` 는 덧씌우면 **scope 를 바꿔 끼운다**(쌓지 않는다).
 * 그래서 이미 장부를 거치는 도구 셋에 이 길이 더해져도 값이 두 배가 되지 않는다.
 *
 * **이것은 "적는 것"까지다.** 한도에 닿았을 때 **막는 것**은 `seatProviderForCompany` 가 한다 —
 * 그건 부르는 쪽이 멈출 줄 알아야 해서, 아직 셋만 그 길에 있다.
 */
export function defaultProviders(place?: Place | null): Providers {
  let ai = selectAI(place);

  const 도구회사 = process.env.ROOKERY_TOOL_COMPANY;
  if (도구회사) {
    try {
      // 여기서만 늦게 불러온다 — 서버 길에 쓸데없는 짐을 지우지 않는다

      const { meterProviders } = require("@/lib/costs/meter") as typeof import("@/lib/costs/meter");

      const { createServiceClient } = require("@/lib/supabase/service") as typeof import("@/lib/supabase/service");
      ai = meterProviders({ ai } as Providers, createServiceClient(), { companyId: 도구회사 }).ai;
    } catch {
      // 장부에 못 붙어도 도구는 돌아야 한다. 다만 조용히 넘어가지는 않는다.
      console.warn("[장부] 도구 지출을 적지 못했다 — ROOKERY_TOOL_COMPANY 는 있으나 붙이지 못했다.");
    }
  }

  return {
    ai,
    search: createTavilySearchProvider(),
    fetcher: createHttpContentFetcher(),
  };
}

export class ExecutionError extends Error {
  constructor(
    readonly code: ExecutionErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Records how far a run has got. Written before each stage rather than after,
 *  so a run that dies mid-flight leaves an accurate trail. */
export async function setStep(
  supabase: Supabase,
  executionId: string,
  step: string,
) {
  await supabase
    .from("work_executions")
    .update({ current_step: step, updated_at: new Date().toISOString() })
    .eq("id", executionId);
}
