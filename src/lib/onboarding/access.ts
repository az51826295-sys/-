import { createClient } from "@/lib/supabase/server";
import { getEmployeeDefinition } from "@/lib/employees/definitions";
import type { CompanyEmployee, Employee } from "@/lib/types";

export interface OwnedCompanyEmployee {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  companyEmployee: CompanyEmployee;
  employee: Employee;
}

/**
 * Loads a company_employee the current user owns (via their company), or null.
 * RLS already scopes company_employees/employees to the owner, so a miss here
 * means "not found" and "not yours" are indistinguishable by design.
 */
export async function getOwnedCompanyEmployee(
  companyEmployeeId: string,
): Promise<OwnedCompanyEmployee | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: companyEmployee } = await supabase
    .from("company_employees")
    .select("*, employees(*)")
    .eq("id", companyEmployeeId)
    .maybeSingle();

  if (!companyEmployee) return null;

  const { employees: employee, ...rest } = companyEmployee as CompanyEmployee & {
    employees: Employee;
  };

  return {
    supabase,
    userId: user.id,
    companyEmployee: rest,
    employee,
  };
}

export function getOnboardingQuestions(employee: Employee) {
  const definition = getEmployeeDefinition(employee.slug);
  return definition?.onboardingQuestions ?? [];
}
