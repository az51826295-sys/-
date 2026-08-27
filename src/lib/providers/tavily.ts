import { checkUrlSafety, domainOf } from "@/lib/research/url";
import type { SearchProvider, SearchResult } from "./types";

const ENDPOINT = "https://api.tavily.com/search";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string | null;
  published_date?: string;
}

/**
 * Tavily returns extracted page text alongside each hit, so most sources never
 * need a separate fetch. Results that arrive without body text fall through to
 * the ContentFetcher.
 */
export function createTavilySearchProvider(): SearchProvider {
  /**
   * The key is read when a search actually happens, not when the provider is
   * built.
   *
   * Every caller gets the whole provider set from one place, so building this
   * eagerly meant a missing search key killed features that never search — a
   * chat turn died with "TAVILY_API_KEY is not set", which is true and also
   * completely beside the point for someone who just typed a message. Deferring
   * the check moves the error to the moment it is the real problem.
   */
  const keyOrThrow = () => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY is not set.");
    return apiKey;
  };

  return {
    name: "tavily",

    async search(query, maxResults) {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyOrThrow()}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          search_depth: "basic",
          include_raw_content: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`SEARCH_HTTP_${response.status}`);
      }

      const body = (await response.json()) as { results?: TavilyResult[] };

      const results: SearchResult[] = [];

      for (const item of body.results ?? []) {
        if (!item.url || !item.title) continue;
        // Drop anything we would refuse to fetch anyway.
        if (!checkUrlSafety(item.url).ok) continue;

        results.push({
          title: item.title,
          url: item.url,
          snippet: item.content ?? undefined,
          publishedAt: item.published_date ?? undefined,
          sourceDomain: domainOf(item.url),
          rawContent: item.raw_content ?? undefined,
        });
      }

      return results;
    },
  };
}
