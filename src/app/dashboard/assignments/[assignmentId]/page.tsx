import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnedAssignment } from "@/lib/assignments/access";
import { NavBar } from "@/components/NavBar";
import { assignmentStatusLabel, formatAssignedDate } from "@/lib/assignments/labels";
import {
  executionErrorCopy,
  revisionErrorCopy,
  type ExecutionErrorCode,
  type RevisionErrorCode,
} from "@/lib/execution/types";
import { formatInZone } from "@/lib/schedule/time";
import type { createClient } from "@/lib/supabase/server";
import type { AssignmentProgressEvent, Deliverable } from "@/lib/types";
import { listCollaboration } from "@/lib/collaboration/service";
import { usageForAssignment } from "@/lib/costs/service";
import { CostSummary } from "@/components/CostSummary";
import { ExecutionMonitor } from "./ExecutionMonitor";
import { RetryButton } from "./RetryButton";
import { Collaboration } from "./Collaboration";

/** The schedule this assignment came from, when it came from one. Lets the
 *  manager move between a single piece of work and the standing job behind it. */
async function loadRecurringSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recurringAssignmentId: string | null,
  occurrenceId: string | null,
): Promise<{
  id: string;
  title: string;
  timezone: string;
  scheduledFor: string | null;
} | null> {
  if (!recurringAssignmentId) return null;

  const { data: recurring } = await supabase
    .from("recurring_assignments")
    .select("id, title, timezone")
    .eq("id", recurringAssignmentId)
    .maybeSingle();

  if (!recurring) return null;

  let scheduledFor: string | null = null;
  if (occurrenceId) {
    const { data: occurrence } = await supabase
      .from("recurring_assignment_occurrences")
      .select("scheduled_for")
      .eq("id", occurrenceId)
      .maybeSingle();
    scheduledFor = (occurrence?.scheduled_for as string | null) ?? null;
  }

  return {
    id: recurring.id as string,
    title: recurring.title as string,
    timezone: recurring.timezone as string,
    scheduledFor,
  };
}

const markers: Record<string, string> = {
  completed: "✓",
  active: "●",
  pending: "○",
  failed: "✗",
};

export default async function AssignmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ error?: string; start?: string }>;
}) {
  const { assignmentId } = await params;
  const { error, start } = await searchParams;
  const owned = await getOwnedAssignment(assignmentId);

  if (!owned) {
    notFound();
  }

  const { supabase, assignment, companyEmployee, employee } = owned;

  const { data: progressRows } = await supabase
    .from("assignment_progress_events")
    .select("*")
    .eq("assignment_id", assignment.id)
    .order("sequence");

  const progress = (progressRows ?? []) as AssignmentProgressEvent[];

  // Newest version only; older ones stay reachable from its Version History.
  const { data: deliverable } = await supabase
    .from("deliverables")
    .select("*")
    .eq("assignment_id", assignment.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<Deliverable>();

  const { data: revisionRequest } = await supabase
    .from("revision_requests")
    .select("id, feedback, status, target_version")
    .eq("assignment_id", assignment.id)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A revision that failed is still a revision in progress from the manager's
  // point of view — their feedback is what the retry will act on, so it stays
  // on screen.
  const isRevising =
    ["needs_changes", "revision_queued", "revising"].includes(assignment.status) ||
    (revisionRequest !== null &&
      ["pending", "queued", "in_progress", "failed"].includes(
        revisionRequest.status as string,
      ));

  const { data: execution } = await supabase
    .from("work_executions")
    .select(
      "id, status, current_step, attempt_number, error_code, error_message, search_request_count, source_fetch_count",
    )
    .eq("assignment_id", assignment.id)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isFailed = execution?.status === "failed";
  const isRunning = execution?.status === "running" || execution?.status === "queued";

  // Revision failures have their own vocabulary — "couldn't complete the
  // requested revision" reads very differently from "couldn't do the research".
  const failureCopy = isFailed
    ? (revisionErrorCopy[execution.error_code as RevisionErrorCode] ??
      executionErrorCopy[execution.error_code as ExecutionErrorCode] ??
      executionErrorCopy.UNKNOWN_ERROR)
    : null;

  const contextIncomplete = execution?.error_code === "CONTEXT_INCOMPLETE";

  const recurringSource = await loadRecurringSource(
    owned.supabase,
    assignment.recurring_assignment_id as string | null,
    assignment.recurring_occurrence_id as string | null,
  );

  const collaboration = await listCollaboration(assignmentId);
  const usage = await usageForAssignment(assignmentId);

  const { data: initiativeSource } = assignment.initiative_id
    ? await owned.supabase
        .from("initiatives")
        .select("id, title")
        .eq("id", assignment.initiative_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900">{assignment.title}</h1>

        <div className="mt-4 flex gap-8">
          <div>
            <p className="text-xs text-zinc-500">Assigned to</p>
            <Link
              href={`/dashboard/employees/${companyEmployee.id}`}
              className="mt-1 block text-sm font-medium text-zinc-900 underline"
            >
              {employee.name}
            </Link>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Status</p>
            <p className="mt-1 text-sm font-medium text-zinc-900">
              {isFailed ? "Needs attention" : assignmentStatusLabel[assignment.status]}
            </p>
          </div>
        </div>

        {/* Only for scheduled work. A one-off assignment has no schedule behind
            it and this block would be an empty promise. */}
        {recurringSource && (
          <div className="mt-6 flex items-center justify-between rounded-lg border border-zinc-200 px-5 py-4">
            <div>
              <p className="text-xs text-zinc-500">Created from recurring assignment</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900">
                {recurringSource.title}
              </p>
              {recurringSource.scheduledFor && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  Scheduled for{" "}
                  {formatInZone(
                    new Date(recurringSource.scheduledFor),
                    recurringSource.timezone,
                  )}
                </p>
              )}
            </div>
            <Link
              href={`/dashboard/recurring-assignments/${recurringSource.id}`}
              className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              View Recurring Assignment
            </Link>
          </div>
        )}

        {/* Where this work came from, when it wasn't the manager typing it. */}
        {initiativeSource && (
          <div className="mt-6 flex items-center justify-between rounded-lg border border-zinc-200 px-5 py-4">
            <div>
              <p className="text-xs text-zinc-500">
                Started from {employee.name}&apos;s recommendation
              </p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900">
                {initiativeSource.title}
              </p>
            </div>
            <Link
              href={`/dashboard/initiatives/${initiativeSource.id}`}
              className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              View Recommendation
            </Link>
          </div>
        )}

        <Collaboration requests={collaboration} />

        <CostSummary usage={usage} />

        {error && (
          <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <ExecutionMonitor
          assignmentId={assignment.id}
          executionId={execution?.id ?? null}
          shouldStart={start === "1" && !execution && !deliverable}
          employeeName={employee.name}
        />

        {isRevising && revisionRequest?.feedback && (
          <div className="mt-6 rounded-lg bg-blue-50 px-5 py-4">
            <p className="text-sm font-medium text-blue-900">Manager Feedback</p>
            <p className="mt-1 whitespace-pre-line text-sm text-blue-800">
              {revisionRequest.feedback}
            </p>
          </div>
        )}

        {isFailed && (
          <div className="mt-6 rounded-lg bg-amber-50 p-5">
            <p className="font-medium text-amber-900">{employee.name} needs attention</p>
            <p className="mt-1 text-sm text-amber-800">
              {employee.name} {failureCopy}
            </p>

            {/*
              What specifically went wrong, when the employee knows.

              Most failures have nothing useful to add — a search that timed out
              is a search that timed out. But work rejected for contradicting
              itself knows exactly which line contradicted which, and that
              sentence is the whole reason the run stopped instead of trying
              again at full price. Hiding it would leave the manager with a bill
              and no way to write a better brief.
            */}
            {execution?.error_code === "SELF_INCONSISTENT" &&
              execution.error_message && (
                <p className="mt-2 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
                  {execution.error_message}
                </p>
              )}
            {revisionRequest?.status === "failed" && (
              <p className="mt-2 text-sm text-amber-800">
                Your original deliverable and feedback have been preserved.
              </p>
            )}
            <div className="mt-4 flex items-center gap-3">
              {contextIncomplete ? (
                <Link
                  href={`/dashboard/employees/${companyEmployee.id}/onboarding/review`}
                  className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Review Company Training
                </Link>
              ) : (
                <RetryButton
                  executionId={execution.id}
                  employeeName={employee.name}
                  revisionRequestId={
                    revisionRequest?.status === "failed"
                      ? (revisionRequest.id as string)
                      : null
                  }
                />
              )}
            </div>
          </div>
        )}

        <section className="mt-8 rounded-lg border border-zinc-200 p-8">
          <h2 className="text-sm font-medium text-zinc-900">Assignment Details</h2>

          <div className="mt-6 space-y-6">
            <div>
              <p className="text-xs text-zinc-500">Context</p>
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">
                {assignment.description}
              </p>
            </div>

            {assignment.expected_outcome && (
              <div>
                <p className="text-xs text-zinc-500">Expected Result</p>
                <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">
                  {assignment.expected_outcome}
                </p>
              </div>
            )}

            <div className="flex gap-8">
              <div>
                <p className="text-xs text-zinc-500">Priority</p>
                <p className="mt-1 text-sm capitalize text-zinc-700">
                  {assignment.priority}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Assigned</p>
                <p className="mt-1 text-sm text-zinc-700">
                  {formatAssignedDate(assignment.assigned_at)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {execution && (execution.search_request_count > 0 || execution.source_fetch_count > 0) && (
          <section className="mt-6 rounded-lg border border-zinc-200 p-8">
            <h2 className="text-sm font-medium text-zinc-900">Research</h2>
            <div className="mt-4 flex gap-8">
              <div>
                <p className="text-xs text-zinc-500">Searches completed</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {execution.search_request_count}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Sources reviewed</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {execution.source_fetch_count}
                </p>
              </div>
              {deliverable && deliverable.source_count > 0 && (
                <div>
                  <p className="text-xs text-zinc-500">Sources cited</p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900">
                    {deliverable.source_count}
                  </p>
                </div>
              )}
              {execution.attempt_number > 1 && (
                <div>
                  <p className="text-xs text-zinc-500">Attempt</p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900">
                    {execution.attempt_number}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {deliverable && (
          <section className="mt-6 rounded-lg border border-zinc-200 p-8">
            <h2 className="text-sm font-medium text-zinc-900">Deliverable</h2>
            <p className="mt-3 font-medium text-zinc-900">{deliverable.title}</p>
            <p className="mt-1 text-sm text-zinc-500">
              Submitted by {employee.name}
              {deliverable.source_count > 0 &&
                ` · ${deliverable.source_count} sources cited`}
            </p>
            {deliverable.submitted_at && (
              <p className="mt-0.5 text-xs text-zinc-400">
                Submitted {formatAssignedDate(deliverable.submitted_at)}
              </p>
            )}
            <Link
              href={`/dashboard/deliverables/${deliverable.id}`}
              className="mt-4 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Review Deliverable
            </Link>
          </section>
        )}

        {progress.length > 0 && !isRunning && (
          <section className="mt-6 rounded-lg border border-zinc-200 p-8">
            <h2 className="text-sm font-medium text-zinc-900">Work Progress</h2>
            <ul className="mt-4 space-y-2">
              {progress.map((event) => (
                <li
                  key={event.id}
                  className={`flex items-center gap-3 text-sm ${
                    event.status === "pending" ? "text-zinc-400" : "text-zinc-900"
                  }`}
                >
                  <span aria-hidden className="w-3">
                    {markers[event.status] ?? markers.pending}
                  </span>
                  <span className={event.status === "active" ? "font-medium" : undefined}>
                    {event.title}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
