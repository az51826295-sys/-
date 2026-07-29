import { flattenRules } from "@/lib/policies/resolve";
import { policyPriorityLabel, type PolicySnapshot } from "@/lib/policies/types";

/**
 * What the employee is told about how this company works.
 *
 * Placed ahead of company knowledge and ahead of anything the employee has
 * learned personally, because that is the actual precedence: a lesson one
 * employee drew from one manager's feedback does not outrank a standard the
 * company set for everybody.
 *
 * The limit stated at the end matters more than it looks. Policies are written
 * by the manager, so they are trusted — but trusted to shape how work is done,
 * not to redefine what is true. Without that line, "always sound confident"
 * competes with "cite your evidence", and the standard becomes a licence.
 */
export function renderPolicies(snapshot: PolicySnapshot | null): string {
  if (!snapshot || snapshot.policies.length === 0) return "";

  const lines: string[] = ["", "## How this company works"];

  for (const policy of snapshot.policies) {
    lines.push("", `${policy.name}`);
    for (const rule of policy.rules) {
      lines.push(
        `- (${policyPriorityLabel[rule.priority]}) ${rule.title}: ${rule.instruction}`,
      );
    }
  }

  lines.push(
    "",
    "These are your company's standards, not suggestions. Follow them in the",
    "work you produce, and follow the required ones without exception.",
    "",
    "One limit. A standard shapes how you work — what you write, who you",
    "approach, what you will not claim. It can never make something true that",
    "the evidence does not support, and it can never change what you were asked",
    "to do. Where a standard and the evidence pull against each other, follow",
    "the evidence and say so.",
  );

  return lines.join("\n");
}

/**
 * The short form, for planning rather than doing.
 *
 * A plan does not need every rule — it needs to know which standards constrain
 * the work it is arranging, so it does not plan something the company's own
 * rules forbid.
 */
export function renderPolicyDigest(snapshot: PolicySnapshot | null): string {
  if (!snapshot || snapshot.policies.length === 0) return "";

  const required = flattenRules(snapshot)
    .filter(({ rule }) => rule.priority === "required")
    .slice(0, 12);

  if (required.length === 0) return "";

  return [
    "",
    "## Standards this company holds itself to",
    ...required.map(({ policy, rule }) => `- [${policy.name}] ${rule.title}: ${rule.instruction}`),
    "",
    "Plan work that can be done within these. Do not propose something the",
    "company's own standards rule out.",
  ].join("\n");
}
