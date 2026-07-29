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
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not set.");
  }

  return {
    name: "tavily",

    async search(query, maxResults) {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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
