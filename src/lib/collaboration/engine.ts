import type { SupabaseClient } from "@supabase/supabase-js";
import { initialProgressSteps } from "@/lib/assignments/progress";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import type { Providers } from "@/lib/execution/shared";
import { setStep } from "@/lib/execution/shared";
import type { EmployeeWorkContextV5 } from "@/lib/execution/context";
import {
  availableCapabilities,
  findColleagues,
  routeCapability,
  type Colleague,
} from "@/lib/collaboration/routing";
import { buildCollaborationPrompt } from "@/lib/collaboration/prompts";
import {
  collaborationDecisionSchema,
  type InternalRequestFailureCode,
} from "@/lib/collaboration/types";
import type { SkillCapability } from "@/lib/skills/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * What a colleague produced, ready to be handed to the employee who asked.
 *
 * Carries the summary rather than the whole document: the requester is writing
 * their own deliverable, not reprinting somebody else's, and a full report
 * pasted into their context would drown their own work.
 */
export interface CollaborationResult {
  requestId: string;
  colleagueName: string;
  colleagueRole: string;
  capabilityLabel: string;
  requestTitle: string;
  /** The colleague's own words, trimmed to what the requester can use. */
  summary: string;
  /** Their headline points, so the requester can cite them specifically. */
  keyPoints: string[];
  childAssignmentId: string;
  childDeliverableId: string;
}

const MAX_SUMMARY_CHARS = 4000;
const MAX_KEY_POINTS = 12;

/**
 * Gives an employee the chance to ask a colleague for help, and runs that help
 * to completion if they do.
 *
 * Everything here is best-effort by design. Collaboration makes a deliverable
 * better; it is never the reason a deliverable fails. If nobody can help, if
 * the colleague's own run fails, or if anything else goes wrong, the requester
 * carries on alone and says so in their limitations — which is what a person
 * would do.
 */
export async function maybeCollaborate(
  db: Db,
  executionId: string,
  providers: Providers,
  context: EmployeeWorkContextV5,
  execution: { company_id: string; assignment_id: string; company_employee_id: string },
  researchSummary: string,
  runChildAssignment: (assignmentId: string) => Promise<boolean>,
): Promise<CollaborationResult | null> {
  try {
    const colleagues = await findColleagues(
      db,
      execution.company_id,
      execution.company_employee_id,
    );

    const offers = availableCapabilities(colleagues);
    if (offers.length === 0) return null;

    // Internal work does not get to spawn its own internal work. One level of
    // delegation is collaboration; two is an org chart nobody asked for.
    const { data: assignment } = await db
      .from("assignments")
      .select("assignment_type, priority")
      .eq("id", execution.assignment_id)
      .maybeSingle();

    if (!assignment || assignment.assignment_type !== "manager") return null;

    const decision = await askWhetherHelpIsNeeded(
      providers,
      context,
      offers,
      researchSummary,
    );

    if (!decision?.needsHelp) return null;

    const colleague = routeCapability(colleagues, decision.capabilityId);
    if (!colleague) return null;

    const capability = colleague.capabilities.find(
      (entry) => entry.id === decision.capabilityId,
    );
    if (!capability) return null;

    await setStep(db, executionId, "requesting_help");

    const { data: request } = await db
      .from("internal_requests")
      .insert({
        company_id: execution.company_id,
        requester_company_employee_id: execution.company_employee_id,
        assignee_company_employee_id: colleague.companyEmployeeId,
        parent_assignment_id: execution.assignment_id,
        title: decision.requestTitle.slice(0, 200),
        description: decision.requestDescription.slice(0, 5000),
        requested_capability: decision.capabilityId,
        priority: assignment.priority ?? "normal",
        status: "pending",
      })
      .select("*")
      .maybeSingle();

    // The partial unique index refuses a second open request for the same need,
    // which is the right answer on a retried run rather than an error.
    if (!request) return null;

    const requestId = request.id as string;

    if (!colleague.available) {
      await failRequest(
        db,
        requestId,
        "NO_COLLEAGUE_AVAILABLE",
        `${colleague.name} was working on something else.`,
      );
      return null;
    }

    return await runRequest(
      db,
      requestId,
      execution,
      colleague,
      capability,
      decision,
      runChildAssignment,
    );
  } catch {
    // Collaboration is an improvement, not a dependency.
    return null;
  }
}

async function askWhetherHelpIsNeeded(
  providers: Providers,
  context: EmployeeWorkContextV5,
  offers: { colleague: Colleague; capability: { id: string; label: string; produces: string } }[],
  researchSummary: string,
) {
  const { system, input } = buildCollaborationPrompt(context, offers, researchSummary);

  try {
    const result = await providers.ai.generateStructuredOutput({
      systemInstructions: system,
      input,
      schema: collaborationDecisionSchema,
      schemaName: "collaboration_decision",
      maxTokens: 8000,
      // Routine: "does this need a colleague, and which skill" is a routing
      // choice against a list the caller already supplies. Small stakes and a
      // 187-token answer across seven calls — cheap either way, and there is
      // no reason for it to be expensive.
      tier: "routine",
    });
    return result.output;
  } catch {
    return null;
  }
}

/**
 * Hands the request to the colleague and waits for it.
 *
 * The colleague's work is an ordinary assignment running through the ordinary
 * engine — same skill, same review discipline, same evidence rules. Only its
 * audience differs, which is why it is marked internal rather than built
 * differently.
 */
async function runRequest(
  db: Db,
  requestId: string,
  execution: { company_id: string; assignment_id: string },
  colleague: Colleague,
  capability: SkillCapability,
  decision: { requestTitle: string; requestDescription: string },
  runChildAssignment: (assignmentId: string) => Promise<boolean>,
): Promise<CollaborationResult | null> {
  const definition = getEmployeeDefinition(colleague.slug);
  if (!definition) {
    await failRequest(db, requestId, "CHILD_CREATE_FAILED", "unknown employee");
    return null;
  }

  const now = new Date().toISOString();

  const { data: child } = await db
    .from("assignments")
    .insert({
      company_id: execution.company_id,
      company_employee_id: colleague.companyEmployeeId,
      title: decision.requestTitle.slice(0, 200),
      description: decision.requestDescription.slice(0, 5000),
      expected_outcome: capability.label,
      priority: "normal",
      status: "assigned",
      current_progress_step: "assignment_received",
      role_input_schema_id: definition.assignmentInputSchemaId,
      // Scoped by the capability rather than left to the standalone defaults,
      // which are sized for a manager's assignment and would fail this errand
      // for returning exactly the handful that was asked for.
      role_input_json: capability.internalRoleInput ?? {},
      assignment_type: "internal",
      parent_assignment_id: execution.assignment_id,
      internal_request_id: requestId,
      source_type: "manual",
    })
    .select("id")
    .maybeSingle();

  if (!child) {
    await failRequest(db, requestId, "CHILD_CREATE_FAILED", "could not create the work");
    return null;
  }

  const childId = child.id as string;

  await db.from("assignment_progress_events").insert(
    initialProgressSteps.map((step, index) => ({
      assignment_id: childId,
      event_type: step.eventType,
      title: step.title,
      sequence: index,
      status: index === 0 ? "completed" : "pending",
      completed_at: index === 0 ? now : null,
    })),
  );

  await db
    .from("internal_requests")
    .update({
      status: "working",
      child_assignment_id: childId,
      started_at: now,
      updated_at: now,
    })
    .eq("id", requestId);

  await db
    .from("company_employees")
    .update({ work_status: "working", current_assignment_id: childId })
    .eq("id", colleague.companyEmployeeId);

  const ok = await runChildAssignment(childId);

  if (!ok) {
    await failRequest(
      db,
      requestId,
      "CHILD_ASSIGNMENT_FAILED",
      `${colleague.name} couldn't complete this work.`,
    );
    await releaseColleague(db, colleague.companyEmployeeId);
    return null;
  }

  const { data: deliverable } = await db
    .from("deliverables")
    .select("id, title, content_json, content_markdown")
    .eq("assignment_id", childId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!deliverable) {
    await failRequest(
      db,
      requestId,
      "CHILD_ASSIGNMENT_FAILED",
      "no result was handed back",
    );
    await releaseColleague(db, colleague.companyEmployeeId);
    return null;
  }

  const completedAt = new Date().toISOString();

  await db
    .from("internal_requests")
    .update({ status: "completed", completed_at: completedAt, updated_at: completedAt })
    .eq("id", requestId);

  // Internal work is finished the moment it is handed over — the manager never
  // reviews it, so the colleague must not be left waiting for a review that
  // will not come.
  await db
    .from("assignments")
    .update({ status: "completed", completed_at: completedAt })
    .eq("id", childId);

  await db
    .from("deliverables")
    .update({ status: "approved", approved_at: completedAt })
    .eq("id", deliverable.id as string);

  await releaseColleague(db, colleague.companyEmployeeId);

  return {
    requestId,
    colleagueName: colleague.name,
    colleagueRole: colleague.role,
    capabilityLabel: capability.label,
    requestTitle: decision.requestTitle,
    ...summarize(deliverable.content_json, deliverable.content_markdown as string),
    childAssignmentId: childId,
    childDeliverableId: deliverable.id as string,
  };
}

/**
 * The colleague's result, cut down to what the requester can actually use.
 *
 * Each deliverable type is summarised on its own terms — a lead list's value is
 * the companies, a report's is its findings — because pasting either one whole
 * into someone else's context buries their work under it.
 */
function summarize(
  contentJson: unknown,
  contentMarkdown: string,
): { summary: string; keyPoints: string[] } {
  const content = contentJson as
    | {
        executiveSummary?: string;
        keyImplications?: string[];
        sections?: { heading: string }[];
        leads?: {
          companyName: string;
          fitLabel?: string;
          fitReasons?: string[];
          websiteUrl?: string;
        }[];
        verifiedCount?: number;
      }
    | null;

  if (content?.leads) {
    const points = content.leads
      .slice(0, MAX_KEY_POINTS)
      .map(
        (lead) =>
          `${lead.companyName} (${lead.websiteUrl ?? "no site recorded"}) — ${lead.fitReasons?.[0] ?? "no reason recorded"}`,
      );

    return {
      summary:
        content.executiveSummary?.slice(0, MAX_SUMMARY_CHARS) ??
        `${content.verifiedCount ?? points.length} companies were verified.`,
      keyPoints: points,
    };
  }

  if (content?.executiveSummary) {
    return {
      summary: content.executiveSummary.slice(0, MAX_SUMMARY_CHARS),
      keyPoints: [
        ...(content.keyImplications ?? []),
        ...(content.sections ?? []).map((section) => section.heading),
      ].slice(0, MAX_KEY_POINTS),
    };
  }

  return {
    summary: (contentMarkdown ?? "").slice(0, MAX_SUMMARY_CHARS),
    keyPoints: [],
  };
}

async function failRequest(
  db: Db,
  requestId: string,
  code: InternalRequestFailureCode,
  message: string,
) {
  const now = new Date().toISOString();
  await db
    .from("internal_requests")
    .update({
      status: "failed",
      failure_code: code,
      failure_message: message.slice(0, 500),
      failed_at: now,
      updated_at: now,
    })
    .eq("id", requestId)
    .in("status", ["pending", "working"]);
}

/** Puts the colleague back where they were. Their own queue is not this
 *  assignment's business, so they return to ready rather than to anything. */
async function releaseColleague(db: Db, companyEmployeeId: string) {
  await db
    .from("company_employees")
    .update({ work_status: "ready", current_assignment_id: null })
    .eq("id", companyEmployeeId);
}
