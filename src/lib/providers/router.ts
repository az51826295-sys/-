import type { AIProvider, WorkTier } from "./types";

/**
 * One provider on the outside, several vendors on the inside.
 *
 * Every call site already names the *work* rather than the model, which is what
 * makes this possible: a skill says "this is conversation" and never learns
 * that conversation went to a different company than the report did. The person
 * talking to an employee sees one voice; underneath, a short reply cost a tenth
 * of a cent and the report that followed cost a hundred times that.
 *
 * The split is by consequence, not by length:
 *
 *   judgment      the answer *is* the product — reports, plans, decisions the
 *                 manager will act on. Never routed to a cheaper vendor, no
 *                 matter how short the request looked.
 *   verification  checking a claim against evidence that already exists. Bounded
 *                 — wrong answers show up the moment someone opens the link.
 *   conversation  talking. Nothing is written down as a result.
 *   routine       restating what is already in the input.
 *
 * Missing vendors are not an error. A company with one key configured gets that
 * vendor for everything, which is the behaviour it had before this file existed.
 */

export interface VendorSet {
  /** Where judgment work goes. Required — this is the tier that must not degrade. */
  primary: AIProvider;
  /** Cheaper vendor for the tiers that can take it. Optional. */
  economy?: AIProvider;
}

/** Which tiers may leave the primary vendor. */
const ECONOMY_TIERS: ReadonlySet<WorkTier> = new Set<WorkTier>([
  "conversation",
  "routine",
  "verification",
]);

export function createRoutedProvider(vendors: VendorSet): AIProvider {
  const { primary, economy } = vendors;

  return {
    // Named for what it is so a ledger row is never mistaken for a single
    // vendor's bill. The per-call `model` is what the cost table reads.
    name: economy ? `routed(${primary.name}+${economy.name})` : primary.name,
    model: primary.model,

    async generateStructuredOutput(params) {
      const tier: WorkTier = params.tier ?? "judgment";

      // 그림이 딸린 호출은 싼 자리로 보내지 않는다.
      //
      // 값싼 벤더 중에는 그림을 아예 못 보는 것이 있고, 그러면 조용히 글만 읽고
      // 답한다. 사용자는 자기 사진을 보고 한 말인 줄 알고, 그 오해는 답 안에
      // 아무 표시도 남기지 않는다 — 조용한 고장 중에 가장 나쁜 종류다.
      const hasImages = (params.images?.length ?? 0) > 0;
      const pick =
        economy && !hasImages && ECONOMY_TIERS.has(tier) ? economy : primary;

      try {
        return await pick.generateStructuredOutput(params);
      } catch (error) {
        // A cheap vendor being down must not stop the company. Falling back
        // upward is always safe: it costs more and answers better. Falling back
        // *downward* would be the dangerous direction, so it is not offered.
        if (pick !== primary) {
          console.warn(
            `${pick.name} failed on tier "${tier}" — retrying on ${primary.name}.`,
            error instanceof Error ? error.message : error,
          );
          return await primary.generateStructuredOutput(params);
        }
        throw error;
      }
    },
  };
}
