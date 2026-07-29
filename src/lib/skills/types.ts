import type { createClient } from "@/lib/supabase/server";
import type { Providers } from "@/lib/execution/engine";
import type { EmployeeWorkContextV5 } from "@/lib/execution/context";
import type { RetrievedMemory } from "@/lib/memory/retrieval";
import type { RecurringHistory } from "@/lib/recurring/history";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface SkillRunContext {
  supabase: Supabase;
  executionId: string;
  execution: { company_id: string; assignment_id: string; company_employee_id: string };
  /**
   * Who this work is for.
   *
   * Anything other than "manager" is a contribution to somebody else's result —
   * a colleague's errand or a piece of a project — and the bar for a usable
   * answer is different there: a partial finding they can build on beats being
   * told nothing was found. Only work the manager will read directly keeps the
   * stricter standard.
   */
  assignmentType: "manager" | "internal" | "project";
  providers: Providers;
  context: EmployeeWorkContextV5;
  /** What this employee remembers. Already scoped to the hire, so one
   *  employee's lessons can never reach another's work. */
  memories: RetrievedMemory[];
  /** Set only when this assignment came from a schedule: what the previous
   *  approved turn already covered, so a repeat can look for what's new instead
   *  of restating what it said last time. */
  history?: RecurringHistory;
  /**
   * Runs a colleague's assignment to completion and reports whether it worked.
   *
   * Injected rather than imported because the engine owns execution and the
   * skills are what it executes — a skill reaching back into the engine
   * directly would make the two mutually dependent.
   */
  runChildAssignment: (assignmentId: string) => Promise<boolean>;
}

export interface SkillMetrics {
  searchCount?: number;
  sourceCount?: number;
  candidateCount?: number;
  selectedCount?: number;
}

export interface SkillExecutionResult {
  deliverableId: string;
  deliverableType: string;
  metrics: SkillMetrics;
}

/**
 * How one kind of employee actually works.
 *
 * The execution engine owns everything that is the same for every employee —
 * marking the run started, loading context, recalling memories, recording
 * failure — and hands off here for the part that differs. Nothing in the engine
 * knows that Alex writes reports or that Emma builds lead lists.
 */
/**
 * What one employee can be asked to do for another.
 *
 * Named as a capability rather than as a person, so a requester says "I need
 * companies qualified against our profile" and the system finds whoever can do
 * that. Nothing routes by employee name — adding a colleague who can also
 * qualify leads should not require touching the code that asks.
 */
export interface SkillCapability {
  /** Stable id used in requests and routing. */
  id: string;
  /** How the capability reads to the employee deciding whether they need it. */
  label: string;
  /** What the requester gets back, so they can judge whether it's worth asking. */
  produces: string;
  /**
   * Role input for work done at a colleague's request.
   *
   * A favour is not a full assignment. Asked to check a handful of companies,
   * an employee should not go looking for twenty and fail because it found
   * three — the requester wanted an answer about the companies in front of
   * them, not a standalone prospect list. Only the skill knows what "smaller"
   * means for its own work, so it says here.
   */
  internalRoleInput?: unknown;
}

export interface EmployeeSkill {
  id: string;
  deliverableType: string;
  /** What this skill can be asked for by a colleague. Empty means this employee
   *  does their own work but is not a service to others. */
  capabilities: SkillCapability[];
  /** Whether this employee accepts work from colleagues at all. */
  acceptsInternalRequests: boolean;
  run(ctx: SkillRunContext): Promise<SkillExecutionResult>;
}

export class SkillNotFoundError extends Error {
  constructor(skillId: string) {
    super(`No skill registered for "${skillId}"`);
  }
}
