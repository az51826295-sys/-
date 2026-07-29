import { createClient } from "@/lib/supabase/server";
import type { Assignment, CompanyEmployee, Employee } from "@/lib/types";

export interface OwnedAssignment {
  supabase: Awaited<ReturnType<typeof createClient>>;
  assignment: Assignment;
  companyEmployee: CompanyEmployee;
  employee: Employee;
}

/**
 * Loads an assignment the current user's company owns, or null. RLS scopes
 * assignments by companies.owner_id, so another company's id simply misses —
 * callers should surface 404 rather than distinguishing "absent" from "theirs".
 */
export async function getOwnedAssignment(
  assignmentId: string,
): Promise<OwnedAssignment | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Two foreign keys connect assignments and company_employees (the assignee,
  // and the employee's current_assignment_id back-reference), so the embed has
  // to name the one it means.
  const { data } = await supabase
    .from("assignments")
    .select(
      "*, company_employees!assignments_company_employee_id_fkey(*, employees(*))",
    )
    .eq("id", assignmentId)
    .maybeSingle();

  if (!data) return null;

  const { company_employees: companyEmployeeRow, ...assignment } = data as Assignment & {
    company_employees: CompanyEmployee & { employees: Employee };
  };

  if (!companyEmployeeRow) return null;

  const { employees: employee, ...companyEmployee } = companyEmployeeRow;

  return {
    supabase,
    assignment: assignment as Assignment,
    companyEmployee,
    employee,
  };
}
