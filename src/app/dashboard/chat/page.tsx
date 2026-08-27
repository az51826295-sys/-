import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatClient from "./ChatClient";
import type { CompanyEmployee, Employee } from "@/lib/types";

/**
 * 직원과의 대화 — 챗이 곧 작업 지시 창구다.
 *
 * 매니저는 여기서 말로 일을 시키고, 직원은 접수하고, 실행은 기존
 * 엔진이 한다. 폼은 여전히 있지만 더 이상 유일한 문이 아니다.
 */
export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!company) redirect("/company/new");

  const { data: hireRows } = await supabase
    .from("company_employees")
    .select("*, employees(*)")
    .eq("company_id", company.id)
    .eq("onboarding_status", "completed");

  const employees = ((hireRows ?? []) as (CompanyEmployee & { employees: Employee })[]).map(
    (hire) => ({
      companyEmployeeId: hire.id,
      name: hire.employees.name,
      role: hire.employees.role,
      workStatus: hire.work_status,
    }),
  );

  return <ChatClient companyName={company.name} employees={employees} />;
}
