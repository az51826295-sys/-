import type { DeliverableFacts } from "@/lib/policies/facts";

/**
 * The rules the company can hold work to without spending anything.
 *
 * Every check here is arithmetic over work that already exists. Nothing in this
 * file calls a model: a standard that cost money to enforce would quietly
 * become a standard nobody could afford to apply to every deliverable, and a
 * standard applied sometimes is not a standard.
 *
 * A rule that names no check is not a lesser rule. It goes to the employee as
 * an instruction and comes back to the manager as something to judge — most of
 * what makes a company distinctive is that kind.
 */
export interface CheckResult {
  passed: boolean;
  /** What the manager reads next to the rule. Empty when it passed. */
  detail: string;
}

export interface PolicyCheck {
  id: string;
  label: string;
  /** Shown where a rule is being written, so the author knows what it will do. */
  description: string;
  /** Numeric knob this check takes, when it takes one. */
  config?: { key: string; label: string; default: number; min: number; max: number };
  /**
   * Kinds of work this check can meaningfully judge. Omitted means all of them.
   *
   * Added when the first *created* deliverable arrived. An art bible was
   * blocked from approval by "Opens with what it found" and "Ends with what to
   * do" — rules that are right about research and meaningless about a
   * specification, which opens with a palette and ends with what was left
   * undecided.
   *
   * Declared on the check rather than on the company's rule on purpose. The
   * manager can already switch a rule off, but switching this one off to let a
   * bible through would also stop it applying to every report — trading a real
   * standard for an unrelated one. A check that cannot judge a kind of work
   * should stay silent about it rather than make the manager choose.
   */
  appliesToDeliverableTypes?: string[];
  run(facts: DeliverableFacts, config: Record<string, unknown>): CheckResult;
}

/** Deliverables that report on the world, and are judged on whether they
 *  support what they claim. Everything else invents its subject. */
const RESEARCH_SHAPED = ["market_research_report", "lead_list"];

/** Whether this check has anything to say about this kind of work. */
export function checkApplies(
  check: PolicyCheck,
  deliverableType: string,
): boolean {
  return (
    !check.appliesToDeliverableTypes ||
    check.appliesToDeliverableTypes.includes(deliverableType)
  );
}

const PASS: CheckResult = { passed: true, detail: "" };

function readNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const raw = config[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const CHECKS: PolicyCheck[] = [
  {
    id: "minimum_sources",
    // A specification has no sources: it invents its subject rather than
    // reporting on one. Silent here rather than failing work that was never
    // going to have them.
    appliesToDeliverableTypes: RESEARCH_SHAPED,
    label: "Minimum sources",
    description: "Work must stand on at least this many separate sources.",
    config: { key: "count", label: "Sources", default: 3, min: 1, max: 20 },
    run(facts, config) {
      const required = readNumber(config, "count", 3);
      if (facts.citedSourceCount >= required) return PASS;
      return {
        passed: false,
        detail: `Stands on ${facts.citedSourceCount} source${
          facts.citedSourceCount === 1 ? "" : "s"
        }, and ${required} are required.`,
      };
    },
  },
  {
    id: "everything_cited",
    // A specification has no sources: it invents its subject rather than
    // reporting on one. Silent here rather than failing work that was never
    // going to have them.
    appliesToDeliverableTypes: RESEARCH_SHAPED,
    label: "Nothing unsupported",
    description: "Every substantive claim carries evidence.",
    run(facts) {
      if (facts.uncitedParts.length === 0) return PASS;
      const shown = facts.uncitedParts.slice(0, 3).join(", ");
      const rest = facts.uncitedParts.length - 3;
      return {
        passed: false,
        detail: `Nothing backs: ${shown}${rest > 0 ? ` and ${rest} more` : ""}.`,
      };
    },
  },
  {
    id: "requires_summary",
    label: "Opens with a summary",
    description: "Work must start by saying what it found.",
    run(facts) {
      if (facts.summary.length >= 40) return PASS;
      return {
        passed: false,
        detail: facts.summary
          ? "The opening summary is too thin to tell you what was found."
          : "No opening summary.",
      };
    },
  },
  {
    id: "requires_action_items",
    // A specification does not recommend, it decides. What to do with an art
    // bible is to build the assets it names — asking it for next steps on top
    // would be asking it to repeat its own contents as advice.
    appliesToDeliverableTypes: RESEARCH_SHAPED,
    label: "Says what to do next",
    description: "Work must end with what it recommends doing.",
    config: { key: "count", label: "Next steps", default: 1, min: 1, max: 10 },
    run(facts, config) {
      const required = readNumber(config, "count", 1);
      if (facts.actionItems.length >= required) return PASS;
      return {
        passed: false,
        detail:
          facts.actionItems.length === 0
            ? "Doesn't say what to do with this."
            : `Only ${facts.actionItems.length} next step${
                facts.actionItems.length === 1 ? "" : "s"
              }, and ${required} are required.`,
      };
    },
  },
  {
    id: "states_limitations",
    label: "Admits what it couldn't establish",
    description: "Work must say where the evidence ran out.",
    run(facts) {
      if (facts.limitations.length > 0) return PASS;
      return {
        passed: false,
        detail: "Claims no limits at all, which is rarely true.",
      };
    },
  },
  {
    id: "no_credentials",
    label: "No keys or credentials",
    description: "Work must never carry an API key, token or password.",
    run(facts) {
      const found = findSecrets(facts.contentMarkdown);
      if (found.length === 0) return PASS;
      return {
        passed: false,
        // Never echoed back: the point is to stop it spreading, and the detail
        // is read on a screen the manager may be sharing.
        detail: `Contains something shaped like a credential (${found.join(", ")}).`,
      };
    },
  },
  {
    id: "no_personal_contact_details",
    label: "No personal contact details",
    description:
      "Work must not carry named people's email addresses or phone numbers. Scope this to the departments that write outward-facing material — a prospect list holds contact details by design.",
    run(facts) {
      const kinds: string[] = [];
      if (EMAIL.test(facts.contentMarkdown)) kinds.push("email addresses");
      if (PHONE.test(facts.contentMarkdown)) kinds.push("phone numbers");
      if (kinds.length === 0) return PASS;
      return { passed: false, detail: `Contains ${kinds.join(" and ")}.` };
    },
  },
];

// Deliberately shape-based rather than provider-specific: a key is recognised
// by looking like a key, so a new vendor's format is caught without an edit.
const SECRET_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "API key", pattern: /\b(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}\b/ },
  { label: "token", pattern: /\b[A-Za-z0-9_-]*(?:token|secret|apikey)[A-Za-z0-9_-]*\s*[:=]\s*\S{12,}/i },
  { label: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/ },
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]\d{4}\b/;

function findSecrets(text: string): string[] {
  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => label,
  );
}

const BY_ID = new Map(CHECKS.map((check) => [check.id, check]));

export function getPolicyCheck(checkId: string): PolicyCheck | undefined {
  return BY_ID.get(checkId);
}

/** Offered where a rule is being written. Data, so adding a check is one edit. */
export function listPolicyChecks(): PolicyCheck[] {
  return CHECKS;
}
