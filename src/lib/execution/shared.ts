import { createClient } from "@/lib/supabase/server";
import { createAnthropicProvider } from "@/lib/providers/anthropic";
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

export function defaultProviders(): Providers {
  // AI_PROVIDER=mock swaps in a deterministic stand-in so the pipeline can be
  // exercised without model spend. The mock refuses to construct in production.
  const ai =
    process.env.AI_PROVIDER === "mock"
      ? createMockAIProvider()
      : createAnthropicProvider();

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
