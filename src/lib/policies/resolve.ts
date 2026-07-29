import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPolicies } from "@/lib/policies/service";
import { priorityRank, type PolicySnapshot } from "@/lib/policies/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * Which standards apply to work being done by one employee.
 *
 * A policy with no departments named is the company's, and reaches everyone. A
 * policy scoped to departments reaches only the people in them — a sales
 * standard about how to approach a prospect has no business shaping how the
 * market is researched.
 *
 * Disabled rules and archived policies are dropped here rather than downstream,
 * so nothing further along has to remember to check.
 */
export async function resolvePolicies(
  db: Db,
  companyId: string,
  companyEmployeeId: string | null,
): Promise<PolicySnapshot> {
  const policies = await loadPolicies(db, companyId);

  let departmentId: string | null = null;

  if (companyEmployeeId) {
    const { data: membership } = await db
      .from("department_members")
      .select("department_id")
      .eq("company_employee_id", companyEmployeeId)
      .maybeSingle();

    departmentId = (membership?.department_id as string | undefined) ?? null;
  }

  const applicable = policies
    .filter((policy) => policy.status === "active")
    .filter(
      (policy) =>
        policy.departmentIds.length === 0 ||
        (departmentId !== null && policy.departmentIds.includes(departmentId)),
    )
    .map((policy) => ({
      id: policy.id,
      name: policy.name,
      category: policy.category,
      version: policy.version,
      rules: policy.rules.filter((rule) => rule.enabled),
    }))
    .filter((policy) => policy.rules.length > 0);

  return { capturedAt: new Date().toISOString(), policies: applicable };
}

/**
 * Fixes the standard this assignment is held to, once.
 *
 * Deliberately written only if nothing is there yet. A retry, a revision, or a
 * second execution of the same assignment must be judged by the rules the work
 * was given, not by whatever the policy says by the time it finishes.
 */
export async function ensureAssignmentPolicySnapshot(
  db: Db,
  companyId: string,
  assignmentId: string,
  companyEmployeeId: string | null,
): Promise<PolicySnapshot> {
  const { data: existing } = await db
    .from("assignment_policy_snapshots")
    .select("policy_snapshot_json")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (existing?.policy_snapshot_json) {
    return existing.policy_snapshot_json as PolicySnapshot;
  }

  const snapshot = await resolvePolicies(db, companyId, companyEmployeeId);

  await db.from("assignment_policy_snapshots").insert({
    company_id: companyId,
    assignment_id: assignmentId,
    policy_snapshot_json: snapshot,
  });

  return snapshot;
}

export async function loadAssignmentPolicySnapshot(
  db: Db,
  assignmentId: string,
): Promise<PolicySnapshot | null> {
  const { data } = await db
    .from("assignment_policy_snapshots")
    .select("policy_snapshot_json")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  return (data?.policy_snapshot_json as PolicySnapshot | undefined) ?? null;
}

export function isEmptySnapshot(snapshot: PolicySnapshot | null): boolean {
  return !snapshot || snapshot.policies.length === 0;
}

/** Rules across every policy in a snapshot, required first. */
export function flattenRules(snapshot: PolicySnapshot) {
  return snapshot.policies
    .flatMap((policy) =>
      policy.rules.map((rule) => ({ policy, rule })),
    )
    .sort(
      (a, b) => priorityRank[a.rule.priority] - priorityRank[b.rule.priority],
    );
}
