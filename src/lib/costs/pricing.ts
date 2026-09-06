/**
 * What the backends cost, in one place.
 *
 * Kept here rather than inline at the call site so a rate change is one edit —
 * and so nothing can quietly price a run with a number nobody updated.
 *
 * This file used to assume every call was a language model billed per token,
 * because every call was. A team whose work is an image or a piece of music
 * breaks that assumption in a way that is dangerous rather than inconvenient:
 * an image service charges per picture, so a per-token price sheet reports
 * every picture as free — and a spend limit that adds up free things never
 * stops anything.
 */

/** How a backend counts what it sold. */
export type BillingUnit =
  /** Language models: priced separately for what went in and what came out. */
  | "tokens"
  /** Image generation: a flat price per picture. */
  | "images"
  /** Audio and music: priced by the length of what was produced. */
  | "seconds";

type Rate =
  /** Per million tokens, in US dollars. */
  | { unit: "tokens"; input: number; output: number; /** 캐시에 맞은 입력의 값(1M당). 없으면 input 값. */ cachedInput?: number }
  /** Per one unit, in US dollars. */
  | { unit: "images"; per: number }
  | { unit: "seconds"; per: number };

/** A backend not listed here cannot be used. See `rateFor`. */
const RATES: Record<string, Rate> = {
  "claude-opus-5": { unit: "tokens", input: 5, output: 25 },
  // Corrected 2026-08-27. This had been 3/15, which is the Sonnet **4.6** rate.
  // The same mistake in a sister project overstated a day of spend by 50%, and
  // the reason it went unnoticed for so long is that a wrong rate is invisible:
  // the ledger keeps adding up and every total it produces is wrong by the same
  // factor. A rate is the one number in a ledger that cannot be checked by
  // looking at the ledger.
  "claude-sonnet-5": { unit: "tokens", input: 2, output: 10 },
  "claude-sonnet-4-6": { unit: "tokens", input: 3, output: 15 },
  "claude-haiku-4-5": { unit: "tokens", input: 1, output: 5 },

  // OpenAI. Published list prices, **not yet reconciled against an invoice** —
  // recorded here so that when the first bill arrives there is something
  // specific to check them against. If they are wrong the error is silent, so
  // the reconciliation is worth doing rather than assuming.
  "gpt-5": { unit: "tokens", input: 1.25, output: 10 },
  "gpt-5-mini": { unit: "tokens", input: 0.25, output: 2 },

  // 이미지. 이 모델은 **이미지 토큰**으로 값을 매기므로 단위가 토큰인 것이 맞다 —
  // 장당 정액이 아니다. 저품질 1024×1024 한 장이 출력 196토큰으로 실측됐다.
  // 공표가이고 아직 청구서와 대조되지 않았다.
  "gpt-image-2": { unit: "tokens", input: 5, output: 40 },

  // DeepSeek. Published list prices, not yet reconciled against an invoice.
  // An order of magnitude under the others, which is the entire reason the
  // cheap tiers exist — and also the reason to keep it out of `judgment`,
  // because a saving that costs the company a deliverable is not a saving.
  "deepseek-chat": { unit: "tokens", input: 0.27, output: 1.1 },
  // V4 (09-06). 피크 값으로 적는다(비피크는 절반) — 장부는 비싸게 틀리는 쪽이 낫다.
  // 캐시: 딥시크는 같은 앞부분(시스템 프롬프트)을 자동으로 캐시해 30배 싸게 판다(피크 flash $0.014, pro $0.044).
  // Dev 의 규칙 프롬프트가 그 앞부분이다 — usage.prompt_cache_hit_tokens 로 온다(22:40).
  "deepseek-v4-flash": { unit: "tokens", input: 0.44, output: 1.32, cachedInput: 0.014 },
  "deepseek-v4-pro": { unit: "tokens", input: 1.32, output: 3.96, cachedInput: 0.044 },
};

/**
 * Backends that genuinely cost nothing, named one by one.
 *
 * Deliberately a list rather than a fallback. "Free" has to be something
 * somebody decided about a specific backend, never what happens when a name is
 * unrecognised — that is the whole difference between a test run showing $0
 * and a paid service showing $0.
 */
const FREE_BACKENDS = new Set<string>([
  "mock-deterministic",
  "mock-deterministic:judgment",
  "mock-deterministic:routine",
]);

export class UnpricedBackendError extends Error {
  constructor(readonly backend: string) {
    super(
      `"${backend}" has no price in src/lib/costs/pricing.ts. Add its rate before using it: an unpriced backend spends money the company's limit cannot see.`,
    );
    this.name = "UnpricedBackendError";
  }
}

/** Whether this backend may be used at all. Checked when a provider is built,
 *  so an unpriced one fails on the first call rather than after the bill. */
export function isPriced(backend: string): boolean {
  return FREE_BACKENDS.has(backend) || backend in RATES;
}

export function rateFor(backend: string): Rate | null {
  if (FREE_BACKENDS.has(backend)) return null;

  const rate = RATES[backend];
  // An unpriced backend used to be charged as free, on the reasoning that a
  // wrong number presented as a bill is worse than an obvious zero. That held
  // while every backend was a language model whose name we chose. It stops
  // holding the moment an outside service is connected, because then the
  // obvious zero *is* the wrong number — and it is the one the spend limit
  // reads. So it refuses instead.
  if (!rate) throw new UnpricedBackendError(backend);
  return rate;
}

export interface Usage {
  backend: string;
  /** Language models. */
  inputTokens?: number;
  outputTokens?: number;
  /** inputTokens 중 캐시에 맞은 수. 값이 다르다. */
  cachedInputTokens?: number;
  /** Everything else: how many pictures, how many seconds. */
  quantity?: number;
}

export function costOf(usage: Usage): number {
  const rate = rateFor(usage.backend);
  if (!rate) return 0;

  if (rate.unit === "tokens") {
    const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens ?? 0);
    const input = (usage.inputTokens ?? 0) - cached;
    const output = usage.outputTokens ?? 0;
    return (input * rate.input + cached * (rate.cachedInput ?? rate.input) + output * rate.output) / 1_000_000;
  }

  return (usage.quantity ?? 0) * rate.per;
}

/** What unit a backend bills in, for the ledger row. */
export function unitFor(backend: string): BillingUnit {
  if (FREE_BACKENDS.has(backend)) return "tokens";
  return RATES[backend]?.unit ?? "tokens";
}

/**
 * Money as the manager reads it.
 *
 * Four decimal places because a single run often costs less than a cent, and
 * rounding that to "$0.00" would tell them nothing.
 */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

/** Purposes, as the manager reads them. Anything unrecognised falls back to the
 *  raw id rather than being hidden — an unlabelled cost still has to be
 *  visible. */
export const purposeLabel: Record<string, string> = {
  research_plan: "Planning the research",
  deliverable: "Writing the deliverable",
  lead_research_plan: "Planning the search",
  lead_candidates: "Checking companies",
  lead_list: "Writing the list",
  collaboration_decision: "Deciding whether to ask a colleague",
  project_plan: "Dividing up the project",
  merged_project: "Bringing the project together",
  initiative_proposals: "Looking for opportunities",
  observation_queries: "Deciding what to look at",
  memory_candidates: "Learning from your review",
  feedback_analysis: "Reading your feedback",
  revised_deliverable: "Rewriting the deliverable",
  revision_validation: "Checking the rewrite",
};
