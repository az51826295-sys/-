import { normalizeCompanyName } from "@/lib/leads/identity";
import type {
  ExtractedCandidate,
  FitLabel,
  LeadQualification,
} from "@/lib/leads/types";
import type { LeadResearchAssignmentInput } from "@/lib/roles/schemas";

/**
 * Whether a company matches the assignment, decided by rules rather than by the
 * model. Two reasons: the criteria are the manager's own words and should be
 * applied literally, and a revision that says "exclude companies over 100
 * employees" has to be checkable afterwards. A model asked to score itself
 * cannot be held to that.
 *
 * The score measures agreement with the assignment's criteria. It is not a
 * probability that the company will buy anything, which is why the manager
 * never sees the number.
 */
const WEIGHTS = {
  industry: 30,
  size: 20,
  location: 15,
  signal: 20,
  buyerRole: 10,
  publicContact: 5,
  excluded: -100,
} as const;

function includesAny(haystack: string, needles: string[]): boolean {
  if (needles.length === 0) return false;
  const text = haystack.toLowerCase();
  return needles.some((needle) => {
    const term = needle.toLowerCase().trim();
    return term.length > 0 && text.includes(term);
  });
}

/**
 * Forms of an exclusion term worth checking. A manager who writes "Agencies"
 * means to exclude a company called "Brightline Consulting Agency" — matching
 * the plural literally would let exactly the company they named through.
 */
function exclusionForms(rule: string): string[] {
  const term = rule.toLowerCase().trim();
  if (!term) return [];

  const forms = new Set([term]);
  if (term.endsWith("ies")) forms.add(`${term.slice(0, -3)}y`);
  else if (term.endsWith("es")) forms.add(term.slice(0, -2));
  if (term.endsWith("s")) forms.add(term.slice(0, -1));
  else forms.add(`${term}s`);

  // Too short to be meaningful once shortened — "as" would match everything.
  return [...forms].filter((form) => form.length >= 4);
}

/** Whether a company's published size range overlaps the requested one. Ranges
 *  are compared as ranges: a "51-200" company satisfies "under 100". */
function sizeOverlaps(
  candidate: { min?: number; max?: number },
  wanted: { min?: number; max?: number },
): boolean | null {
  const cMin = candidate.min;
  const cMax = candidate.max;
  if (cMin === undefined && cMax === undefined) return null;

  const low = cMin ?? cMax ?? 0;
  const high = cMax ?? cMin ?? Number.MAX_SAFE_INTEGER;

  if (wanted.min !== undefined && high < wanted.min) return false;
  if (wanted.max !== undefined && low > wanted.max) return false;
  return true;
}

export function qualifyCandidate(
  candidate: ExtractedCandidate,
  input: LeadResearchAssignmentInput,
  excludedFromProfile: string[],
): LeadQualification {
  const matched: string[] = [];
  const missing: string[] = [];
  const exclusions: string[] = [];
  let score = 0;

  const haystack = [
    candidate.companyName,
    candidate.industry,
    candidate.companyDescription,
  ].join(" ");

  // Exclusions first. Anything the manager said to avoid ends the assessment —
  // no amount of other fit makes a company they asked not to see acceptable.
  const allExclusions = [...excludedFromProfile, ...input.excludedCompanies];
  if (candidate.excluded && candidate.exclusionReason.trim()) {
    exclusions.push(candidate.exclusionReason.trim());
  }
  // Matched against the company's name only, never its description.
  //
  // A description says who a company sells to, who it integrates with and who
  // it competes against, so "avoid agencies" run over the description throws
  // out a transit-software company whose customers are transit agencies. The
  // name is the one place the word means the company itself. Anything subtler
  // than that is the model's judgement above, which carries its own reason.
  const nameToMatch = `${candidate.companyName.toLowerCase()} ${normalizeCompanyName(candidate.companyName)}`;
  for (const rule of allExclusions) {
    if (exclusionForms(rule).some((form) => nameToMatch.includes(form))) {
      exclusions.push(`Matches an excluded company type: ${rule}`);
    }
  }

  if (exclusions.length > 0) {
    return {
      status: "not_qualified",
      score: WEIGHTS.excluded,
      matchedCriteria: matched,
      missingCriteria: missing,
      exclusionReasons: [...new Set(exclusions)],
    };
  }

  if (input.industries.length > 0) {
    if (includesAny(haystack, input.industries)) {
      score += WEIGHTS.industry;
      matched.push("Industry fit");
    } else {
      missing.push("Industry fit");
    }
  } else {
    // With no industry filter, industry can't be a reason to demote a company.
    score += WEIGHTS.industry;
  }

  if (input.employeeRange && (input.employeeRange.min !== undefined || input.employeeRange.max !== undefined)) {
    const overlap = sizeOverlaps(candidate.employeeRange, input.employeeRange);
    if (overlap === true) {
      score += WEIGHTS.size;
      matched.push("Company size");
    } else if (overlap === false) {
      missing.push("Company size");
    } else {
      missing.push("Company size could not be verified");
    }
  } else {
    score += WEIGHTS.size;
  }

  if (input.locations.length > 0) {
    if (includesAny(candidate.location, input.locations)) {
      score += WEIGHTS.location;
      matched.push("Location");
    } else {
      missing.push("Location");
    }
  } else {
    score += WEIGHTS.location;
  }

  const sourcedSignals = candidate.buyingSignals.filter(
    (signal) => signal.sourceIds.length > 0,
  );

  if (input.requiredSignals.length > 0) {
    const signalText = sourcedSignals.map((s) => s.description).join(" ");
    if (includesAny(signalText, input.requiredSignals)) {
      score += WEIGHTS.signal;
      matched.push("Growth signals");
    } else {
      missing.push("Growth signals");
    }
  } else if (sourcedSignals.length > 0) {
    score += WEIGHTS.signal;
    matched.push("Growth signals");
  } else {
    missing.push("Growth signals");
  }

  if (candidate.recommendedBuyerRoles.length > 0) {
    score += WEIGHTS.buyerRole;
    matched.push("Buyer role identified");
  } else {
    missing.push("Buyer role identified");
  }

  if (candidate.publicContactEmail.trim() || candidate.verifiedContacts.length > 0) {
    score += WEIGHTS.publicContact;
  }

  const bounded = Math.max(0, Math.min(100, score));

  // A company with no identity evidence isn't a weak lead, it's an unverified
  // one, and the two must not be sorted together.
  if (candidate.identitySourceIds.length === 0 || candidate.fitReasons.length === 0) {
    return {
      status: "insufficient_information",
      score: bounded,
      matchedCriteria: matched,
      missingCriteria: missing,
      exclusionReasons: [],
    };
  }

  const required = input.requiredSignals.length > 0 && missing.includes("Growth signals");

  return {
    status: bounded >= 60 && !required ? "qualified" : bounded >= 40 ? "possible_fit" : "not_qualified",
    score: bounded,
    matchedCriteria: matched,
    missingCriteria: missing,
    exclusionReasons: [],
  };
}

/** The manager sees a band, not a number: the score's precision is not real,
 *  and showing "73" invites it to be read as a probability. */
export function fitLabelFor(score: number): FitLabel {
  if (score >= 80) return "strong_fit";
  if (score >= 60) return "good_fit";
  return "possible_fit";
}

/**
 * Re-checks a finished lead list against a structured constraint. Used after a
 * revision so "exclude companies over 100 employees" is verified against the
 * data rather than taken on the model's word.
 */
export function findLeadsOverEmployeeLimit(
  leads: { companyName: string; employeeRange?: { min?: number; max?: number } }[],
  maxEmployees: number,
): string[] {
  return leads
    .filter((lead) => {
      const low = lead.employeeRange?.min;
      return low !== undefined && low > maxEmployees;
    })
    .map((lead) => lead.companyName);
}
