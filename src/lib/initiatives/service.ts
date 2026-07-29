import { createClient } from "@/lib/supabase/server";
import { getOwnedCompanyEmployee } from "@/lib/onboarding/access";
import { createAssignment } from "@/lib/assignments/service";
import { isFailure, type Result } from "@/lib/assignments/service";
import type { Employee } from "@/lib/types";
import type { InitiativeRow } from "@/lib/initiatives/types";

export interface OwnedInitiative {
  supabase: Awaited<ReturnType<typeof createClient>>;
  initiative: InitiativeRow;
  employee: Pick<Employee, "name" | "role" | "slug">;
  companyEmployeeId: string;
}

/**
 * Loads a proposal the current user's company owns, or null.
 *
 * Row level security scopes initiatives by companies.owner_id, so another
 * company's id simply misses and callers answer 404 — "no such proposal" and
 * "not yours" are deliberately indistinguishable.
 */
export async function getOwnedInitiative(
  initiativeId: string,
): Promise<OwnedInitiative | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("initiatives")
    .select("*, company_employees(id, employees(name, role, slug))")
    .eq("id", initiativeId)
    .maybeSingle();

  if (!data) return null;

  const { company_employees: hire, ...initiative } = data as InitiativeRow & {
    company_employees: {
      id: string;
      employees: Pick<Employee, "name" | "role" | "slug">;
    };
  };

  if (!hire?.employees) return null;

  return {
    supabase,
    initiative: initiative as InitiativeRow,
    employee: hire.employees,
    companyEmployeeId: hire.id,
  };
}

/**
 * Turns an approved proposal into real work.
 *
 * The assignment is built from the snapshot taken when the proposal was
 * written, not from anything re-derived now: the manager approved a specific
 * brief they read, and handing the employee a different one would make the
 * approval meaningless.
 *
 * Goes through the ordinary assignment service, so a proposal-born assignment
 * is subject to the same rules as any other — including the one that says an
 * employee does one thing at a time.
 */
export async function approveInitiative(
  initiativeId: string,
): Promise<Result<{ assignmentId: string }>> {
  const owned = await getOwnedInitiative(initiativeId);
  if (!owned) return { error: "Recommendation not found.", status: 404 };

  const { supabase, initiative, employee, companyEmployeeId } = owned;

  if (initiative.status !== "new") {
    return {
      error:
        initiative.status === "approved"
          ? "You already approved this recommendation."
          : "This recommendation is no longer open.",
      status: 409,
    };
  }

  const hire = await getOwnedCompanyEmployee(companyEmployeeId);
  if (!hire) return { error: "Recommendation not found.", status: 404 };

  const snapshot = initiative.assignment_snapshot;

  const created = await createAssignment(hire, {
    title: snapshot.title,
    description: snapshot.description,
    expectedOutcome: snapshot.expectedOutcome || undefined,
    priority: snapshot.priority === "critical" ? "high" : snapshot.priority,
    roleInput: initiative.role_input_json ?? {},
  });

  if (isFailure(created)) {
    // Most often "already working on something". The proposal stays open so the
    // manager can approve it once the employee is free, rather than losing it.
    return {
      error: created.assignmentId
        ? `${employee.name} is already working on an assignment. Approve this once that work is reviewed.`
        : created.error,
      status: created.status,
    };
  }

  // Claimed with a status filter, so two approvals can't produce two
  // assignments from one proposal.
  const { data: claimed } = await supabase
    .from("initiatives")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      assignment_id: created.assignmentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", initiativeId)
    .eq("status", "new")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { error: "This recommendation was already decided.", status: 409 };
  }

  // Marked as a third origin alongside "manual" and "recurring": the manager
  // approved this rather than writing it, and the assignment page says so.
  await supabase
    .from("assignments")
    .update({ initiative_id: initiativeId, source_type: "initiative" })
    .eq("id", created.assignmentId);

  return { assignmentId: created.assignmentId };
}

/**
 * Records a "no thanks".
 *
 * The refusal is the useful part: it is what stops the same thing being raised
 * again for a month. An employee that keeps re-suggesting what you already
 * turned down is one you stop reading.
 */
export async function dismissInitiative(
  initiativeId: string,
): Promise<Result<{ status: string }>> {
  const supabase = await createClient();

  const { data: dismissed } = await supabase
    .from("initiatives")
    .update({
      status: "dismissed",
      dismissed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", initiativeId)
    .eq("status", "new")
    .select("id")
    .maybeSingle();

  if (!dismissed) {
    const { data: current } = await supabase
      .from("initiatives")
      .select("status")
      .eq("id", initiativeId)
      .maybeSingle();

    if (!current) return { error: "Recommendation not found.", status: 404 };
    return { error: "This recommendation was already decided.", status: 409 };
  }

  return { status: "dismissed" };
}

/** Retires proposals nobody answered. A three-week-old read on a moving market
 *  is not something to act on now. */
export async function expireStaleInitiatives(): Promise<number> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("initiatives")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "new")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  return (data ?? []).length;
}
