import { checkUrlSafety } from "@/lib/research/url";
import type { ContentFetcher, FetchedContent } from "./types";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_000_000;

/** Strips chrome so the model reads the document, not the navigation. */
function extractText(html: string): { title?: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");

  const text = decodeEntities(stripped).replace(/\s+/g, " ").trim();

  return {
    title: titleMatch ? decodeEntities(titleMatch[1]).trim() : undefined,
    text,
  };
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

export function createHttpContentFetcher(): ContentFetcher {
  return {
    name: "http",

    async fetch(url): Promise<FetchedContent> {
      const initial = checkUrlSafety(url);
      if (!initial.ok) {
        throw new Error(`BLOCKED_URL:${initial.reason}`);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(initial.url.toString(), {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": "AIWorkforceResearchBot/1.0",
            Accept: "text/html,application/xhtml+xml",
          },
        });

        // A public URL may redirect somewhere private — re-check where we landed.
        const finalCheck = checkUrlSafety(response.url || initial.url.toString());
        if (!finalCheck.ok) {
          throw new Error(`BLOCKED_REDIRECT:${finalCheck.reason}`);
        }

        if (!response.ok) {
          throw new Error(`FETCH_HTTP_${response.status}`);
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("html") && !contentType.includes("text")) {
          throw new Error("UNSUPPORTED_CONTENT_TYPE");
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_BYTES) {
          throw new Error("CONTENT_TOO_LARGE");
        }

        const html = new TextDecoder().decode(buffer);
        const { title, text } = extractText(html);

        return { finalUrl: finalCheck.url.toString(), title, text };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
