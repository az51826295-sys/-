import {
  CONTENT_HARD_MAX,
  REASON_MAX,
  TITLE_HARD_MAX,
  type MemoryCandidate,
} from "@/lib/memory/types";

/**
 * Anything resembling a credential must never reach long-term memory: a memory
 * is replayed verbatim into every future assignment, so one leaked key would be
 * handed to the model again and again long after anyone remembers it is there.
 */
const SENSITIVE_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "anthropic_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{10,}/ },
  { name: "openai_key", pattern: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: "supabase_key", pattern: /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/ },
  { name: "tavily_key", pattern: /\btvly-[A-Za-z0-9_-]{10,}/ },
  { name: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "aws_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "bearer_token", pattern: /\b(bearer|authorization)\s*[:=]\s*\S{12,}/i },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ },
  { name: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "password", pattern: /\b(password|passwd|secret)\s*[:=]\s*\S{6,}/i },
  { name: "card_number", pattern: /\b(?:\d[ -]?){13,16}\b/ },
  { name: "korean_rrn", pattern: /\b\d{6}[-\s]?[1-4]\d{6}\b/ },
];

export type CandidateRejection = { reason: string };

export function findSensitiveContent(text: string): string | null {
  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return null;
}

/**
 * Shape and safety checks that do not need the database. Ownership of the cited
 * sources is verified separately, against rows the caller can actually see.
 */
export function validateCandidate(
  candidate: MemoryCandidate,
): CandidateRejection | null {
  const title = candidate.title.trim();
  const content = candidate.content.trim();

  if (!title) return { reason: "empty_title" };
  if (!content) return { reason: "empty_content" };
  if (title.length > TITLE_HARD_MAX) return { reason: "title_too_long" };
  if (content.length > CONTENT_HARD_MAX) return { reason: "content_too_long" };
  if ((candidate.reason ?? "").length > REASON_MAX) {
    return { reason: "reason_too_long" };
  }

  const sensitive = findSensitiveContent(`${title}\n${content}\n${candidate.reason}`);
  if (sensitive) return { reason: `sensitive_information:${sensitive}` };

  // A claim about the outside world needs evidence from the outside world.
  if (
    candidate.category === "research_insight" &&
    !candidate.sourceReferences.some((ref) => ref.type === "research_source")
  ) {
    return { reason: "research_insight_without_source" };
  }

  if (candidate.sourceReferences.length === 0) {
    return { reason: "no_source_reference" };
  }

  return null;
}

/** Comparable form for duplicate detection: case, spacing and punctuation are
 *  noise when deciding whether two lessons say the same thing. */
export function normalizeForComparison(text: string): string {
  return (
    text
      .toLowerCase()
      // Any letter or digit in any script, not just a-z0-9. The old pattern
      // deleted every non-Latin character, which meant two identical pieces of
      // Korean text normalised to empty strings and scored zero similarity —
      // so nothing written in Korean was ever recognised as a repeat of
      // anything, including itself.
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Jaccard overlap on words — enough to catch a restatement without pretending
 *  to be semantic search. */
export function similarity(a: string, b: string): number {
  const left = new Set(normalizeForComparison(a).split(" ").filter(Boolean));
  const right = new Set(normalizeForComparison(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }
  return shared / (left.size + right.size - shared);
}

export const DUPLICATE_THRESHOLD = 0.75;
