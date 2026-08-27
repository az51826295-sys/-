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
  /** The answer is the product: reports, deliverables, plans, decisions the
   *  manager will act on. Never cheapened — this is what the company sells. */
  | "judgment"
  /**
   * Checking a claim against something that already exists — does this app do
   * what the listing says, does this page still say what we cited, does this
   * number match the source.
   *
   * Separated from `judgment` because the answer is bounded: there is a right
   * answer sitting in the evidence, and being wrong shows up immediately when
   * someone opens the link. It does not need the model that writes the report.
   */
  | "verification"
  /**
   * Talking. Answering a question, acknowledging, asking what someone meant.
   *
   * The cheapest tier, and safe to be cheap for a reason that is structural
   * rather than optimistic: nothing here is written down as a result. A worse
   * reply is a worse sentence in a conversation the person is already in, and
   * they will say so in the next message.
   */
  | "conversation"
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
    /**
     * 같이 보는 그림. base64(PNG/JPEG), 데이터 URL 접두사 없이.
     *
     * 글과 따로 받는 이유는 벤더마다 싣는 모양이 다르기 때문이다 — 호출하는
     * 쪽이 그 차이를 알 필요는 없다.
     *
     * **모든 등급이 그림을 볼 수 있는 것은 아니다.** 값싼 벤더 중에는 아예
     * 못 보는 것이 있고, 그 경우 조용히 글만 읽고 답하면 사용자는 자기 사진을
     * 보고 한 말인 줄 안다. 라우터가 그림이 있는 호출을 볼 수 있는 쪽으로
     * 올려 보낸다.
     */
    images?: string[];
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
