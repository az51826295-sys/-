import type { EmployeeWorkContextV5 } from "@/lib/execution/context";

/**
 * What each kind of employee looks for when nobody has asked them anything.
 *
 * Selected by skill id, exactly like the work skills — the detection pipeline
 * never asks who the employee is, only what they watch for. Adding an employee
 * means adding an entry here, not a branch in the engine.
 */
export interface OpportunityDetector {
  skillId: string;
  /** Appended to the prompts, in the employee's own voice. */
  focus: string;
  /** Fallback searches when the model's own queries can't be used. */
  fallbackQueries(context: EmployeeWorkContextV5): string[];
}

const marketResearchDetector: OpportunityDetector = {
  skillId: "market_research",
  focus: `You watch the market this company competes in. What matters is change:
a competitor shipping something, moving their prices, repositioning, raising
money, being acquired, or a shift in what buyers expect. A competitor existing
is not news; a competitor doing something new is.`,

  fallbackQueries(context) {
    const competitors = context.companyKnowledge.competitors ?? [];
    if (competitors.length > 0) {
      return competitors.flatMap((name) => [
        `${name} announcement launch`,
        `${name} pricing change`,
      ]);
    }
    return [
      `${context.company.name} industry product launch`,
      `${context.company.name} market pricing changes`,
    ];
  },
};

const leadResearchDetector: OpportunityDetector = {
  skillId: "lead_research",
  focus: `You watch for companies worth approaching. What matters is a company
that newly fits the manager's ideal customer profile, or an existing fit that
just showed a reason to talk now — funding, expansion, a support team growing.
A list of companies that have always been a fit is not an opportunity.`,

  fallbackQueries(context) {
    const knowledge = context.roleKnowledge as
      | { idealCustomerProfile?: { industries?: string[] } }
      | null;
    const industries = knowledge?.idealCustomerProfile?.industries ?? [];

    if (industries.length > 0) {
      return industries.flatMap((industry) => [
        `${industry} companies raised Series A`,
        `${industry} company expanding customer operations`,
      ]);
    }
    return ["B2B SaaS companies raised funding", "SaaS company expanding support team"];
  },
};

const registry: Record<string, OpportunityDetector> = {
  market_research: marketResearchDetector,
  lead_research: leadResearchDetector,
};

export function getOpportunityDetector(
  skillId: string,
): OpportunityDetector | undefined {
  return registry[skillId];
}
