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
      const pick = economy && ECONOMY_TIERS.has(tier) ? economy : primary;

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
