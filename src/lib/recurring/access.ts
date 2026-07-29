import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types";
import type { OccurrenceRow, RecurringAssignmentRow } from "@/lib/recurring/types";

export interface OwnedRecurring {
  supabase: Awaited<ReturnType<typeof createClient>>;
  recurring: RecurringAssignmentRow;
  employee: Pick<Employee, "name" | "role" | "slug">;
  companyEmployeeId: string;
}

/**
 * Loads a recurring assignment the current user's company owns, or null.
 *
 * Row level security scopes the table by companies.owner_id, so a miss here
 * means "no such schedule" and "not yours" are indistinguishable — which is the
 * point. Callers answer 404 either way.
 */
export async function getOwnedRecurring(
  recurringAssignmentId: string,
): Promise<OwnedRecurring | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("recurring_assignments")
    .select("*, company_employees(id, employees(name, role, slug))")
    .eq("id", recurringAssignmentId)
    .maybeSingle();

  if (!data) return null;

  const { company_employees: hire, ...recurring } = data as RecurringAssignmentRow & {
    company_employees: {
      id: string;
      employees: Pick<Employee, "name" | "role" | "slug">;
    };
  };

  if (!hire?.employees) return null;

  return {
    supabase,
    recurring: recurring as RecurringAssignmentRow,
    employee: hire.employees,
    companyEmployeeId: hire.id,
  };
}

export async function listOccurrences(
  recurringAssignmentId: string,
  limit = 30,
): Promise<(OccurrenceRow & { assignment_title?: string })[]> {
  const supabase = await createClient();

  // The FK is named explicitly because assignments and occurrences point at
  // each other — an occurrence has an assignment, and an assignment records the
  // occurrence it came from. Without the name PostgREST can't tell which
  // direction is meant and returns nothing at all.
  const { data } = await supabase
    .from("recurring_assignment_occurrences")
    .select(
      "*, assignments!recurring_assignment_occurrences_assignment_id_fkey(title, status)",
    )
    .eq("recurring_assignment_id", recurringAssignmentId)
    .order("scheduled_for", { ascending: false })
    .limit(limit);

  return (data ?? []) as (OccurrenceRow & { assignment_title?: string })[];
}
