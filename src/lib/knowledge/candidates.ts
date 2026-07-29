import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningContext } from "@/lib/memory/context";
import type { OrganizationCandidate } from "@/lib/knowledge/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * Records what one piece of work suggests the company should adopt.
 *
 * Pending, always. The system is allowed to notice that something worked; it is
 * not allowed to conclude that the company now works that way. That gap is the
 * whole design — without it, one approved deliverable would quietly rewrite how
 * everybody works, and the manager would find their company drifting without
 * having agreed to any of it.
 */
export async function proposeOrganizationLearning(
  db: Db,
  learningSessionId: string,
  context: LearningContext,
  candidates: OrganizationCandidate[],
): Promise<number> {
  if (candidates.length === 0) return 0;

  let proposed = 0;

  for (const candidate of candidates) {
    // Inserted one at a time so the same deliverable proposing the same thing
    // twice is skipped rather than failing the batch. The partial unique index
    // is the check — asking first would race with itself.
    const { error } = await db.from("learning_candidates").insert({
      company_id: context.companyId,
      deliverable_id: context.approvedDeliverable.id,
      assignment_id: context.assignmentId,
      company_employee_id: context.companyEmployeeId,
      learning_session_id: learningSessionId,
      title: candidate.title.trim(),
      summary: candidate.summary.trim(),
      reason: candidate.reason.trim(),
      category: candidate.category,
      confidence: candidate.confidence,
      status: "pending",
    });

    if (!error) proposed += 1;
  }

  return proposed;
}
