import { createClient } from "@/lib/supabase/server";
import type { Deliverable, KnowledgeProfile } from "@/lib/types";
import type { MemoryCategory } from "@/lib/memory/types";

export interface LearningContext {
  companyId: string;
  companyEmployeeId: string;
  assignmentId: string;
  employee: { name: string; role: string; slug: string };
  companyKnowledge: {
    companySummary: string;
    customerSummary: string;
    problemSummary: string;
    differentiationSummary?: string;
    competitors?: string[];
    priorities?: string[];
  };
  assignment: { id: string; title: string; description: string };
  approvedDeliverable: {
    id: string;
    version: number;
    title: string;
    contentMarkdown: string;
  };
  managerReviews: {
    id: string;
    decision: "approved" | "needs_changes";
    feedback?: string;
  }[];
  revisionSummaries: { change: string; reason: string }[];
  deliverableSources: { id: string; title: string; domain: string }[];
  existingMemories: {
    id: string;
    category: MemoryCategory;
    title: string;
    content: string;
  }[];
}

export type LearningContextResult =
  | { ok: true; context: LearningContext }
  | { ok: false; missing: string[] };

/**
 * Gathers what the employee should learn from. Only the approved version is
 * read — a superseded draft may contain exactly the mistakes the manager asked
 * to have fixed, and learning those would be worse than learning nothing.
 */
export async function loadLearningContext(
  deliverableId: string,
): Promise<LearningContextResult> {
  const supabase = await createClient();

  const { data: deliverableRow } = await supabase
    .from("deliverables")
    .select(
      "*, assignments(id, title, description), company_employees!deliverables_company_employee_id_fkey(id, employees(name, role, slug))",
    )
    .eq("id", deliverableId)
    .maybeSingle();

  if (!deliverableRow) return { ok: false, missing: ["Deliverable"] };

  const row = deliverableRow as Deliverable & {
    assignments: { id: string; title: string; description: string };
    company_employees: {
      id: string;
      employees: { name: string; role: string; slug: string };
    };
  };

  const missing: string[] = [];
  if (row.status !== "approved") missing.push("Deliverable is not approved");

  const hire = row.company_employees;
  const employee = hire?.employees;
  if (!employee) missing.push("Employee");

  const { data: profile } = await supabase
    .from("employee_knowledge_profiles")
    .select("*")
    .eq("company_employee_id", hire?.id ?? "")
    .maybeSingle<KnowledgeProfile>();

  if (!profile) missing.push("Company knowledge profile");

  if (missing.length > 0 || !employee || !profile) {
    return { ok: false, missing };
  }

  // Reviews across every version, so a preference expressed on v1 still counts
  // even though v1 itself is superseded.
  const { data: versionRows } = await supabase
    .from("deliverables")
    .select("id, revision_summary_json")
    .eq("assignment_id", row.assignment_id);

  const versionIds = (versionRows ?? []).map((v) => v.id as string);

  const { data: reviewRows } = await supabase
    .from("deliverable_reviews")
    .select("id, decision, feedback")
    .in("deliverable_id", versionIds.length > 0 ? versionIds : [row.id]);

  const revisionSummaries = (versionRows ?? []).flatMap(
    (version) =>
      ((version.revision_summary_json ?? []) as {
        change: string;
        reason: string;
      }[]) ?? [],
  );

  const { data: sourceRows } = await supabase
    .from("deliverable_sources")
    .select("research_sources(id, title, domain)")
    .eq("deliverable_id", row.id);

  const deliverableSources = ((sourceRows ?? []) as unknown as {
    research_sources: { id: string; title: string; domain: string } | null;
  }[])
    .map((entry) => entry.research_sources)
    .filter((source): source is { id: string; title: string; domain: string } =>
      Boolean(source),
    );

  const { data: memoryRows } = await supabase
    .from("employee_memories")
    .select("id, category, title, content")
    .eq("company_employee_id", hire.id)
    .in("status", ["active", "pending_review"]);

  return {
    ok: true,
    context: {
      companyId: row.company_id,
      companyEmployeeId: hire.id,
      assignmentId: row.assignment_id,
      employee,
      companyKnowledge: {
        companySummary: profile.company_summary ?? "",
        customerSummary: profile.customer_summary ?? "",
        problemSummary: profile.problem_summary ?? "",
        differentiationSummary: profile.differentiation_summary ?? undefined,
        competitors: profile.competitors ?? [],
        priorities: profile.priorities ?? [],
      },
      assignment: row.assignments,
      approvedDeliverable: {
        id: row.id,
        version: row.version,
        title: row.title,
        contentMarkdown: row.content_markdown,
      },
      managerReviews: (reviewRows ?? []).map((review) => ({
        id: review.id as string,
        decision: review.decision as "approved" | "needs_changes",
        feedback: (review.feedback as string | null) ?? undefined,
      })),
      revisionSummaries,
      deliverableSources,
      existingMemories: (memoryRows ?? []).map((memory) => ({
        id: memory.id as string,
        category: memory.category as MemoryCategory,
        title: memory.title as string,
        content: memory.content as string,
      })),
    },
  };
}
