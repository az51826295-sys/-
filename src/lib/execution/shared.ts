import { createClient } from "@/lib/supabase/server";
import { createAnthropicProvider } from "@/lib/providers/anthropic";
import { createOpenAIProvider } from "@/lib/providers/openai";
import { createDeepSeekProvider } from "@/lib/providers/deepseek";
import { createRoutedProvider } from "@/lib/providers/router";
import { createMockAIProvider } from "@/lib/providers/mock";
import { createTavilySearchProvider } from "@/lib/providers/tavily";
import { createHttpContentFetcher } from "@/lib/providers/fetcher";
import type { AIProvider, ContentFetcher, SearchProvider } from "@/lib/providers/types";
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
function selectAI(): AIProvider {
  const named = process.env.AI_PROVIDER;
  if (named === "mock") return createMockAIProvider();

  // Which vendor writes the deliverables. Said out loud when the configured one
  // has no key: silently running on a different vendor than the one named makes
  // every later cost question wrong.
  let primary: AIProvider;
  if (named === "openai") {
    if (process.env.OPENAI_API_KEY) {
      primary = createOpenAIProvider();
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
    ? createRoutedProvider({ primary, economy, standby })
    : primary;
}

export function defaultProviders(): Providers {
  const ai = selectAI();

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
