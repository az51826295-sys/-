import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanyContext } from "@/lib/recurring/companyAccess";
import type { Result } from "@/lib/assignments/service";
import { getPolicyTemplate } from "@/lib/policies/catalog";
import { getPolicyCheck } from "@/lib/policies/checks";
import {
  MAX_RULES_PER_POLICY,
  POLICY_CATEGORIES,
  POLICY_DESCRIPTION_MAX,
  POLICY_NAME_MAX,
  POLICY_PRIORITIES,
  RULE_INSTRUCTION_MAX,
  RULE_INSTRUCTION_MIN,
  RULE_TITLE_MAX,
  priorityRank,
  type Policy,
  type PolicyCategory,
  type PolicyPriority,
  type PolicyRule,
  type PolicyStatus,
} from "@/lib/policies/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

interface PolicyRow {
  id: string;
  company_id: string;
  name: string;
  category: string;
  description: string;
  status: string;
  version: number;
  updated_at: string;
}

interface RuleRow {
  id: string;
  policy_id: string;
  title: string;
  instruction: string;
  priority: string;
  enabled: boolean;
  check_id: string | null;
  check_config: Record<string, unknown> | null;
  position: number;
}

function toRule(row: RuleRow): PolicyRule {
  return {
    id: row.id,
    title: row.title,
    instruction: row.instruction,
    priority: row.priority as PolicyPriority,
    enabled: row.enabled,
    checkId: row.check_id,
    checkConfig: row.check_config ?? {},
    position: row.position,
  };
}

/** Required first, then the order the manager put them in. */
function sortRules(rules: PolicyRule[]): PolicyRule[] {
  return [...rules].sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      a.position - b.position,
  );
}

// --- Reading -------------------------------------------------------------

export async function loadPolicies(db: Db, companyId: string): Promise<Policy[]> {
  const { data: policyRows } = await db
    .from("company_policies")
    .select("*")
    .eq("company_id", companyId)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  const policies = (policyRows ?? []) as PolicyRow[];
  if (policies.length === 0) return [];

  const ids = policies.map((policy) => policy.id);

  const { data: ruleRows } = await db
    .from("policy_rules")
    .select("*")
    .in("policy_id", ids);

  const { data: scopeRows } = await db
    .from("policy_departments")
    .select("policy_id, department_id")
    .in("policy_id", ids);

  const rulesByPolicy = new Map<string, PolicyRule[]>();
  for (const row of (ruleRows ?? []) as RuleRow[]) {
    const list = rulesByPolicy.get(row.policy_id) ?? [];
    list.push(toRule(row));
    rulesByPolicy.set(row.policy_id, list);
  }

  const scopeByPolicy = new Map<string, string[]>();
  for (const row of (scopeRows ?? []) as {
    policy_id: string;
    department_id: string;
  }[]) {
    const list = scopeByPolicy.get(row.policy_id) ?? [];
    list.push(row.department_id);
    scopeByPolicy.set(row.policy_id, list);
  }

  return policies.map((policy) => ({
    id: policy.id,
    name: policy.name,
    category: policy.category as PolicyCategory,
    description: policy.description,
    status: policy.status as PolicyStatus,
    version: policy.version,
    updatedAt: policy.updated_at,
    rules: sortRules(rulesByPolicy.get(policy.id) ?? []),
    departmentIds: scopeByPolicy.get(policy.id) ?? [],
  }));
}

export async function loadPolicyDetail(policyId: string): Promise<{
  policy: Policy;
  history: {
    version: number;
    changeSummary: string;
    createdAt: string;
    ruleCount: number;
  }[];
  departments: { id: string; name: string }[];
} | null> {
  const context = await getCompanyContext();
  if (!context) return null;

  const { supabase, companyId } = context;

  const policies = await loadPolicies(supabase, companyId);
  const policy = policies.find((row) => row.id === policyId);
  if (!policy) return null;

  const { data: versionRows } = await supabase
    .from("policy_versions")
    .select("version, change_summary, created_at, rules_json")
    .eq("policy_id", policyId)
    .order("version", { ascending: false });

  const { data: departmentRows } = await supabase
    .from("departments")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  return {
    policy,
    history: ((versionRows ?? []) as {
      version: number;
      change_summary: string;
      created_at: string;
      rules_json: unknown[];
    }[]).map((row) => ({
      version: row.version,
      changeSummary: row.change_summary,
      createdAt: row.created_at,
      ruleCount: Array.isArray(row.rules_json) ? row.rules_json.length : 0,
    })),
    departments: (departmentRows ?? []) as { id: string; name: string }[],
  };
}

/** The numbers on the dashboard card. */
export async function loadPolicySummary(
  db: Db,
  companyId: string,
): Promise<{ policyCount: number; ruleCount: number; latestUpdate: string | null }> {
  const { data: policyRows } = await db
    .from("company_policies")
    .select("id, updated_at")
    .eq("company_id", companyId)
    .eq("status", "active");

  const policies = (policyRows ?? []) as { id: string; updated_at: string }[];
  if (policies.length === 0) {
    return { policyCount: 0, ruleCount: 0, latestUpdate: null };
  }

  const { count } = await db
    .from("policy_rules")
    .select("id", { count: "exact", head: true })
    .in(
      "policy_id",
      policies.map((policy) => policy.id),
    )
    .eq("enabled", true);

  const latest = policies
    .map((policy) => policy.updated_at)
    .sort()
    .at(-1);

  return {
    policyCount: policies.length,
    ruleCount: count ?? 0,
    latestUpdate: latest ?? null,
  };
}

// --- Versioning ----------------------------------------------------------

/**
 * Records what the policy says right now, as a numbered version.
 *
 * Written after every change rather than on request. A manager asking months
 * later what standard a deliverable was held to needs the answer to exist
 * already — reconstructing it from an audit trail of edits is not the same
 * thing as having kept the text.
 */
async function recordVersion(
  db: Db,
  policyId: string,
  changeSummary: string,
): Promise<void> {
  const { data: policy } = await db
    .from("company_policies")
    .select("*")
    .eq("id", policyId)
    .maybeSingle();

  if (!policy) return;

  const { data: ruleRows } = await db
    .from("policy_rules")
    .select("*")
    .eq("policy_id", policyId)
    .order("position", { ascending: true });

  await db.from("policy_versions").insert({
    company_id: policy.company_id,
    policy_id: policyId,
    version: policy.version,
    name: policy.name,
    description: policy.description,
    status: policy.status,
    rules_json: ((ruleRows ?? []) as RuleRow[]).map(toRule),
    change_summary: changeSummary,
  });
}

/** Any change to a policy or its rules moves the whole policy forward: the
 *  version is the standard, not the individual rule. */
async function bumpVersion(
  db: Db,
  policyId: string,
  changeSummary: string,
): Promise<void> {
  const { data: current } = await db
    .from("company_policies")
    .select("version")
    .eq("id", policyId)
    .maybeSingle();

  if (!current) return;

  await db
    .from("company_policies")
    .update({
      version: (current.version as number) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", policyId);

  await recordVersion(db, policyId, changeSummary);
}

// --- Writing -------------------------------------------------------------

export interface CreatePolicyInput {
  /** Adopts a standard from the catalog, rules and all. */
  templateKey?: string;
  name?: string;
  category?: string;
  description?: string;
  departmentIds?: string[];
}

export async function createPolicy(
  input: CreatePolicyInput,
): Promise<Result<{ policyId: string }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Create a company first.", status: 400 };

  const { supabase, companyId } = context;

  const template = input.templateKey
    ? getPolicyTemplate(input.templateKey)
    : undefined;

  if (input.templateKey && !template) {
    return { error: "That standard isn't one I know.", status: 404 };
  }

  const name = (input.name ?? template?.name ?? "").trim();
  const category = (input.category ?? template?.category ?? "custom") as PolicyCategory;
  const description = (input.description ?? template?.description ?? "").trim();

  if (name.length === 0 || name.length > POLICY_NAME_MAX) {
    return { error: `Give this policy a name of up to ${POLICY_NAME_MAX} characters.`, status: 400 };
  }
  if (!POLICY_CATEGORIES.includes(category)) {
    return { error: "That isn't a category I know.", status: 400 };
  }
  if (description.length > POLICY_DESCRIPTION_MAX) {
    return { error: `Keep the description under ${POLICY_DESCRIPTION_MAX} characters.`, status: 400 };
  }

  const { data: created, error } = await supabase
    .from("company_policies")
    .insert({ company_id: companyId, name, category, description })
    .select("id")
    .single();

  if (error || !created) {
    // The one failure worth naming: a second policy with the same name would
    // make "which one applies" unanswerable on the review screen.
    if (error?.code === "23505") {
      return { error: "You already have a policy with that name.", status: 409 };
    }
    return { error: "I couldn't create this policy.", status: 500 };
  }

  const policyId = created.id as string;

  if (template && template.rules.length > 0) {
    await supabase.from("policy_rules").insert(
      template.rules.map((rule, index) => ({
        company_id: companyId,
        policy_id: policyId,
        title: rule.title,
        instruction: rule.instruction,
        priority: rule.priority,
        check_id: rule.checkId ?? null,
        check_config: rule.checkConfig ?? {},
        position: index,
      })),
    );
  }

  if (input.departmentIds && input.departmentIds.length > 0) {
    await setPolicyDepartments(supabase, companyId, policyId, input.departmentIds);
  }

  await recordVersion(supabase, policyId, "Created.");

  return { policyId };
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string;
  status?: string;
  departmentIds?: string[];
}

export async function updatePolicy(
  policyId: string,
  input: UpdatePolicyInput,
): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Policy not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: existing } = await supabase
    .from("company_policies")
    .select("id")
    .eq("id", policyId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!existing) return { error: "Policy not found.", status: 404 };

  const patch: Record<string, unknown> = {};
  const changes: string[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0 || name.length > POLICY_NAME_MAX) {
      return { error: `Give this policy a name of up to ${POLICY_NAME_MAX} characters.`, status: 400 };
    }
    patch.name = name;
    changes.push("Renamed.");
  }

  if (input.description !== undefined) {
    if (input.description.length > POLICY_DESCRIPTION_MAX) {
      return { error: `Keep the description under ${POLICY_DESCRIPTION_MAX} characters.`, status: 400 };
    }
    patch.description = input.description.trim();
    changes.push("Description updated.");
  }

  if (input.status !== undefined) {
    if (!["active", "draft", "archived"].includes(input.status)) {
      return { error: "That isn't a status I know.", status: 400 };
    }
    patch.status = input.status;
    changes.push(
      input.status === "active"
        ? "Put into effect."
        : input.status === "archived"
          ? "Retired."
          : "Moved back to draft.",
    );
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("company_policies")
      .update(patch)
      .eq("id", policyId);

    if (error) {
      if (error.code === "23505") {
        return { error: "You already have a policy with that name.", status: 409 };
      }
      return { error: "I couldn't save this change.", status: 500 };
    }
  }

  if (input.departmentIds !== undefined) {
    await setPolicyDepartments(supabase, companyId, policyId, input.departmentIds);
    changes.push(
      input.departmentIds.length === 0
        ? "Applied to the whole company."
        : "Departments changed.",
    );
  }

  if (changes.length === 0) return { ok: true };

  await bumpVersion(supabase, policyId, changes.join(" "));

  return { ok: true };
}

async function setPolicyDepartments(
  db: Db,
  companyId: string,
  policyId: string,
  departmentIds: string[],
): Promise<void> {
  await db.from("policy_departments").delete().eq("policy_id", policyId);

  if (departmentIds.length === 0) return;

  // Only departments this company actually has: an id from elsewhere would
  // silently widen the policy's scope to nothing.
  const { data: valid } = await db
    .from("departments")
    .select("id")
    .eq("company_id", companyId)
    .in("id", departmentIds);

  const rows = ((valid ?? []) as { id: string }[]).map((department) => ({
    company_id: companyId,
    policy_id: policyId,
    department_id: department.id,
  }));

  if (rows.length > 0) await db.from("policy_departments").insert(rows);
}

export interface RuleInput {
  title?: string;
  instruction?: string;
  priority?: string;
  enabled?: boolean;
  checkId?: string | null;
  checkConfig?: Record<string, unknown>;
}

function validateRuleInput(input: RuleInput): string | null {
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (title.length === 0 || title.length > RULE_TITLE_MAX) {
      return `Give this rule a title of up to ${RULE_TITLE_MAX} characters.`;
    }
  }
  if (input.instruction !== undefined) {
    const instruction = input.instruction.trim();
    if (instruction.length < RULE_INSTRUCTION_MIN) {
      return `Write the rule out in at least ${RULE_INSTRUCTION_MIN} characters.`;
    }
    if (instruction.length > RULE_INSTRUCTION_MAX) {
      return `Keep the rule under ${RULE_INSTRUCTION_MAX} characters.`;
    }
  }
  if (input.priority !== undefined && !POLICY_PRIORITIES.includes(input.priority as PolicyPriority)) {
    return "That isn't a priority I know.";
  }
  if (input.checkId) {
    if (!getPolicyCheck(input.checkId)) {
      return "That isn't a check I know how to run.";
    }
  }
  return null;
}

export async function addRule(
  policyId: string,
  input: RuleInput,
): Promise<Result<{ ruleId: string }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Policy not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: policy } = await supabase
    .from("company_policies")
    .select("id")
    .eq("id", policyId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!policy) return { error: "Policy not found.", status: 404 };

  if (!input.title?.trim() || !input.instruction?.trim()) {
    return { error: "A rule needs a title and the rule itself.", status: 400 };
  }

  const invalid = validateRuleInput(input);
  if (invalid) return { error: invalid, status: 400 };

  const { count } = await supabase
    .from("policy_rules")
    .select("id", { count: "exact", head: true })
    .eq("policy_id", policyId);

  if ((count ?? 0) >= MAX_RULES_PER_POLICY) {
    return {
      error: `A policy holds up to ${MAX_RULES_PER_POLICY} rules. Split this one.`,
      status: 400,
    };
  }

  const { data: created, error } = await supabase
    .from("policy_rules")
    .insert({
      company_id: companyId,
      policy_id: policyId,
      title: input.title.trim(),
      instruction: input.instruction.trim(),
      priority: input.priority ?? "recommended",
      enabled: input.enabled ?? true,
      check_id: input.checkId ?? null,
      check_config: input.checkConfig ?? {},
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !created) return { error: "I couldn't add this rule.", status: 500 };

  await bumpVersion(supabase, policyId, `Added "${input.title.trim()}".`);

  return { ruleId: created.id as string };
}

export async function updateRule(
  ruleId: string,
  input: RuleInput,
): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Rule not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: existing } = await supabase
    .from("policy_rules")
    .select("id, policy_id, title")
    .eq("id", ruleId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!existing) return { error: "Rule not found.", status: 404 };

  const invalid = validateRuleInput(input);
  if (invalid) return { error: invalid, status: 400 };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changes: string[] = [];
  const title = (existing.title as string) ?? "This rule";

  if (input.title !== undefined) {
    patch.title = input.title.trim();
    changes.push(`Renamed "${title}".`);
  }
  if (input.instruction !== undefined) {
    patch.instruction = input.instruction.trim();
    changes.push(`Reworded "${title}".`);
  }
  if (input.priority !== undefined) {
    patch.priority = input.priority;
    changes.push(`"${title}" is now ${input.priority}.`);
  }
  if (input.enabled !== undefined) {
    patch.enabled = input.enabled;
    changes.push(input.enabled ? `Turned "${title}" on.` : `Turned "${title}" off.`);
  }
  if (input.checkId !== undefined) {
    patch.check_id = input.checkId;
    changes.push(
      input.checkId
        ? `"${title}" is now checked automatically.`
        : `"${title}" is now yours to judge.`,
    );
  }
  if (input.checkConfig !== undefined) {
    patch.check_config = input.checkConfig;
    changes.push(`Adjusted the check on "${title}".`);
  }

  if (changes.length === 0) return { ok: true };

  const { error } = await supabase
    .from("policy_rules")
    .update(patch)
    .eq("id", ruleId);

  if (error) return { error: "I couldn't save this change.", status: 500 };

  await bumpVersion(supabase, existing.policy_id as string, changes.join(" "));

  return { ok: true };
}

export async function deleteRule(ruleId: string): Promise<Result<{ ok: true }>> {
  const context = await getCompanyContext();
  if (!context) return { error: "Rule not found.", status: 404 };

  const { supabase, companyId } = context;

  const { data: existing } = await supabase
    .from("policy_rules")
    .select("id, policy_id, title")
    .eq("id", ruleId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!existing) return { error: "Rule not found.", status: 404 };

  await supabase.from("policy_rules").delete().eq("id", ruleId);

  await bumpVersion(
    supabase,
    existing.policy_id as string,
    `Removed "${existing.title as string}".`,
  );

  return { ok: true };
}
