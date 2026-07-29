import { createClient } from "@/lib/supabase/server";
import type {
  Assignment,
  CompanyEmployee,
  Deliverable,
  DeliverableReview,
  Employee,
} from "@/lib/types";

export interface OwnedDeliverable {
  supabase: Awaited<ReturnType<typeof createClient>>;
  deliverable: Deliverable;
  assignment: Assignment;
  companyEmployee: CompanyEmployee;
  employee: Employee;
  review: DeliverableReview | null;
}

/**
 * Loads a deliverable the current user's company owns, or null. RLS scopes
 * deliverables by companies.owner_id, so another company's id simply misses and
 * callers surface 404 rather than distinguishing "absent" from "not yours".
 */
export async function getOwnedDeliverable(
  deliverableId: string,
): Promise<OwnedDeliverable | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("deliverables")
    .select(
      "*, assignments(*), company_employees!deliverables_company_employee_id_fkey(*, employees(*))",
    )
    .eq("id", deliverableId)
    .maybeSingle();

  if (!data) return null;

  const {
    assignments: assignment,
    company_employees: companyEmployeeRow,
    ...deliverable
  } = data as Deliverable & {
    assignments: Assignment;
    company_employees: CompanyEmployee & { employees: Employee };
  };

  if (!assignment || !companyEmployeeRow) return null;

  const { employees: employee, ...companyEmployee } = companyEmployeeRow;

  const { data: review } = await supabase
    .from("deliverable_reviews")
    .select("*")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DeliverableReview>();

  return {
    supabase,
    deliverable: deliverable as Deliverable,
    assignment,
    companyEmployee,
    employee,
    review: review ?? null,
  };
}
