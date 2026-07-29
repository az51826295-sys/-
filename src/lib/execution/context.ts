import { createClient } from "@/lib/supabase/server";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import { loadAssignmentPolicySnapshot } from "@/lib/policies/resolve";
import type { PolicySnapshot } from "@/lib/policies/types";
import { loadAssignmentPlaybookSnapshot } from "@/lib/playbooks/resolve";
import type { PlaybookSnapshot } from "@/lib/playbooks/types";
import {
  retrieveCompanyKnowledge,
  type CompanyKnowledgeItem,
} from "@/lib/knowledge/retrieval";
import type { Assignment, KnowledgeProfile } from "@/lib/types";

/**
 * Everything an employee needs to work: who they are, what they were taught
 * about this company during onboarding, and the assignment itself.
 *
 * Loaded through a Supabase client that carries the caller's session, so RLS
 * makes it impossible to assemble a context out of another company's rows.
 */
export interface EmployeeWorkContextV5 {
  employee: {
    id: string;
    slug: string;
    name: string;
    role: string;
    responsibilities: string[];
    workInstructions: string;
    deliverableType: string;
    /**
     * How this person works, in their own terms.
     *
     * Carried into the prompt rather than kept for the profile page. A working
     * style the manager reads but the employee does not follow is a claim the
     * product makes and then breaks — the description has to be the same thing
     * as the behaviour, or choosing between colleagues means nothing.
     */
    workingStyle: string;
  };
  company: {
    name: string;
    website?: string;
  };
  companyKnowledge: {
    companySummary: string;
    customerSummary: string;
    problemSummary: string;
    differentiationSummary?: string;
    competitors?: string[];
    priorities?: string[];
    additionalContext?: string;
  };
  assignment: {
    id: string;
    title: string;
    description: string;
    expectedOutcome?: string;
    priority: "low" | "normal" | "high";
  };
  /** Validated against the role's schema when it was written, so consumers can
   *  parse it without re-deriving what shape this employee stores. */
  roleKnowledge: unknown;
  roleKnowledgeSchemaId: string;
  roleInput: unknown;
  roleInputSchemaId: string;
  skillId: string;
  /**
   * The company's standards as they stood when this work started.
   *
   * Read from the assignment's snapshot rather than resolved fresh, so a policy
   * edited while the work is running cannot change the rules the employee was
   * given halfway through.
   */
  policies: PolicySnapshot | null;
  /**
   * The company's method for this kind of work, as it stood when the work
   * started. Absent where the company has not written one, in which case the
   * employee works to their professional judgement as they did before.
   */
  playbook: PlaybookSnapshot | null;
  /**
   * What the company has learned and adopted, as of now.
   *
   * Deliberately not snapshotted, unlike the standards and the method. Those
   * are rules the work is judged against, so freezing them is fairness. This is
   * knowledge — being told the newest thing the company knows is the point of
   * it, and holding an employee to a stale version would be the bug.
   */
  companyLearning: CompanyKnowledgeItem[];
}

/**
 * The employee's own temperament, addressed to them.
 *
 * Written in the second person and including the trade-offs, because the
 * trade-offs are the part that actually changes behaviour. "Be thorough" is
 * advice nobody can act on; "return eight verified companies rather than thirty
 * maybes" tells them what to do when the two pull against each other.
 */
function renderWorkingStyle(definition: {
  workingStyle: {
    headline: string;
    strengths: string[];
    tradeoffs: string[];
  };
}): string {
  const style = definition.workingStyle;

  return [
    "## How you work",
    "",
    style.headline,
    "",
    ...style.strengths.map((item) => `- ${item}`),
    "",
    "What you give up for it, and should keep giving up:",
    ...style.tradeoffs.map((item) => `- ${item}`),
    "",
    "This is your temperament, not a rule you can be argued out of by the",
    "assignment. Where being quick and being careful pull against each other,",
    "the manager chose you knowing which way you lean — lean that way.",
  ].join("\n");
}

export type ContextResult =
  | { ok: true; context: EmployeeWorkContextV5 }
  | { ok: false; missing: string[] };

/**
 * @param db Supplied by callers with no user session — the scheduler runs on a
 *   timer and has no cookies to build a client from. Defaults to the
 *   session-scoped client, where row level security does the access check.
 */
export async function loadWorkContext(
  assignmentId: string,
  db?: Awaited<ReturnType<typeof createClient>>,
): Promise<ContextResult> {
  const supabase = db ?? (await createClient());

  const { data: assignmentRow } = await supabase
    .from("assignments")
    .select(
      "*, company_employees!assignments_company_employee_id_fkey(*, employees(*)), companies(name, website)",
    )
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignmentRow) {
    return { ok: false, missing: ["Assignment"] };
  }

  const row = assignmentRow as Assignment & {
    company_employees: {
      id: string;
      employees: { slug: string; name: string; role: string };
    };
    companies: { name: string; website: string | null };
  };

  const hire = row.company_employees;
  const employee = hire?.employees;
  const definition = employee ? getEmployeeDefinition(employee.slug) : undefined;

  const { data: profile } = await supabase
    .from("employee_knowledge_profiles")
    .select("*")
    .eq("company_employee_id", hire?.id ?? "")
    .maybeSingle<KnowledgeProfile>();

  // Required context. Anything listed here stops the run before a model is
  // called — an employee that doesn't know the company can't research for it.
  const missing: string[] = [];
  if (!employee?.name) missing.push("Employee name");
  if (!employee?.role) missing.push("Employee role");
  if (!definition?.workInstructions) missing.push("Employee work instructions");
  if (!row.companies?.name) missing.push("Company name");
  if (!profile?.company_summary?.trim()) missing.push("Company summary");
  if (!profile?.customer_summary?.trim()) missing.push("Customer summary");
  if (!profile?.problem_summary?.trim()) missing.push("Problem summary");
  if (!row.title?.trim()) missing.push("Assignment title");
  if (!row.description?.trim()) missing.push("Assignment description");

  if (missing.length > 0 || !employee || !definition || !profile) {
    return { ok: false, missing };
  }

  // Absent is a real answer: a company that has set no standards yet still
  // works. Only a snapshot already taken is used — taking one here would let a
  // read path decide what a run is judged by.
  const policies = await loadAssignmentPolicySnapshot(supabase, assignmentId);
  const playbook = await loadAssignmentPlaybookSnapshot(supabase, assignmentId);
  const companyLearning = await retrieveCompanyKnowledge(
    supabase,
    row.company_id,
  );

  return {
    ok: true,
    context: {
      employee: {
        id: hire.id,
        slug: employee.slug,
        name: employee.name,
        role: employee.role,
        responsibilities: definition.responsibilities,
        workInstructions: definition.workInstructions,
        deliverableType: definition.deliverable.type,
        workingStyle: renderWorkingStyle(definition),
      },
      company: {
        name: row.companies.name,
        website: row.companies.website ?? undefined,
      },
      companyKnowledge: {
        companySummary: profile.company_summary ?? "",
        customerSummary: profile.customer_summary ?? "",
        problemSummary: profile.problem_summary ?? "",
        differentiationSummary: profile.differentiation_summary ?? undefined,
        competitors: profile.competitors ?? [],
        priorities: profile.priorities ?? [],
        additionalContext: profile.additional_context ?? undefined,
      },
      assignment: {
        id: row.id,
        title: row.title,
        description: row.description,
        expectedOutcome: row.expected_outcome ?? undefined,
        priority: row.priority,
      },
      roleKnowledge: profile.role_knowledge_json ?? null,
      roleKnowledgeSchemaId:
        (profile.role_knowledge_schema_id as string | null) ??
        definition.roleKnowledgeSchemaId,
      roleInput: row.role_input_json ?? null,
      roleInputSchemaId:
        (row.role_input_schema_id as string | null) ??
        definition.assignmentInputSchemaId,
      skillId: definition.skillId,
      policies,
      playbook,
      companyLearning,
    },
  };
}
