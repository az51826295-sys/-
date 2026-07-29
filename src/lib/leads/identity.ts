import { domainOf } from "@/lib/research/url";

/**
 * Domains that host other people's pages. A profile or article on one of these
 * identifies a company but is never that company's own site — recording
 * "linkedin.com" as the domain would merge every company found through
 * LinkedIn into a single lead.
 */
const HOSTED_PLATFORM_DOMAINS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "medium.com",
  "substack.com",
  "github.com",
  "notion.site",
  "wordpress.com",
  "blogspot.com",
  "wixsite.com",
  "webflow.io",
  "squarespace.com",
  "crunchbase.com",
  "glassdoor.com",
  "indeed.com",
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "ashbyhq.com",
  "bamboohr.com",
  // Job boards and recruiters. A hiring-signal search surfaces these first,
  // and each one looks like "a company with a careers page" to a naive check.
  "ziprecruiter.com",
  "simplyhired.com",
  "thesaasjobs.com",
  "jobgether.com",
  "welovesalt.com",
  "monster.com",
  "dice.com",
  "remoterocketship.com",
  "remote.co",
  "weworkremotely.com",
  "remoteok.com",
  "builtin.com",
  "otta.com",
  "himalayas.app",
  "jobs.lever.co",
  "adzuna.com",
  "talent.com",
  "jooble.org",
  "startup.jobs",
  "workatastartup.com",
  "ycombinator.com",
  "g2.com",
  "capterra.com",
  "producthunt.com",
  "wellfound.com",
  "angel.co",
  "bloomberg.com",
  "reuters.com",
  "techcrunch.com",
  "forbes.com",
  "sites.google.com",
  "notion.so",
]);

/** Suffixes that are part of the platform, not the company. */
const HOSTED_PLATFORM_SUFFIXES = [
  ".myshopify.com",
  ".herokuapp.com",
  ".vercel.app",
  ".netlify.app",
  ".github.io",
  ".pages.dev",
  ".firebaseapp.com",
];

export function isHostedPlatformDomain(domain: string): boolean {
  if (!domain) return true;
  const bare = domain.replace(/^www\./, "");
  if (HOSTED_PLATFORM_DOMAINS.has(bare)) return true;
  // Subdomains of a platform are the platform too (jobs.lever.co).
  for (const platform of HOSTED_PLATFORM_DOMAINS) {
    if (bare.endsWith(`.${platform}`)) return true;
  }
  return HOSTED_PLATFORM_SUFFIXES.some((suffix) => bare.endsWith(suffix));
}

/**
 * The company's own domain, or null when the URL points at somebody else's
 * platform. Deduplication keys on this, so getting it wrong either splits one
 * company into several rows or collapses several into one.
 */
export function companyDomainOf(rawUrl: string): string | null {
  const domain = domainOf(rawUrl);
  if (!domain) return null;
  if (isHostedPlatformDomain(domain)) return null;

  // A company's marketing site and its app or careers subdomain are the same
  // company: keep the registrable-looking tail rather than the subdomain.
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;

  // Two-part public suffixes that would otherwise be truncated to "co.uk".
  const tail3 = parts.slice(-3).join(".");
  const tail2 = parts.slice(-2).join(".");
  const twoPartSuffixes = [
    "co.uk", "co.kr", "co.jp", "com.au", "com.br", "co.nz", "co.za",
    "com.sg", "com.mx", "co.in", "or.kr", "ne.jp", "com.tr",
  ];
  return twoPartSuffixes.includes(tail2) ? tail3 : tail2;
}

/** Comparable company name: case, punctuation and legal suffixes are noise. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(inc|llc|ltd|limited|corp|corporation|gmbh|bv|ab|as|sa|plc|co|company|holdings|group|technologies|technology|labs|software)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-effort homepage for a company domain, used when the only URL found was
 *  a deep page on the company's own site. */
export function homepageFor(domain: string): string {
  return `https://${domain}`;
}

/**
 * Domains that turned out to be aggregators, judged by what was actually found
 * rather than by a list.
 *
 * The blocklist above only catches sites we already know about, and there is no
 * end to the number of job boards and directories on the web. But a real
 * company's domain describes one company: if several different company names
 * were all traced back to the same domain in a single run, that domain is a
 * directory, and none of those rows is a real lead.
 */
export function findAggregatorDomains(
  candidates: { domain: string; companyName: string }[],
): Set<string> {
  const namesByDomain = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    const names = namesByDomain.get(candidate.domain) ?? new Set<string>();
    const normalized = normalizeCompanyName(candidate.companyName);
    if (normalized) names.add(normalized);
    namesByDomain.set(candidate.domain, names);
  }

  return new Set(
    [...namesByDomain.entries()]
      .filter(([, names]) => names.size > 1)
      .map(([domain]) => domain),
  );
}

/**
 * Whether a company's name is recognisable in its own web address. Not a
 * rejection on its own — real companies do rebrand and buy unrelated domains —
 * but a name with nothing in common with its domain is usually a page title
 * that was mistaken for a company, so it is worth telling the manager.
 */
export function nameMatchesDomain(companyName: string, domain: string): boolean {
  const host = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  if (!host) return false;

  const words = normalizeCompanyName(companyName)
    .split(" ")
    .filter((word) => word.length >= 3);

  return words.some((word) => host.includes(word) || word.includes(host));
}
