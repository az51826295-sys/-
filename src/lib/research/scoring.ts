import { domainOf } from "@/lib/research/url";
import type { SearchResult } from "@/lib/providers/types";
import { SOURCE_TYPES } from "@/lib/execution/types";

type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Rule-based scoring, not a model. Scores exist only to rank which sources are
 * worth reading and citing — they are never shown to the user, who should not
 * be reading "trust: 84" off a research report.
 */
export interface ScoredSource {
  result: SearchResult;
  sourceType: SourceType;
  trustScore: number;
  relevanceScore: number;
}

const WEAK_DOMAIN_HINTS = [
  "pinterest.",
  "quora.com",
  "medium.com",
  "blogspot.",
  "wordpress.com",
  "slideshare.net",
];

const PUBLICATION_HINTS = [
  "techcrunch.com",
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "theverge.com",
  "forbes.com",
  "businessinsider.com",
  "cnbc.com",
  "arstechnica.com",
];

const REVIEW_HINTS = ["g2.com", "capterra.com", "trustradius.com", "gartner.com"];

function classify(url: string, knownDomains: Set<string>): SourceType {
  const domain = domainOf(url);
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  const isOfficial = knownDomains.has(domain);

  if (isOfficial && /pricing|plans/.test(path)) return "official_pricing";
  if (isOfficial && /docs|documentation|developer/.test(path)) {
    return "official_documentation";
  }
  if (isOfficial && /blog|news|press|announc|release/.test(path)) {
    return "official_announcement";
  }
  if (isOfficial) return "official_website";

  if (domain.endsWith("sec.gov") || domain.endsWith("gov.uk") || /filing/.test(path)) {
    return "regulatory_filing";
  }
  if (REVIEW_HINTS.some((hint) => domain.includes(hint))) return "review_platform";
  if (PUBLICATION_HINTS.some((hint) => domain.includes(hint))) {
    return "reputable_publication";
  }

  return "official_website";
}

const TRUST_BY_TYPE: Record<SourceType, number> = {
  official_pricing: 70,
  official_documentation: 65,
  official_announcement: 60,
  official_website: 40,
  regulatory_filing: 65,
  reputable_publication: 45,
  review_platform: 30,
};

export function scoreSources(
  results: SearchResult[],
  input: {
    assignmentTitle: string;
    assignmentDescription: string;
    companyName: string;
    competitors: string[];
    companyWebsite?: string;
  },
): ScoredSource[] {
  // Domains we consider "official": the company's own, plus each competitor's
  // name used as a domain guess.
  const knownDomains = new Set<string>();
  if (input.companyWebsite) knownDomains.add(domainOf(input.companyWebsite));
  for (const competitor of input.competitors) {
    const bare = competitor
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .trim();
    if (bare.includes(".")) {
      knownDomains.add(domainOf(`https://${bare}`));
    } else if (bare) {
      knownDomains.add(`${bare.replace(/\s+/g, "")}.com`);
    }
  }
  knownDomains.delete("");

  const keywords = `${input.assignmentTitle} ${input.assignmentDescription}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);

  const names = [input.companyName, ...input.competitors]
    .map((name) => name.toLowerCase())
    .filter(Boolean);

  const twelveMonthsAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

  return results.map((result) => {
    const sourceType = classify(result.url, knownDomains);
    let trustScore = TRUST_BY_TYPE[sourceType];

    const domain = domainOf(result.url);
    if (WEAK_DOMAIN_HINTS.some((hint) => domain.includes(hint))) trustScore -= 25;
    // A source we could only read as a snippet is weaker evidence.
    if (!result.rawContent) trustScore -= 10;

    let relevanceScore = 0;
    const haystack = `${result.title} ${result.snippet ?? ""}`.toLowerCase();

    if (keywords.some((word) => haystack.includes(word))) relevanceScore += 20;
    if (names.some((name) => haystack.includes(name) || domain.includes(name))) {
      relevanceScore += 20;
    }
    if (result.publishedAt) {
      const published = Date.parse(result.publishedAt);
      if (!Number.isNaN(published) && published >= twelveMonthsAgo) {
        relevanceScore += 20;
      }
    }
    if (result.rawContent && result.rawContent.length > 500) relevanceScore += 10;

    return { result, sourceType, trustScore, relevanceScore };
  });
}

export function rankSources(scored: ScoredSource[]): ScoredSource[] {
  return [...scored].sort(
    (a, b) =>
      b.trustScore + b.relevanceScore - (a.trustScore + a.relevanceScore),
  );
}
