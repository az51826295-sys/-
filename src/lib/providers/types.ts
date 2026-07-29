import type { z } from "zod";

/**
 * The seams between the Workforce OS and the outside world. Employee logic
 * depends only on these shapes, so swapping a model or search vendor is a
 * change here and nowhere else.
 */

/**
 * What kind of thinking a call needs, said by the caller in its own terms.
 *
 * Call sites name the *work*, never the model. "This is routine" is a fact the
 * caller knows and will still be true in a year; "use claude-haiku-4-5" is a
 * fact about today's price list that would then be scattered across a dozen
 * files, each needing an edit when it changes.
 *
 * "judgment" is the default because getting this wrong in that direction costs
 * money, and getting it wrong the other way costs the product.
 */
export type WorkTier =
  /** The answer is the product: research, deliverables, plans, decisions the
   *  manager will act on. Never cheapened. */
  | "judgment"
  /** Restating what already happened — summarising, extracting, labelling —
   *  where the evidence is in the input and the call is not deciding anything
   *  a person will not see before it matters. */
  | "routine";

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateStructuredOutput<T>(params: {
    systemInstructions: string;
    input: string;
    schema: z.ZodType<T>;
    /** Names the schema for logs and provider APIs that require one. */
    schemaName: string;
    maxTokens?: number;
    /** Defaults to "judgment". */
    tier?: WorkTier;
  }): Promise<{
    output: T;
    inputTokens: number;
    outputTokens: number;
    /** Which model actually ran. Returned rather than read off the provider,
     *  because the provider no longer has one answer — and a ledger that
     *  records the wrong model prices every run wrongly, which is worse than
     *  not recording it at all. */
    model: string;
  }>;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  sourceDomain: string;
  /** Body text when the provider already extracted it, saving a fetch. */
  rawContent?: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}

export interface FetchedContent {
  finalUrl: string;
  title?: string;
  text: string;
  author?: string;
  publishedAt?: string;
}

export interface ContentFetcher {
  readonly name: string;
  fetch(url: string): Promise<FetchedContent>;
}
