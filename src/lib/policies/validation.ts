import type { SupabaseClient } from "@supabase/supabase-js";
import { checkApplies, getPolicyCheck } from "@/lib/policies/checks";
import { extractDeliverableFacts } from "@/lib/policies/facts";
import { flattenRules } from "@/lib/policies/resolve";
import {
  severityRank,
  type FindingSeverity,
  type PolicyFinding,
  type PolicyPriority,
  type PolicySnapshot,
} from "@/lib/policies/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * How a rule that wasn't met reaches the manager.
 *
 * A required rule that a check can settle is the only thing that stops an
 * approval: the company said this is not negotiable, and the machine is certain
 * it wasn't met. A required rule nobody can check for free is not softened into
 * silence — it comes back as something the manager has to look at themselves,
 * which is what "required" means when judgement is involved.
 */
function severityFor(priority: PolicyPriority, checked: boolean): FindingSeverity {
  if (!checked) return priority === "required" ? "manual" : "note";
  if (priority === "required") return "blocking";
  if (priority === "recommended") return "warning";
  return "note";
}

export interface ValidationOutcome {
  findings: PolicyFinding[];
  blockingCount: number;
}

/**
 * Judges a finished deliverable against the standard its assignment was given.
 *
 * Nothing here rewrites the work. A policy that silently edited a deliverable
 * would leave the manager reviewing something no employee wrote, and would hide
 * the one fact worth knowing — that the work as produced did not meet the
 * company's standard.
 */
export function evaluateDeliverable(
  snapshot: PolicySnapshot | null,
  deliverable: {
    deliverableType: string;
    title: string;
    contentMarkdown: string;
    contentJson: unknown;
  },
): ValidationOutcome {
  if (!snapshot || snapshot.policies.length === 0) {
    return { findings: [], blockingCount: 0 };
  }

  const facts = extractDeliverableFacts(
    deliverable.deliverableType,
    deliverable.title,
    deliverable.contentMarkdown,
    deliverable.contentJson,
  );

  const findings: PolicyFinding[] = [];

  for (const { policy, rule } of flattenRules(snapshot)) {
    const check = rule.checkId ? getPolicyCheck(rule.checkId) : undefined;

    if (!check) {
      // Only required judgement rules are surfaced. Listing every recommended
      // one would turn the review screen into a copy of the policy page, and a
      // list nobody reads protects nothing.
      if (rule.priority !== "required") continue;

      findings.push({
        policyId: policy.id,
        policyName: policy.name,
        ruleId: rule.id,
        ruleTitle: rule.title,
        priority: rule.priority,
        severity: "manual",
        detail: rule.instruction,
      });
      continue;
    }

    // Silent rather than passing or failing. A check with nothing to say about
    // this kind of work should leave no trace at all: recorded as a pass it
    // would tell the manager a standard was met that was never tested, and as
    // a failure it would block work for not being a different kind of work.
    if (!checkApplies(check, facts.deliverableType)) continue;

    const result = check.run(facts, rule.checkConfig ?? {});
    if (result.passed) continue;

    findings.push({
      policyId: policy.id,
      policyName: policy.name,
      ruleId: rule.id,
      ruleTitle: rule.title,
      priority: rule.priority,
      severity: severityFor(rule.priority, true),
      detail: result.detail,
    });
  }

  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    findings,
    blockingCount: findings.filter((finding) => finding.severity === "blocking")
      .length,
  };
}

/**
 * Runs the standard over a deliverable that has just been handed in.
 *
 * Called by the engine rather than by each skill, so a new kind of employee is
 * held to the company's standards on the day it is added without anybody
 * remembering to wire it up.
 */
export async function recordPolicyFindings(
  db: Db,
  companyId: string,
  assignmentId: string,
  deliverableId: string,
): Promise<ValidationOutcome> {
  const { data: deliverable } = await db
    .from("deliverables")
    .select("id, title, deliverable_type, content_markdown, content_json")
    .eq("id", deliverableId)
    .maybeSingle();

  if (!deliverable) return { findings: [], blockingCount: 0 };

  const { data: snapshotRow } = await db
    .from("assignment_policy_snapshots")
    .select("policy_snapshot_json")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  const snapshot =
    (snapshotRow?.policy_snapshot_json as PolicySnapshot | undefined) ?? null;

  const outcome = evaluateDeliverable(snapshot, {
    deliverableType: deliverable.deliverable_type as string,
    title: (deliverable.title as string) ?? "",
    contentMarkdown: (deliverable.content_markdown as string) ?? "",
    contentJson: deliverable.content_json,
  });

  // A revision produces a new deliverable row, so findings never need merging.
  // Clearing first keeps a re-run of the same deliverable from doubling them.
  await db
    .from("deliverable_policy_findings")
    .delete()
    .eq("deliverable_id", deliverableId);

  if (outcome.findings.length > 0) {
    await db.from("deliverable_policy_findings").insert(
      outcome.findings.map((finding) => ({
        company_id: companyId,
        deliverable_id: deliverableId,
        policy_id: finding.policyId,
        policy_name: finding.policyName,
        rule_id: finding.ruleId,
        rule_title: finding.ruleTitle,
        priority: finding.priority,
        severity: finding.severity,
        detail: finding.detail,
      })),
    );
  }

  return outcome;
}

export interface StoredFinding extends PolicyFinding {
  id: string;
}

/**
 * The findings that still stand between this work and an approval.
 *
 * Narrower than the findings themselves, and deliberately so. The snapshot
 * settles what the employee was asked for and what the work was measured
 * against — that must not move. Whether a rule still stops the manager is a
 * different question, and it is theirs to answer today: a manager who decides a
 * rule was wrong and turns it off has made a decision, and the work on their
 * desk should stop being blocked by it.
 *
 * Without this the error message would be a lie. It tells them they can turn
 * the rule off, and turning it off has to actually work.
 */
export async function loadBlockingFindings(
  db: Db,
  deliverableId: string,
): Promise<StoredFinding[]> {
  const findings = (await loadPolicyFindings(db, deliverableId)).filter(
    (finding) => finding.severity === "blocking",
  );

  if (findings.length === 0) return [];

  const ruleIds = findings
    .map((finding) => finding.ruleId)
    .filter((id): id is string => Boolean(id));

  if (ruleIds.length === 0) return [];

  // A rule that has since been deleted, disabled, or whose policy was retired
  // no longer speaks for the company, so it no longer holds anything up.
  const { data } = await db
    .from("policy_rules")
    .select("id, enabled, company_policies!inner(status)")
    .in("id", ruleIds)
    .eq("enabled", true)
    .eq("company_policies.status", "active");

  const live = new Set(((data ?? []) as { id: string }[]).map((row) => row.id));

  return findings.filter((finding) => finding.ruleId && live.has(finding.ruleId));
}

export async function loadPolicyFindings(
  db: Db,
  deliverableId: string,
): Promise<StoredFinding[]> {
  const { data } = await db
    .from("deliverable_policy_findings")
    .select("*")
    .eq("deliverable_id", deliverableId);

  return ((data ?? []) as {
    id: string;
    policy_id: string | null;
    policy_name: string;
    rule_id: string | null;
    rule_title: string;
    priority: string;
    severity: string;
    detail: string;
  }[])
    .map((row) => ({
      id: row.id,
      policyId: row.policy_id,
      policyName: row.policy_name,
      ruleId: row.rule_id,
      ruleTitle: row.rule_title,
      priority: row.priority as PolicyPriority,
      severity: row.severity as FindingSeverity,
      detail: row.detail,
    }))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
